export default function ChartTooltip({ active, payload, label, unit = '', decimals = 1 }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border px-3 py-2 shadow-2xl" style={{ background: 'var(--panel-solid)', borderColor: 'var(--border-strong)' }}>
      <p className="mb-1.5 text-[9px] font-medium text-subtle">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey || item.name} className="flex items-center justify-between gap-4 text-[10px]">
            <span className="flex items-center gap-1.5" style={{ color: item.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>
              {item.value === null || item.value === undefined ? '—' : Number(item.value).toFixed(decimals)}{unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
