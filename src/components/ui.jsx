import React, { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { classNames } from "../lib/format";
import { riskLabel, statusTone } from "../lib/engine";
import { useApp } from "../state/AppState";

/* ------------------------------------------------------------------ */
/* Layout & headers                                                    */
/* ------------------------------------------------------------------ */

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-title-block">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, icon, action, children, footer, className, bodyClassName, flush = false }) {
  return (
    <section className={classNames("panel", className)}>
      {(title || action) && (
        <div className="panel-header">
          <div>
            {title && (
              <div className="panel-title">
                {icon && <span className="icon">{icon}</span>}
                {title}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {flush ? children : <div className={classNames("panel-body", bodyClassName)}>{children}</div>}
      {footer && <div className="panel-footer">{footer}</div>}
    </section>
  );
}

export function Notice({ tone = "info", children, className }) {
  const Icon = tone === "danger" || tone === "warning" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={classNames("notice", tone, className)}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, detail, action }) {
  return (
    <div className="empty-state">
      {icon}
      {title && <div className="strong">{title}</div>}
      {detail && <div className="small">{detail}</div>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stats & scores                                                      */
/* ------------------------------------------------------------------ */

const TONE_ACCENTS = {
  critical: "rgba(248, 113, 113, 0.18)",
  high: "rgba(251, 146, 60, 0.16)",
  medium: "rgba(251, 191, 36, 0.14)",
  low: "rgba(96, 165, 250, 0.14)",
  success: "rgba(52, 211, 153, 0.14)",
  info: "rgba(34, 211, 238, 0.14)",
  violet: "rgba(167, 139, 250, 0.16)",
};

export function StatCard({ label, value, unit, icon, foot, delta, deltaTone, tone, accent }) {
  return (
    <div className="stat-card" style={{ "--accent": accent || TONE_ACCENTS[tone] || TONE_ACCENTS.info }}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value-row">
        <span className="stat-value">{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {(foot || delta) && (
        <div className="stat-foot">
          {delta && <span className={classNames("stat-delta", deltaTone)}>{delta}</span>}
          {foot && <span>{foot}</span>}
        </div>
      )}
    </div>
  );
}

const RING_COLORS = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#fbbf24",
  low: "#60a5fa",
  success: "#34d399",
};

export function RiskRing({ score = 0, size = 138, label = "RISK / 100" }) {
  const tone = riskLabel(score).tone;
  const color = RING_COLORS[tone];
  const stroke = 8;
  const radius = (size - stroke) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;

  return (
    <div className="risk-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ color }}
        />
      </svg>
      <div className="risk-ring-center">
        <strong style={{ color }}>{score}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ScoreRing({ value = 0, size = 48, tone = "violet" }) {
  const stroke = 4;
  const radius = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const colors = { violet: "#a78bfa", cyan: "#22d3ee", red: "#f87171", green: "#34d399", amber: "#fbbf24" };
  const color = colors[tone] || colors.violet;
  return (
    <div className="score-ring-sm" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <div className="center" style={{ color }}>{value}</div>
    </div>
  );
}

export function Progress({ value = 0, tone }) {
  return (
    <div className={classNames("progress", tone)}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Sparkline({ values = [], color = "#22d3ee", height = 46 }) {
  const id = useId().replace(/[:]/g, "");
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const width = 240;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - 4 - ((value - min) / range) * (height - 10);
    return `${x},${y}`;
  });
  const line = points.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export function Badge({ tone = "neutral", children, dot = false, className }) {
  return (
    <span className={classNames("badge", tone, className)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  return <Badge tone={severity}>{severity}</Badge>;
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone(status)}>{String(status || "unknown").replaceAll("-", " ")}</Badge>;
}

export function Tag({ tone, children }) {
  return <span className={classNames("tag", tone)}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function useOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

export function Modal({ open = true, title, subtitle, onClose, children, footer, wide = false }) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={classNames("modal", wide && "wide")} role="dialog" aria-modal="true" aria-label={title || "Dialog"}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="small muted mt-6">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn bare" onClick={onClose} aria-label="Close dialog">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open = true, title, subtitle, onClose, children, footer }) {
  useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title || "Details"}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="small muted mt-6">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn bare" onClick={onClose} aria-label="Close panel">
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-actions">{footer}</div>}
      </aside>
    </>,
    document.body
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", tone = "danger", onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={classNames("btn", tone === "danger" ? "danger" : "primary")}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="small soft" style={{ lineHeight: 1.65 }}>{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

const TOAST_ICONS = {
  danger: XCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

function ToastItem({ toast, onRemove }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5200);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const Icon = TOAST_ICONS[toast.tone] || Info;
  return (
    <div className={classNames("toast", toast.tone)} role="status">
      <div className="toast-icon"><Icon /></div>
      <div style={{ minWidth: 0 }}>
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button type="button" className="toast-close" onClick={() => onRemove(toast.id)} aria-label="Dismiss notification">
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const { state, dispatch } = useApp();
  if (!state.toasts.length) return null;
  return (
    <div className="toast-viewport">
      {state.toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={(id) => dispatch({ type: "REMOVE_TOAST", id })}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Simple presentational helpers                                       */
/* ------------------------------------------------------------------ */

export function UserAvatar({ name = "", size = "" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return <span className={classNames("avatar", size)}>{initials || "?"}</span>;
}

export function MetaGrid({ items }) {
  return (
    <div className="result-meta-grid">
      {items.map((item) => (
        <div className="result-meta" key={item.k}>
          <div className="k">{item.k}</div>
          <div className="v">{item.v}</div>
        </div>
      ))}
    </div>
  );
}
