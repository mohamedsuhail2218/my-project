#!/usr/bin/env node
/**
 * Authorised network-flow shipper.
 *
 * Tails Zeek `conn.log` (TSV or NDJSON), Suricata `eve.json` or any JSON-lines
 * NetFlow exporter output and forwards the records to the Digital Twin Cyber
 * War network-flow API. Packet capture and analysis stay on the sensor you
 * control; this script only ships records the sensor already wrote to disk.
 *
 * Usage:
 *   node collectors/flow-shipper.mjs --token dtcw_... --format zeek-tsv \
 *     --sensor zeek-01 --file /opt/zeek/logs/current/conn.log
 *
 *   tail -F /var/log/suricata/eve.json \
 *     | node collectors/flow-shipper.mjs --stdin --format suricata --token dtcw_...
 *
 *   node collectors/flow-shipper.mjs --token dtcw_... --once \
 *     --file ./fixtures/flows.ndjson
 *
 * The token is a workspace-scoped telemetry token created in
 * Settings → Security & access. It can also be supplied as DTCW_INGEST_TOKEN.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_QUEUE = 20_000;
const MAX_REMAINDER = 2 * 1024 * 1024;
const FORMATS = new Set(["auto", "zeek", "zeek-tsv", "suricata", "netflow", "generic"]);

const HELP = `Authorised network-flow shipper for Digital Twin Cyber War

Usage
  node collectors/flow-shipper.mjs [options] [--file <path> ...]

Options
  --file <path>       NDJSON / Zeek TSV file to read (repeatable)
  --stdin             Read JSON-lines or Zeek TSV from standard input
  --format <name>     auto | zeek | zeek-tsv | suricata | netflow | generic
                      Default: auto (detects Zeek TSV, Zeek JSON, Suricata and NetFlow)
  --sensor <name>     Sensor label attached to every flow. Default: hostname
  --url <url>         API base URL. Default: http://127.0.0.1:8787
  --token <token>     Workspace ingestion token. Default: DTCW_INGEST_TOKEN
  --batch <n>         Records per HTTP request (1-500). Default: 100
  --interval <ms>     Poll/flush interval in milliseconds. Default: 2000
  --once              Read the current file contents, flush and exit
  --from-end          Start at the end of existing files (follow new data only)
  --help              Show this help

Environment
  DTCW_API_URL, DTCW_INGEST_TOKEN, NETWORK_FLOW_FORMAT, NETWORK_FLOW_SENSOR

Examples
  # Zeek with the default TSV conn.log
  node collectors/flow-shipper.mjs --token "$DTCW_INGEST_TOKEN" \\
    --format zeek-tsv --sensor zeek-edge-01 --file /opt/zeek/logs/current/conn.log

  # Suricata eve.json, streamed through stdin
  tail -F /var/log/suricata/eve.json | node collectors/flow-shipper.mjs \\
    --stdin --format suricata --token "$DTCW_INGEST_TOKEN"

  # Backfill a NetFlow JSON-lines export once
  node collectors/flow-shipper.mjs --once --format netflow \\
    --file ./netflow-export.ndjson --token "$DTCW_INGEST_TOKEN"
`;

function fail(message) {
  console.error(`flow-shipper: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    files: [],
    stdin: false,
    format: process.env.NETWORK_FLOW_FORMAT || "auto",
    sensor: process.env.NETWORK_FLOW_SENSOR || os.hostname(),
    url: process.env.DTCW_API_URL || "http://127.0.0.1:8787",
    token: process.env.DTCW_INGEST_TOKEN || "",
    batch: 100,
    interval: 2000,
    once: false,
    fromEnd: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) fail(`${arg} requires a value.`);
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--stdin") options.stdin = true;
    else if (arg === "--once") options.once = true;
    else if (arg === "--from-end") options.fromEnd = true;
    else if (arg === "--file") options.files.push(next());
    else if (arg === "--format") options.format = next().toLowerCase();
    else if (arg === "--sensor") options.sensor = next();
    else if (arg === "--url") options.url = next();
    else if (arg === "--token") options.token = next();
    else if (arg === "--batch") options.batch = Number(next());
    else if (arg === "--interval") options.interval = Number(next());
    else if (arg.startsWith("-")) fail(`unknown option ${arg}. Use --help.`);
    else options.files.push(arg);
  }

  if (!FORMATS.has(options.format)) {
    fail(`unknown format "${options.format}". Choose ${[...FORMATS].join(", ")}.`);
  }
  if (!Number.isInteger(options.batch) || options.batch < 1 || options.batch > 500) {
    fail("--batch must be an integer between 1 and 500.");
  }
  if (!Number.isInteger(options.interval) || options.interval < 250) {
    fail("--interval must be an integer of at least 250ms.");
  }
  options.url = options.url.replace(/\/+$/, "");
  options.sensor = String(options.sensor || "sensor").slice(0, 120);
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function convertZeekValue(raw, type) {
  if (raw === undefined || raw === "-") return "";
  const value = String(raw);
  if (type === "bool") return value === "T" || value === "true";
  if (["count", "int", "port", "double", "time", "interval"].includes(type)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : "";
  }
  return value;
}

/**
 * A line parser that understands Zeek's TSV header (#separator, #fields,
 * #types) as well as plain JSON-lines. One parser is kept per file so a header
 * is not lost when a file is rotated or truncated.
 */
function createParser(format) {
  const initialMode =
    format === "zeek-tsv"
      ? "zeek-tsv"
      : format === "auto" || format === "zeek"
        ? "unknown"
        : "json";
  const state = {
    mode: initialMode,
    separator: "\t",
    fields: null,
    types: null,
    remainder: "",
  };

  function parseZeekHeader(line) {
    if (line.startsWith("#separator")) {
      const value = line.slice("#separator".length).trim();
      state.separator = value
        .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\t/g, "\t");
      return true;
    }
    if (line.startsWith("#fields")) {
      state.fields = line.split(state.separator).slice(1);
      return true;
    }
    if (line.startsWith("#types")) {
      state.types = line.split(state.separator).slice(1);
      return true;
    }
    return line.startsWith("#");
  }

  function parseZeekRow(line) {
    if (!state.fields) return null;
    const cells = line.split(state.separator);
    if (cells.length < 2) return null;
    const record = {};
    state.fields.forEach((field, index) => {
      const type = state.types?.[index] || "";
      record[field] = convertZeekValue(cells[index], type);
    });
    return record;
  }

  return {
    push(text, emit) {
      const chunk = state.remainder + text;
      const lines = chunk.split(/\r?\n/);
      state.remainder = lines.pop() || "";
      if (state.remainder.length > MAX_REMAINDER) {
        // A file without a trailing newline must not grow memory without bound.
        state.remainder = state.remainder.slice(-MAX_REMAINDER);
      }
      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line) continue;
        if (state.mode === "unknown") {
          state.mode = line.startsWith("#separator") || line.startsWith("#fields")
            ? "zeek-tsv"
            : "json";
        }
        if (state.mode === "zeek-tsv") {
          if (parseZeekHeader(line)) continue;
          const record = parseZeekRow(line);
          if (record) emit(record);
          continue;
        }
        try {
          const record = JSON.parse(line);
          if (record && typeof record === "object") emit(record);
        } catch {
          // Ignore malformed lines; the sensor may still be writing a record.
        }
      }
    },
    reset() {
      state.fields = null;
      state.types = null;
      state.remainder = "";
      state.mode = initialMode;
    },
    finish(emit) {
      // A file or stream may end without a trailing newline. Try the final
      // buffered line once at end-of-input rather than losing it.
      const line = state.remainder.trim();
      state.remainder = "";
      if (!line) return;
      if (state.mode === "unknown") {
        state.mode =
          line.startsWith("#separator") || line.startsWith("#fields") ? "zeek-tsv" : "json";
      }
      if (state.mode === "zeek-tsv") {
        if (parseZeekHeader(line)) return;
        const record = parseZeekRow(line);
        if (record) emit(record);
        return;
      }
      try {
        const record = JSON.parse(line);
        if (record && typeof record === "object") emit(record);
      } catch {
        // Leave an incomplete record unparsed at end-of-input.
      }
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (!options.token) {
    fail("a workspace ingestion token is required. Set DTCW_INGEST_TOKEN or pass --token.");
  }
  if (!options.stdin && options.files.length === 0) {
    fail("provide at least one --file or use --stdin. Use --help for examples.");
  }

  const endpoint = `${options.url}/api/network/flows`;
  const queue = [];
  let dropped = 0;
  let rejected = 0;
  let sent = 0;
  let lastError = "";
  let backoff = 1000;

  function enqueue(record) {
    if (queue.length >= MAX_QUEUE) {
      queue.shift();
      dropped += 1;
      if (dropped === 1 || dropped % 100 === 0) {
        console.error(`flow-shipper: queue full, dropped ${dropped} record(s) at the sensor.`);
      }
    }
    queue.push(record);
  }

  async function flush() {
    while (queue.length > 0) {
      const batch = queue.slice(0, options.batch);
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            format: options.format === "zeek-tsv" ? "zeek" : options.format,
            sensor: options.sensor,
            flows: batch,
          }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        lastError = error?.message || String(error);
        console.error(
          `flow-shipper: delivery failed (${lastError}); ${queue.length} record(s) buffered. ` +
            `Retrying in ${Math.round(backoff / 1000)}s.`
        );
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
        continue;
      }

      const bodyText = await response.text();
      const detail = bodyText.slice(0, 300);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          fail(`the ingestion token was rejected (HTTP ${response.status}). Create a new token.`);
        }
        if (response.status === 404) {
          fail(`the API route was not found at ${endpoint}. Check --url.`);
        }
        if ([400, 413, 422].includes(response.status)) {
          // A malformed batch will never succeed on retry. Drop it and keep the
          // rest of the stream moving; the server detail is logged for triage.
          rejected += batch.length;
          queue.splice(0, batch.length);
          console.error(
            `flow-shipper: rejected ${batch.length} record(s) (HTTP ${response.status} · ${detail}).`
          );
          continue;
        }
        lastError = `HTTP ${response.status} · ${detail}`;
        console.error(
          `flow-shipper: delivery failed (${lastError}); ${queue.length} record(s) buffered. ` +
            `Retrying in ${Math.round(backoff / 1000)}s.`
        );
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
        continue;
      }

      let payload = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        // The success path only needs `accepted` for logging; a non-JSON body is
        // tolerated because the HTTP status is authoritative.
      }
      queue.splice(0, batch.length);
      sent += batch.length;
      backoff = 1000;
      if (lastError) {
        console.log(`flow-shipper: recovered, accepted ${payload.accepted ?? batch.length} flow(s).`);
        lastError = "";
      } else {
        console.log(
          `flow-shipper: accepted ${payload.accepted ?? batch.length} flow(s) from ${options.sensor}` +
            (payload.detections?.length ? `, ${payload.detections.length} detection update(s).` : ".")
        );
      }
    }
  }

  const sources = new Map();
  function addFile(file) {
    const resolved = path.resolve(file);
    let size = 0;
    try {
      size = fs.statSync(resolved).size;
    } catch {
      console.error(`flow-shipper: waiting for ${resolved} to appear.`);
    }
    sources.set(resolved, {
      file: resolved,
      offset: options.fromEnd ? size : 0,
      parser: createParser(options.format),
      inode: null,
    });
  }
  options.files.forEach(addFile);

  function readFile(source) {
    let stat;
    try {
      stat = fs.statSync(source.file);
    } catch {
      return;
    }
    if (source.inode !== null && stat.ino && source.inode !== stat.ino) {
      // The collector's file was replaced (log rotation): restart cleanly.
      source.offset = 0;
      source.parser.reset();
    }
    source.inode = stat.ino || null;
    if (stat.size < source.offset) {
      // Rotation/truncation: start from the beginning and forget the old header.
      source.offset = 0;
      source.parser.reset();
    }
    const maxRead = 4 * 1024 * 1024;
    while (stat.size > source.offset) {
      const length = Math.min(stat.size - source.offset, maxRead);
      const buffer = Buffer.alloc(length);
      const descriptor = fs.openSync(source.file, "r");
      try {
        fs.readSync(descriptor, buffer, 0, length, source.offset);
      } finally {
        fs.closeSync(descriptor);
      }
      source.offset += length;
      source.parser.push(buffer.toString("utf8"), enqueue);
      if (length < maxRead) break;
    }
  }

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nflow-shipper: stopping after flushing buffered records.");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  if (options.stdin) {
    process.stdin.setEncoding("utf8");
    const parser = createParser(options.format);
    for await (const chunk of process.stdin) {
      parser.push(chunk, enqueue);
      if (queue.length >= options.batch) await flush();
      if (stopping) break;
    }
    parser.finish(enqueue);
    await flush();
    console.log(`flow-shipper: stdin closed. ${sent} flow(s) accepted.`);
    return;
  }

  let lastFlush = Date.now();
  while (!stopping) {
    sources.forEach(readFile);
    const due = queue.length >= options.batch || Date.now() - lastFlush >= options.interval;
    if (due) {
      await flush();
      lastFlush = Date.now();
    }
    if (options.once) break;
    await sleep(Math.min(500, options.interval));
  }

  sources.forEach((source) => source.parser.finish(enqueue));
  await flush();
  console.log(
    `flow-shipper: stopped. ${sent} flow(s) accepted` +
      (rejected ? `, ${rejected} rejected by the API` : "") +
      (dropped ? `, ${dropped} dropped while the buffer was full.` : ".")
  );
}

export { createParser };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error?.message || String(error)));
}
