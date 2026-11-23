import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import { Spinner } from './components/ui'
import { useAuth } from './context/AuthContext'
import DashboardLayout from './layouts/DashboardLayout'

const Login = lazy(() => import('./pages/Login'))
const Overview = lazy(() => import('./pages/Overview'))
const NetworkMonitoring = lazy(() => import('./pages/NetworkMonitoring'))
const PredictiveAnalytics = lazy(() => import('./pages/PredictiveAnalytics'))
const RootCauseAnalysis = lazy(() => import('./pages/RootCauseAnalysis'))
const Cybersecurity = lazy(() => import('./pages/Cybersecurity'))
const NetworkOptimization = lazy(() => import('./pages/NetworkOptimization'))
const AccessPoints = lazy(() => import('./pages/AccessPoints'))
const Devices = lazy(() => import('./pages/Devices'))
const Anomalies = lazy(() => import('./pages/Anomalies'))
const Troubleshooting = lazy(() => import('./pages/Troubleshooting'))
const Issues = lazy(() => import('./pages/Issues'))
const AutomationTesting = lazy(() => import('./pages/AutomationTesting'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

function FullPageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-app">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">Connecting to network intelligence</p>
    </div>
  )
}

function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return <DashboardLayout />
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Overview />} />
            <Route path="/monitoring" element={<NetworkMonitoring />} />
            <Route path="/predictive" element={<PredictiveAnalytics />} />
            <Route path="/root-cause" element={<RootCauseAnalysis />} />
            <Route path="/security" element={<Cybersecurity />} />
            <Route path="/optimization" element={<NetworkOptimization />} />
            <Route path="/access-points" element={<AccessPoints />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/anomalies" element={<Anomalies />} />
            <Route path="/troubleshooting" element={<Troubleshooting />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/testing" element={<AutomationTesting />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
