import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import Brand from '../components/Brand'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-app bg-accent/[0.05] text-accent">
        <Compass className="h-6 w-6" />
      </div>
      <p className="eyebrow">404 · Signal lost</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-app">This route is off the network map</h1>
      <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">The page you requested does not exist in the NetPulse workspace.</p>
      <Link to="/" className="btn-primary mt-6"><ArrowLeft className="h-4 w-4" /> Return to overview</Link>
      <div className="mt-10 opacity-50"><Brand compact /></div>
    </div>
  )
}
