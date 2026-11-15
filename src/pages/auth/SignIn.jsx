import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import { useApp } from "../../state/AppState";

const PREFILL_EMAIL = import.meta.env.VITE_DEMO_EMAIL || "";
const PREFILL_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "";

export default function SignIn() {
  const { signIn, dispatch } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || PREFILL_EMAIL);
  const [password, setPassword] = useState(PREFILL_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid work email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password, remember });
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Welcome back",
          message: remember
            ? "Your workspace is ready. Simulation controls are live."
            : "Signed in for this session only.",
          tone: "success",
        },
      });
      navigate(location.state?.from || "/app", { replace: true });
    } catch (err) {
      setError(
        err?.status === 429
          ? "Too many sign-in attempts. Wait a few minutes and try again."
          : err?.status === 403
            ? err.message
            : err?.message || "Sign-in failed. Check your email and password."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <span className="eyebrow">Sign in</span>
      <h1 className="mt-12">Continue your investigation.</h1>
      <p>Sign in to your workspace. Your session is bound to your role and the organization security policy.</p>

      <form className="auth-form" onSubmit={submit}>
        {error && <div className="auth-inline-error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="signin-email">Work email</label>
          <div className="input-icon">
            <Mail />
            <input
              id="signin-email"
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="analyst@company.com"
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="signin-password">Password</label>
          <div className="input-icon">
            <KeyRound />
            <input
              id="signin-password"
              className="input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={200}
              style={{ paddingRight: 38 }}
              required
            />
            <button
              type="button"
              className="icon-btn bare"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div className="auth-row">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Keep me signed in
          </label>
          <Link className="link" to="/forgot-password">Forgot password?</Link>
        </div>
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? <>Signing in… <Loader2 className="spin" /></> : <>Sign in <ArrowRight /></>}
        </button>
        {import.meta.env.PROD && (
          <p className="auth-login-hint">
            Use the workspace admin credentials issued for this deployment. Demo accounts are disabled on this instance.
          </p>
        )}
      </form>

      {PREFILL_EMAIL && PREFILL_PASSWORD && (
        <div className="auth-demo-note">
          <strong style={{ color: "var(--text-soft)" }}>Demo build:</strong> credentials are prefilled from
          build-time VITE_DEMO_* variables. Never enable this for a public deployment.
        </div>
      )}

      <div className="auth-switch">
        Need a workspace? <Link className="link" to="/signup">Create one</Link>
      </div>
    </AuthLayout>
  );
}
