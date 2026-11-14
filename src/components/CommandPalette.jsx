import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import AssetIcon from "./AssetIcon";
import { useApp } from "../state/AppState";
import { SCENARIOS } from "../data/mock";

function normalize(value) {
  return String(value || "").toLowerCase();
}

export default function CommandPalette({ open, onClose, navigation }) {
  const { state } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const groups = useMemo(() => {
    if (!open) return [];
    return [
      {
        label: "Navigate",
        items: navigation.map((item) => ({
          id: item.to,
          label: item.label,
          sublabel: item.group,
          type: "nav",
          to: item.to,
          icon: item.icon,
        })),
      },
      {
        label: "Twin assets",
        items: state.assets.map((asset) => ({
          id: asset.id,
          label: asset.name,
          sublabel: `${asset.label} · ${asset.ip || asset.zone}`,
          type: "asset",
          to: `/app/twin/builder?asset=${asset.id}`,
          assetType: asset.type,
        })),
      },
      {
        label: "Detections",
        items: state.detections.slice(0, 10).map((detection) => ({
          id: detection.id,
          label: detection.title,
          sublabel: `${detection.id} · ${detection.severity}`,
          type: "detection",
          to: `/app/hunter/detections?focus=${detection.id}`,
          icon: null,
        })),
      },
      {
        label: "Incidents",
        items: state.incidents.map((incident) => ({
          id: incident.id,
          label: incident.title,
          sublabel: `${incident.id} · ${incident.status}`,
          type: "incident",
          to: `/app/hunter/incidents/${incident.id}`,
        })),
      },
      {
        label: "Scenarios",
        items: SCENARIOS.map((scenario) => ({
          id: scenario.id,
          label: scenario.name,
          sublabel: `${scenario.severity} · ${scenario.steps.length} hops`,
          type: "scenario",
          to: `/app/twin/simulations?scenario=${scenario.id}`,
        })),
      },
    ];
  }, [open, navigation, state.assets, state.detections, state.incidents]);

  const filtered = useMemo(() => {
    const q = normalize(query).trim();
    if (!q) {
      return groups.map((group) => ({ ...group, items: group.items.slice(0, 5) }));
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          normalize(`${item.label} ${item.sublabel} ${item.id}`).includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((group) => group.items), [filtered]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKey = (event) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(flat.length - 1, index + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && flat[active]) {
        event.preventDefault();
        navigate(flat[active].to);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, active, navigate, onClose]);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-active="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let flatIndex = -1;

  return createPortal(
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette-modal" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Search />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, assets, detections, scenarios…"
            aria-label="Search command palette"
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="palette-results" ref={listRef}>
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <Search size={24} />
              <div className="small">No matches for “{query}”.</div>
            </div>
          )}
          {filtered.map((group) => (
            <div key={group.label}>
              <div className="palette-group-label">{group.label}</div>
              {group.items.map((item) => {
                flatIndex += 1;
                const index = flatIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    className={`palette-item${active === index ? " active" : ""}`}
                    data-active={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      navigate(item.to);
                      onClose();
                    }}
                  >
                    {item.type === "asset" ? <AssetIcon type={item.assetType} /> : Icon ? <Icon /> : <Search />}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="truncate" style={{ display: "block" }}>{item.label}</span>
                      <span className="small dim truncate" style={{ display: "block" }}>{item.sublabel}</span>
                    </span>
                    <span className="kbd">{item.type.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span><span className="kbd">esc</span> close</span>
          <span style={{ marginLeft: "auto" }}>{flat.length} results</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
