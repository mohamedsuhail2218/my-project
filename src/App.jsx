import React, { Suspense, lazy, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useApp } from "./state/AppState";
import PublicLayout from "./components/PublicLayout";
import AppShell from "./components/AppShell";
import Brand from "./components/Brand";
import RouteLoading from "./components/RouteLoading";
import { ToastViewport } from "./components/ui";

// Every route is a separate chunk. AppShell, the layouts and shared UI stay in
// the entry bundle so navigation paints instantly while pages stream in.
const Landing = lazy(() => import("./pages/public/Landing"));
const Product = lazy(() => import("./pages/public/Product"));
const Pricing = lazy(() => import("./pages/public/Pricing"));
const SignIn = lazy(() => import("./pages/auth/SignIn"));
const SignUp = lazy(() => import("./pages/auth/SignUp"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));

const CommandCenter = lazy(() => import("./pages/app/CommandCenter"));
const Workspace = lazy(() => import("./pages/app/Workspace"));
const Reports = lazy(() => import("./pages/app/Reports"));
const Settings = lazy(() => import("./pages/app/Settings"));
const Subscription = lazy(() => import("./pages/app/Subscription"));
const Admin = lazy(() => import("./pages/app/Admin"));

const TwinOverview = lazy(() => import("./pages/twin/TwinOverview"));
const NetworkBuilder = lazy(() => import("./pages/twin/NetworkBuilder"));
const SimulationCenter = lazy(() => import("./pages/twin/SimulationCenter"));
const AttackPaths = lazy(() => import("./pages/twin/AttackPaths"));
const RiskAnalysis = lazy(() => import("./pages/twin/RiskAnalysis"));
const RedVsBlue = lazy(() => import("./pages/twin/RedVsBlue"));
const SelfHealing = lazy(() => import("./pages/twin/SelfHealing"));
const WhatIf = lazy(() => import("./pages/twin/WhatIf"));
const SimulationHistory = lazy(() => import("./pages/twin/SimulationHistory"));

const HunterDashboard = lazy(() => import("./pages/hunter/HunterDashboard"));
const Detections = lazy(() => import("./pages/hunter/Detections"));
const LogAnalysis = lazy(() => import("./pages/hunter/LogAnalysis"));
const Fingerprints = lazy(() => import("./pages/hunter/Fingerprints"));
const Investigation = lazy(() => import("./pages/hunter/Investigation"));
const Incidents = lazy(() => import("./pages/hunter/Incidents"));
const IncidentDetail = lazy(() => import("./pages/hunter/IncidentDetail"));
const Intel = lazy(() => import("./pages/hunter/Intel"));
const Evidence = lazy(() => import("./pages/hunter/Evidence"));
const EventTimeline = lazy(() => import("./pages/hunter/EventTimeline"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function RequireAuth({ children }) {
  const { state, authReady } = useApp();
  const location = useLocation();
  if (!authReady) return <RouteLoading label="Checking your session…" />;
  if (!state.user) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  }
  return children;
}

function RequireRole({ role, children }) {
  const { state, authReady } = useApp();
  if (!authReady) return <RouteLoading label="Checking your role…" />;
  if (state.user?.roleKey !== role) return <Navigate to="/app" replace />;
  return children;
}

function NotFoundPage() {
  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "1fr" }}>
      <div className="auth-main">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <Brand />
          </div>
          <div className="eyebrow" style={{ justifyContent: "center" }}>404 · Off the map</div>
          <h1 className="mt-16">This path was never modelled.</h1>
          <p className="mt-12">
            The page you requested is not part of the workspace. Return to the command center or head back to the
            public site.
          </p>
          <div className="row mt-24" style={{ justifyContent: "center" }}>
            <Link to="/app" className="btn primary"><ShieldAlert /> Command center</Link>
            <Link to="/" className="btn outline"><ArrowLeft /> Public site</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="product" element={<Product />} />
            <Route path="pricing" element={<Pricing />} />
          </Route>

          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<CommandCenter />} />
            <Route path="workspace" element={<Workspace />} />

            <Route path="twin" element={<TwinOverview />} />
            <Route path="twin/builder" element={<NetworkBuilder />} />
            <Route path="twin/simulations" element={<SimulationCenter />} />
            <Route path="twin/attack-paths" element={<AttackPaths />} />
            <Route path="twin/risk" element={<RiskAnalysis />} />
            <Route path="twin/red-blue" element={<RedVsBlue />} />
            <Route path="twin/self-healing" element={<SelfHealing />} />
            <Route path="twin/what-if" element={<WhatIf />} />
            <Route path="twin/history" element={<SimulationHistory />} />

            <Route path="hunter" element={<HunterDashboard />} />
            <Route path="hunter/detections" element={<Detections />} />
            <Route path="hunter/logs" element={<LogAnalysis />} />
            <Route path="hunter/fingerprints" element={<Fingerprints />} />
            <Route path="hunter/investigation" element={<Investigation />} />
            <Route path="hunter/incidents" element={<Incidents />} />
            <Route path="hunter/incidents/:incidentId" element={<IncidentDetail />} />
            <Route path="hunter/intel" element={<Intel />} />
            <Route path="hunter/evidence" element={<Evidence />} />
            <Route path="hunter/timeline" element={<EventTimeline />} />

            <Route path="reports" element={<Reports />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="admin"
              element={
                <RequireRole role="super_admin">
                  <Admin />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </>
  );
}
