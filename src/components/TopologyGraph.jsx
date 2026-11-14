import React from "react";
import { ZONES, ASSET_TYPES, CRITICALITY } from "../data/mock";
import { assetRisk } from "../lib/engine";
import { classNames } from "../lib/format";

const ZONE_HEIGHTS = {
  edge: 390,
  dmz: 390,
  app: 350,
  data: 390,
  cloud: 400,
};

const NODE_W = 96;
const NODE_H = 40;

function keyOf(from, to) {
  return `${from}->${to}`;
}

export default function TopologyGraph({
  assets,
  edges,
  selectedId,
  onSelect,
  steps = [],
  showZones = true,
  className,
}) {
  const assetById = Object.fromEntries(assets.map((asset) => [asset.id, asset]));

  const stepByEdge = new Map();
  steps.forEach((step) => {
    if (!step?.from || !step?.to) return;
    const direct = keyOf(step.from, step.to);
    const reverse = keyOf(step.to, step.from);
    const existing = stepByEdge.get(direct) || stepByEdge.get(reverse);
    if (!existing || step.status === "blocked") {
      stepByEdge.set(direct, step);
    }
  });

  const baseEdgeKeys = new Set(
    edges.flatMap((edge) => [keyOf(edge.from, edge.to), keyOf(edge.to, edge.from)])
  );

  const extraLinks = [];
  const seenExtra = new Set();
  steps.forEach((step) => {
    if (!step?.from || !step?.to) return;
    const key = keyOf(step.from, step.to);
    if (baseEdgeKeys.has(key) || baseEdgeKeys.has(keyOf(step.to, step.from))) return;
    if (seenExtra.has(key)) return;
    if (!assetById[step.from] || !assetById[step.to]) return;
    seenExtra.add(key);
    extraLinks.push({ id: `extra-${key}`, from: step.from, to: step.to, label: "attack" });
  });

  const links = [...edges, ...extraLinks];

  const compromised = new Set();
  steps.forEach((step) => {
    if (step.status !== "success") return;
    compromised.add(step.from);
    compromised.add(step.to);
  });

  function stepFor(link) {
    return stepByEdge.get(keyOf(link.from, link.to)) || stepByEdge.get(keyOf(link.to, link.from)) || null;
  }

  function renderLink(link) {
    const source = assetById[link.from];
    const target = assetById[link.to];
    if (!source || !target) return null;
    const step = stepFor(link);
    const attack = step?.status === "success";
    const blocked = step?.status === "blocked";
    return (
      <line
        key={link.id}
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        className={classNames("topo-link", attack && "active-path", blocked && "blocked-path")}
      >
        <title>
          {source.name} → {target.name}
          {link.label ? ` · ${link.label}` : ""}
          {step ? ` · ${step.status}` : ""}
        </title>
      </line>
    );
  }

  const orderedLinks = [...links.filter((link) => !stepFor(link)), ...links.filter((link) => stepFor(link))];

  return (
    <div className={classNames("topology-canvas", className)}>
      <svg viewBox="0 0 900 540" role="img" aria-label="Digital twin network topology">
        {showZones &&
          Object.entries(ZONES).map(([zoneId, zone]) => (
            <g key={zoneId}>
              <rect
                className="topo-zone"
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={ZONE_HEIGHTS[zoneId] || zone.h}
                rx="8"
              />
              <text className="topo-zone-label" x={zone.x + 11} y={zone.y + 16}>
                {zone.label}
              </text>
            </g>
          ))}

        {orderedLinks.map(renderLink)}

        {assets.map((asset) => {
          const meta = ASSET_TYPES[asset.type] || ASSET_TYPES.app;
          const crit = CRITICALITY[asset.criticality] || CRITICALITY.medium;
          const risk = assetRisk(asset);
          const selected = selectedId === asset.id;
          const isCompromised = compromised.has(asset.id);
          const label = asset.name || asset.label || asset.id;
          const sub = `${meta.short} · ${crit.label}`;
          return (
            <g
              key={asset.id}
              className={classNames("topo-node", selected && "selected", isCompromised && "compromised")}
              transform={`translate(${asset.x}, ${asset.y})`}
              onClick={() => onSelect?.(asset)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(asset);
                }
              }}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? "button" : undefined}
              aria-label={`${label}, ${meta.label}, risk ${risk}`}
            >
              <title>{`${label} · ${asset.ip || asset.id} · risk ${risk}`}</title>
              <rect className="node-box" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx="7" />
              <rect
                className="node-accent"
                x={-NODE_W / 2 + 1}
                y={-NODE_H / 2 + 1}
                width="2.5"
                height={NODE_H - 2}
                rx="1"
                fill={meta.color}
              />
              {selected && <circle className="pulse-ring" cx="0" cy="0" r="24" />}
              <text className="node-name" x={-NODE_W / 2 + 11} y="-2">
                {label.length > 14 ? `${label.slice(0, 13)}…` : label}
              </text>
              <text className="node-type" x={-NODE_W / 2 + 11} y="10">
                {sub}
              </text>
              <circle
                cx={NODE_W / 2 - 10}
                cy={-NODE_H / 2 + 10}
                r="3"
                fill={risk >= 80 ? "#f87171" : risk >= 60 ? "#fb923c" : risk >= 40 ? "#fbbf24" : "#34d399"}
                opacity="0.9"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TopologyLegend({ children }) {
  return (
    <div className="topology-legend">
      <span><i className="legend-swatch" /> Approved link</span>
      <span><i className="legend-swatch attack" /> Attacker movement</span>
      <span><i className="legend-swatch blocked" /> Control blocked</span>
      {children}
    </div>
  );
}
