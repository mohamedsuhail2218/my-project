import React, { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowUpRight, Menu, ShieldCheck, X } from "lucide-react";
import Brand from "./Brand";
import { UserAvatar } from "./ui";
import { useApp } from "../state/AppState";

const NAV_ITEMS = [
  { to: "/product", label: "Platform" },
  { to: "/pricing", label: "Pricing" },
  { to: "/app", label: "Command center" },
];

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="footer-grid">
        <div className="footer-about">
          <Brand />
          <p>
            Digital Twin Cyber War models your infrastructure so you can rehearse the attack off production.
            HUNTER AI investigates the evidence in your logs, labels simulations and imports separately, and
            keeps every conclusion explainable.
          </p>
          <div className="row mt-16" style={{ gap: 7 }}>
            <span className="badge success"><ShieldCheck size={11} /> Safe by design</span>
            <span className="badge violet">HUNTER AI</span>
          </div>
        </div>
        <div className="footer-col">
          <div className="eyebrow">Platform</div>
          <ul>
            <li><Link to="/product">Digital Twin Cyber War</Link></li>
            <li><Link to="/product">HUNTER AI investigations</Link></li>
            <li><Link to="/product">Self-healing loop</Link></li>
            <li><Link to="/pricing">Plans &amp; pricing</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <div className="eyebrow">Access</div>
          <ul>
            <li><Link to="/signin">Sign in</Link></li>
            <li><Link to="/signup">Start a free trial</Link></li>
            <li><Link to="/app">Open the demo workspace</Link></li>
            <li><Link to="/forgot-password">Reset password</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} Digital Twin Cyber War · Safe-by-design simulation platform · All data in this demo is fictional
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const { state } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="public-shell">
      <header className="public-nav">
        <div className="public-nav-inner">
          <Brand />
          <nav className="public-links" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="public-actions">
            {state.user ? (
              <>
                <Link to="/app/settings" className="btn ghost">
                  <UserAvatar name={state.user.name} size="sm" />
                  {state.user.name.split(" ")[0]}
                </Link>
                <Link to="/app" className="btn primary">
                  Open workspace <ArrowUpRight />
                </Link>
              </>
            ) : (
              <>
                <Link to="/signin" className="btn ghost">Sign in</Link>
                <Link to="/signup" className="btn primary">Start free trial <ArrowUpRight /></Link>
              </>
            )}
            <button
              type="button"
              className="icon-btn public-mobile-toggle"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="public-mobile-menu" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}>
                {item.label}
              </Link>
            ))}
            {state.user ? (
              <Link to="/app" onClick={() => setMobileOpen(false)}>Open workspace</Link>
            ) : (
              <>
                <Link to="/signin" onClick={() => setMobileOpen(false)}>Sign in</Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)}>Start free trial</Link>
              </>
            )}
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
