import { Activity } from 'lucide-react'

export default function Brand({ compact = false, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-accent/25 bg-gradient-to-br from-accent/25 via-accent-strong/10 to-gold/10 shadow-glow">
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <Activity className="relative h-[19px] w-[19px] text-accent" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[17px] font-bold tracking-tight text-app">NetPulse</span>
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.16em] text-accent">AI</span>
          </div>
          <p className="mt-1.5 text-[8.5px] font-medium uppercase tracking-[0.2em] text-subtle">Network Intelligence</p>
        </div>
      )}
    </div>
  )
}
