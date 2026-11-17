import { Activity } from 'lucide-react'

export default function Brand({ compact = false, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-[var(--accent-fill)] bg-[var(--accent-fill)] text-[var(--accent-ink)]">
        <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
        <Activity className="relative h-[19px] w-[19px]" strokeWidth={2.4} />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[21px] leading-none text-app">NetPulse</span>
            <span className="border border-accent/40 bg-accent/10 px-1 py-0.5 font-mono text-[8px] font-bold tracking-[0.18em] text-accent">AI</span>
          </div>
          <p className="mt-1.5 font-mono text-[7.5px] font-bold uppercase tracking-[0.22em] text-subtle">Network Intelligence</p>
        </div>
      )}
    </div>
  )
}
