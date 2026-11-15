import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Layers,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Unlink,
  Wrench,
} from "lucide-react";
import { useApp } from "../../state/AppState";
import TopologyGraph, { TopologyLegend } from "../../components/TopologyGraph";
import AssetIcon from "../../components/AssetIcon";
import {
  Badge,
  ConfirmDialog,
  Modal,
  PageHeader,
  Panel,
  StatCard,
} from "../../components/ui";
import { ASSET_TYPES, CONTROL_LABELS, CRITICALITY, ZONES } from "../../data/mock";
import { KEY_CONTROLS, assetRisk } from "../../lib/engine";
import { timeAgo } from "../../lib/format";

const EMPTY_DRAFT = {
  name: "",
  label: "",
  type: "app",
  zone: "app",
  criticality: "medium",
  exposure: 0.5,
  ip: "",
  owner: "Platform Team",
  services: "",
};

function defaultCoordinates(zoneId, assets) {
  const zone = ZONES[zoneId] || ZONES.app;
  const count = assets.filter((asset) => asset.zone === zoneId).length;
  return {
    x: Math.round(zone.x + zone.w / 2),
    y: Math.min(zone.y + zone.h - 35, zone.y + 58 + count * 54),
  };
}

export default function NetworkBuilder() {
  const { state, dispatch, risk } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("asset");
  const [selectedId, setSelectedId] = useState(
    requested && state.assets.some((asset) => asset.id === requested)
      ? requested
      : state.assets[0]?.id || null
  );
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(EMPTY_DRAFT);
  const [assetDraft, setAssetDraft] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [linkDraft, setLinkDraft] = useState({ from: selectedId || "", to: "", label: "" });

  const selectedAsset = state.assets.find((asset) => asset.id === selectedId) || null;

  useEffect(() => {
    setAssetDraft(
      selectedAsset
        ? {
            name: selectedAsset.name,
            label: selectedAsset.label,
            type: selectedAsset.type,
            zone: selectedAsset.zone,
            criticality: selectedAsset.criticality,
            exposure: selectedAsset.exposure,
            ip: selectedAsset.ip || "",
            owner: selectedAsset.owner || "",
            services: (selectedAsset.services || []).join(", "),
          }
        : null
    );
    setLinkDraft((draft) => ({ ...draft, from: selectedAsset?.id || draft.from }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedAsset?.id]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return state.assets;
    return state.assets.filter((asset) =>
      `${asset.name} ${asset.label} ${asset.id} ${asset.ip} ${asset.owner} ${asset.type}`
        .toLowerCase()
        .includes(query)
    );
  }, [state.assets, search]);

  const edgesForSelected = selectedAsset
    ? state.edges.filter((edge) => edge.from === selectedAsset.id || edge.to === selectedAsset.id)
    : [];
  const incidentEdges = state.edges.length ? state.edges : [];
  const selectedRisk = selectedAsset ? assetRisk(selectedAsset) : 0;
  const controlsPresent = new Set(state.assets.flatMap((asset) => asset.controls));

  const selectAsset = (asset) => {
    setSelectedId(asset.id);
    setSearchParams({ asset: asset.id }, { replace: true });
  };

  const openAdd = (type) => {
    const meta = ASSET_TYPES[type] || ASSET_TYPES.app;
    setAddDraft({
      ...EMPTY_DRAFT,
      type,
      label: meta.label,
      name: "",
      zone:
        type === "firewall"
          ? "edge"
          : ["web", "vpn", "email"].includes(type)
          ? "dmz"
          : ["domain", "storage", "database"].includes(type)
          ? "data"
          : ["workstation", "cloud", "ci"].includes(type)
          ? "cloud"
          : "app",
    });
    setAddOpen(true);
  };

  const submitAdd = (event) => {
    event.preventDefault();
    const name = addDraft.name.trim();
    if (!name) return;
    const placement = defaultCoordinates(addDraft.zone, state.assets);
    dispatch({
      type: "ADD_ASSET",
      asset: {
        ...addDraft,
        name,
        label: addDraft.label.trim() || name,
        ip: addDraft.ip.trim(),
        owner: addDraft.owner.trim(),
        exposure: Number(addDraft.exposure),
        services: addDraft.services
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        controls: [],
        seeds: [],
        ...placement,
      },
    });
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setSelectedId(id);
    setSearchParams({ asset: id }, { replace: true });
    setAddOpen(false);
  };

  const saveAsset = (event) => {
    event.preventDefault();
    if (!selectedAsset || !assetDraft) return;
    dispatch({
      type: "UPDATE_ASSET",
      id: selectedAsset.id,
      patch: {
        name: assetDraft.name.trim() || selectedAsset.name,
        label: assetDraft.label.trim() || selectedAsset.label,
        type: assetDraft.type,
        zone: assetDraft.zone,
        criticality: assetDraft.criticality,
        exposure: Number(assetDraft.exposure),
        ip: assetDraft.ip.trim(),
        owner: assetDraft.owner.trim(),
        services: assetDraft.services
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    });
    dispatch({
      type: "PUSH_TOAST",
      toast: {
        title: "Asset updated",
        message: `${assetDraft.name || selectedAsset.name} was saved to the twin model.`,
        tone: "success",
      },
    });
  };

  const toggleControl = (control) => {
    if (!selectedAsset) return;
    const nextControls = selectedAsset.controls.includes(control)
      ? selectedAsset.controls.filter((item) => item !== control)
      : [...selectedAsset.controls, control];
    dispatch({
      type: "UPDATE_ASSET",
      id: selectedAsset.id,
      patch: { controls: nextControls },
    });
  };

  const addLink = (event) => {
    event.preventDefault();
    if (!linkDraft.from || !linkDraft.to) return;
    dispatch({
      type: "ADD_EDGE",
      edge: {
        from: linkDraft.from,
        to: linkDraft.to,
        label: linkDraft.label.trim() || "approved",
      },
    });
    setLinkDraft((draft) => ({ ...draft, to: "", label: "" }));
  };

  const removeAsset = () => {
    if (!removeTarget) return;
    dispatch({ type: "REMOVE_ASSET", id: removeTarget.id });
    if (removeTarget.id === selectedId) {
      const next = state.assets.find((asset) => asset.id !== removeTarget.id);
      setSelectedId(next?.id || null);
    }
    setRemoveTarget(null);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${state.org.name} · Digital twin`}
        title="Build the network once. Break it as often as you need."
        subtitle="Change structure, services and controls in the safe model. Every edit updates attack paths and risk immediately."
        actions={
          <>
            <button
              type="button"
              className="btn outline"
              onClick={() => dispatch({ type: "SYNC_TWIN" })}
            >
              <RefreshCw /> Sync twin
            </button>
            <button type="button" className="btn primary" onClick={() => openAdd("app")}>
              <Plus /> Add asset
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Assets" value={state.assets.length} icon={<Server />} tone="info" foot={`${Object.keys(ASSET_TYPES).length} supported types`} />
        <StatCard label="Approved links" value={state.edges.length} icon={<Link2 />} tone="violet" foot="Validated firewall paths" />
        <StatCard label="Control families" value={controlsPresent.size} icon={<Wrench />} tone="success" foot={`${KEY_CONTROLS.length} key controls tracked`} />
        <StatCard label="Overall risk" value={risk.score} unit="/ 100" icon={<GitBranch />} tone={risk.score >= 70 ? "critical" : "high"} foot={`Coverage ${risk.coverage}%`} />
      </div>

      <div className="builder-layout mt-12">
        <div className="stack">
          <Panel title="Asset palette" icon={<Layers size={15} />}>
            <div className="palette-title">Add a node</div>
            <div className="palette-grid mt-8">
              {Object.entries(ASSET_TYPES).map(([type, meta]) => (
                <button type="button" className="palette-type" key={type} onClick={() => openAdd(type)}>
                  <AssetIcon type={type} size={13} />
                  {meta.label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            title="Asset inventory"
            icon={<Server size={15} />}
            action={<span className="small-meta">{filteredAssets.length}</span>}
          >
            <div className="input-icon" style={{ marginBottom: 10 }}>
              <Search />
              <input
                className="input"
                placeholder="Search assets, IPs, owners…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="asset-list">
              {filteredAssets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  className={`asset-row${asset.id === selectedId ? " active" : ""}`}
                  onClick={() => selectAsset(asset)}
                >
                  <AssetIcon type={asset.type} />
                  <span className="truncate">{asset.name}</span>
                  <span className="risk">{assetRisk(asset)}</span>
                </button>
              ))}
              {filteredAssets.length === 0 && <div className="empty-inline">No assets match that search.</div>}
            </div>
          </Panel>
        </div>

        <Panel
          className="topology-panel"
          title="Twin topology"
          icon={<GitBranch size={15} />}
          action={
            <div className="row" style={{ gap: 6 }}>
              <Badge tone="success" dot>Approved</Badge>
              <span className="small-meta">{timeAgo(state.lastSyncedAt)}</span>
            </div>
          }
          flush
        >
          <TopologyGraph
            assets={state.assets}
            edges={state.edges}
            selectedId={selectedId}
            onSelect={selectAsset}
            className="builder-graph"
          />
          <TopologyLegend>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5 }}>
              {state.assets.length} nodes · {incidentEdges.length} links
            </span>
          </TopologyLegend>
          <div className="asset-peek">
            <span className="peek-name">
              {selectedAsset ? <AssetIcon type={selectedAsset.type} size={14} /> : <Server size={14} />}
              {selectedAsset?.name || "No asset selected"}
            </span>
            <span className="peek-meta">
              {selectedAsset ? `${ASSET_TYPES[selectedAsset.type]?.label} · ${selectedAsset.ip || "no address"}` : "Select a node"}
            </span>
            <Link className="peek-link link icon-inline" to={`/app/twin/attack-paths?scenario=${state.scenarios.find((scenario) => scenario.target === selectedId)?.id || ""}`}>
              View exposure <ChevronRight size={12} />
            </Link>
          </div>
        </Panel>

        <div className="stack">
          {selectedAsset && assetDraft ? (
            <Panel
              title="Inspector"
              icon={<Server size={15} />}
              action={<Badge tone={selectedRisk >= 70 ? "critical" : selectedRisk >= 50 ? "high" : "success"}>Risk {selectedRisk}</Badge>}
            >
              <form onSubmit={saveAsset}>
                <div className="form-grid">
                  <div className="field">
                    <label>Hostname</label>
                    <input
                      className="input"
                      value={assetDraft.name}
                      onChange={(event) => setAssetDraft({ ...assetDraft, name: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Label</label>
                    <input
                      className="input"
                      value={assetDraft.label}
                      onChange={(event) => setAssetDraft({ ...assetDraft, label: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <select
                      className="select"
                      value={assetDraft.type}
                      onChange={(event) => setAssetDraft({ ...assetDraft, type: event.target.value })}
                    >
                      {Object.entries(ASSET_TYPES).map(([type, meta]) => (
                        <option value={type} key={type}>{meta.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Zone</label>
                    <select
                      className="select"
                      value={assetDraft.zone}
                      onChange={(event) => setAssetDraft({ ...assetDraft, zone: event.target.value })}
                    >
                      {Object.entries(ZONES).map(([zone, meta]) => (
                        <option value={zone} key={zone}>{meta.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Criticality</label>
                    <select
                      className="select"
                      value={assetDraft.criticality}
                      onChange={(event) => setAssetDraft({ ...assetDraft, criticality: event.target.value })}
                    >
                      {Object.entries(CRITICALITY).map(([level, meta]) => (
                        <option value={level} key={level}>{meta.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Exposure · {Math.round(assetDraft.exposure * 100)}%</label>
                    <input
                      className="input"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={assetDraft.exposure}
                      onChange={(event) => setAssetDraft({ ...assetDraft, exposure: Number(event.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>IP / address</label>
                    <input
                      className="input"
                      value={assetDraft.ip}
                      onChange={(event) => setAssetDraft({ ...assetDraft, ip: event.target.value })}
                      placeholder="10.30.20.11"
                    />
                  </div>
                  <div className="field">
                    <label>Owner</label>
                    <input
                      className="input"
                      value={assetDraft.owner}
                      onChange={(event) => setAssetDraft({ ...assetDraft, owner: event.target.value })}
                    />
                  </div>
                  <div className="field span-2">
                    <label>Services (comma separated)</label>
                    <input
                      className="input"
                      value={assetDraft.services}
                      onChange={(event) => setAssetDraft({ ...assetDraft, services: event.target.value })}
                      placeholder="HTTPS 8443, Node 20"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => setRemoveTarget(selectedAsset)}
                  >
                    <Trash2 /> Remove
                  </button>
                  <button type="submit" className="btn primary sm">
                    <CheckCircle2 /> Save asset
                  </button>
                </div>
              </form>

              <div className="drawer-section" style={{ paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>
                <div className="label">Controls · click to toggle</div>
                <div className="control-toggle-grid">
                  {KEY_CONTROLS.map((control) => {
                    const on = selectedAsset.controls.includes(control);
                    return (
                      <button
                        type="button"
                        className={`control-toggle${on ? " on" : ""}`}
                        key={control}
                        onClick={() => toggleControl(control)}
                        aria-pressed={on}
                      >
                        <span className="box"><CheckCircle2 /></span>
                        <span className="t">{CONTROL_LABELS[control] || control}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="notice mt-12">
                  <Wrench />
                  <div>Controls are attached to the target asset and used immediately when attack paths are evaluated.</div>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Inspector" icon={<Server size={15} />}>
              <div className="inspector-empty">
                <Search size={20} />
                <div className="strong">No asset selected.</div>
                <div className="small">Pick an asset in the inventory or on the topology.</div>
              </div>
            </Panel>
          )}

          <Panel title="Links" icon={<Link2 size={15} />} action={<span className="small-meta">{edgesForSelected.length} attached</span>}>
            <form onSubmit={addLink} className="stack-6">
              <div className="form-grid">
                <div className="field">
                  <label>From</label>
                  <select
                    className="select"
                    value={linkDraft.from}
                    onChange={(event) => setLinkDraft({ ...linkDraft, from: event.target.value })}
                  >
                    <option value="">Select asset</option>
                    {state.assets.map((asset) => (
                      <option value={asset.id} key={asset.id}>{asset.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>To</label>
                  <select
                    className="select"
                    value={linkDraft.to}
                    onChange={(event) => setLinkDraft({ ...linkDraft, to: event.target.value })}
                  >
                    <option value="">Select asset</option>
                    {state.assets.map((asset) => (
                      <option value={asset.id} key={asset.id}>{asset.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field span-2">
                  <label>Port / protocol label</label>
                  <input
                    className="input"
                    value={linkDraft.label}
                    onChange={(event) => setLinkDraft({ ...linkDraft, label: event.target.value })}
                    placeholder="443/tcp"
                  />
                </div>
              </div>
              <button type="submit" className="btn outline sm block" disabled={!linkDraft.from || !linkDraft.to}>
                <Plus /> Add link
              </button>
            </form>

            <div className="edge-list mt-12">
              {edgesForSelected.map((edge) => {
                const from = state.assets.find((asset) => asset.id === edge.from);
                const to = state.assets.find((asset) => asset.id === edge.to);
                return (
                  <div className="edge-row" key={edge.id}>
                    <Link2 size={11} />
                    <span>{from?.name || edge.from} → {to?.name || edge.to}</span>
                    <span style={{ opacity: 0.6 }}>{edge.label}</span>
                    <button
                      type="button"
                      className="del"
                      onClick={() => dispatch({ type: "REMOVE_EDGE", id: edge.id })}
                      aria-label={`Remove link ${from?.name} to ${to?.name}`}
                    >
                      <Unlink size={11} />
                    </button>
                  </div>
                );
              })}
              {edgesForSelected.length === 0 && (
                <div className="empty-inline">No links attached to this asset.</div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={addOpen}
        title="Add an asset to the twin"
        subtitle="The asset is created in the safe model with no controls attached."
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" form="add-asset-form" className="btn primary"><Plus /> Add asset</button>
          </>
        }
      >
        <form id="add-asset-form" onSubmit={submitAdd}>
          <div className="form-grid">
            <div className="field">
              <label>Hostname</label>
              <input
                className="input"
                value={addDraft.name}
                onChange={(event) => setAddDraft({ ...addDraft, name: event.target.value })}
                placeholder="e.g. payments-02"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Label</label>
              <input
                className="input"
                value={addDraft.label}
                onChange={(event) => setAddDraft({ ...addDraft, label: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Type</label>
              <select
                className="select"
                value={addDraft.type}
                onChange={(event) => {
                  const meta = ASSET_TYPES[event.target.value];
                  setAddDraft({ ...addDraft, type: event.target.value, label: meta?.label || addDraft.label });
                }}
              >
                {Object.entries(ASSET_TYPES).map(([type, meta]) => (
                  <option value={type} key={type}>{meta.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Zone</label>
              <select
                className="select"
                value={addDraft.zone}
                onChange={(event) => setAddDraft({ ...addDraft, zone: event.target.value })}
              >
                {Object.entries(ZONES).map(([zone, meta]) => (
                  <option value={zone} key={zone}>{meta.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Criticality</label>
              <select
                className="select"
                value={addDraft.criticality}
                onChange={(event) => setAddDraft({ ...addDraft, criticality: event.target.value })}
              >
                {Object.entries(CRITICALITY).map(([level, meta]) => (
                  <option value={level} key={level}>{meta.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Exposure · {Math.round(addDraft.exposure * 100)}%</label>
              <input
                className="input"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={addDraft.exposure}
                onChange={(event) => setAddDraft({ ...addDraft, exposure: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label>IP / address</label>
              <input
                className="input"
                value={addDraft.ip}
                onChange={(event) => setAddDraft({ ...addDraft, ip: event.target.value })}
                placeholder="10.30.20.40"
              />
            </div>
            <div className="field">
              <label>Owner</label>
              <input
                className="input"
                value={addDraft.owner}
                onChange={(event) => setAddDraft({ ...addDraft, owner: event.target.value })}
              />
            </div>
            <div className="field span-2">
              <label>Services (comma separated)</label>
              <input
                className="input"
                value={addDraft.services}
                onChange={(event) => setAddDraft({ ...addDraft, services: event.target.value })}
                placeholder="HTTPS 443, Node 20"
              />
            </div>
          </div>
          <div className="notice mt-16">
            <GitBranch />
            <div>New assets are placed in the selected zone. Add links manually or from the inspector after creation.</div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name || "asset"}?`}
        message="The asset and every attached link will be removed from the twin. Historical simulations and evidence are not deleted."
        confirmLabel="Remove asset"
        onConfirm={removeAsset}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
