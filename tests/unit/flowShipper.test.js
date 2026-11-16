import { describe, expect, it } from "vitest";
import { createParser } from "../../collectors/flow-shipper.mjs";

describe("flow-shipper parser", () => {
  it("parses Zeek TSV headers and typed rows", () => {
    const parser = createParser("auto");
    const records = [];
    parser.push(
      [
        "#separator \\x09",
        "#set_separator\t,",
        "#empty_field\t(empty)",
        "#unset_field\t-",
        "#path\tconn",
        "#fields\tts\tuid\tid.orig_h\tid.orig_p\tid.resp_h\tid.resp_p\tproto\tduration\torig_bytes\tconn_state",
        "#types\ttime\tstring\taddr\tport\taddr\tport\tenum\tinterval\tcount\tstring",
        "1770000000.500000\tC1\t203.0.113.10\t41000\t10.20.0.10\t443\ttcp\t0.250000\t120\tS0",
        "",
      ].join("\n"),
      (record) => records.push(record)
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      ts: 1770000000.5,
      uid: "C1",
      "id.orig_h": "203.0.113.10",
      "id.orig_p": 41000,
      "id.resp_h": "10.20.0.10",
      "id.resp_p": 443,
      proto: "tcp",
      duration: 0.25,
      orig_bytes: 120,
      conn_state: "S0",
    });
  });

  it("parses Suricata/Zeek JSON lines and preserves partial lines", () => {
    const parser = createParser("auto");
    const records = [];
    const first = {
      timestamp: "2026-11-16T12:00:00.000Z",
      event_type: "alert",
      src_ip: "203.0.113.20",
      dest_ip: "10.20.0.10",
      dest_port: 22,
      alert: { signature: "ET SCAN SSH" },
    };
    const second = {
      timestamp: "2026-11-16T12:00:01.000Z",
      event_type: "flow",
      src_ip: "203.0.113.20",
      dest_ip: "10.20.0.10",
      dest_port: 23,
    };
    const encoded = `${JSON.stringify(first)}\n${JSON.stringify(second)}`;
    const split = encoded.indexOf("\n") + 1;

    parser.push(encoded.slice(0, split + 4), (record) => records.push(record));
    expect(records).toHaveLength(1);
    expect(records[0].src_ip).toBe("203.0.113.20");

    parser.push(encoded.slice(split + 4), (record) => records.push(record));
    expect(records).toHaveLength(1);
    parser.finish((record) => records.push(record));
    expect(records).toHaveLength(2);
    expect(records[1].dest_port).toBe(23);
  });

  it("ignores malformed JSON without dropping later records", () => {
    const parser = createParser("suricata");
    const records = [];
    parser.push(
      'not-json\n{"src_ip":"198.51.100.5","dest_ip":"10.20.0.10","dest_port":8080}\n',
      (record) => records.push(record)
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ src_ip: "198.51.100.5", dest_port: 8080 });
  });
});
