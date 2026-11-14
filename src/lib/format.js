export function timeAgo(value) {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "—";
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDuration(ms) {
  if (!ms || ms < 1000) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function uid(prefix = "ID") {
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now()
    .toString()
    .slice(-3)}`;
}

export function downloadFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let string = value == null ? "" : String(value);
  // Neutralize spreadsheet formula injection before quoting. Quoting alone does
  // not stop Excel from evaluating a cell that begins with =, +, -, @, tab or CR.
  if (/^[=+\-@\t\r]/.test(string)) string = `'${string}`;
  return `"${string.replaceAll('"', '""')}"`;
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => csvCell(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvCell(column.value(row))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function truncate(value, max = 80) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
