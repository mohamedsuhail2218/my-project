import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, KeyRound, Loader2, Mail, ShieldCheck, User } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import { useApp } from "../../state/AppState";
import { api } from "../../lib/api";

const FALLBACK_CONFIG = {
  selfSignup: true,
  inviteRequired: false,
  passwordMinLength: 12,
  maxPasswordBytes: 72,
};

function passwordBytes(value) {
  return new TextEncoder().encode(value).length;
}

export default function SignUp() {
  const { signUp, dispatch } = useApp();
  const navigate = useNavigate();
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    org: "",
    password: "",
    inviteCode: "",
    terms: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .authConfig()
      .then((value) => {
        if (!cancelled && value) setConfig({ ...FALLBACK_CONFIG, ...value });
      })
      .catch(() => {
        // Keep the development-friendly fallback; the server still enforces.
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key) => (event) => {
    const value = key === "terms" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.includes("@") || !form.org.trim()) {
      setError("Add your name, a valid work email and an organization name.");
      return;
    }
    if (form.password.length < config.passwordMinLength) {
      setError(`Choose a password with at least ${config.passwordMinLength} characters.`);
      return;
    }
    if (passwordBytes(form.password) > config.maxPasswordBytes) {
      setError(`Password must be at most ${config.maxPasswordBytes} bytes.`);
      return;
    }
    if (config.inviteRequired && !form.inviteCode.trim()) {
      setError("Enter the invite code provided by your administrator.");
      return;
    }
    if (!form.terms) {
      setError("Accept the safe-use and demo data terms to continue.");
      return;
    }
    setBusy(true);
    try {
      await signUp({
        name: form.name.trim(),
        email: form.email.trim(),
        org: form.org.trim(),
        password: form.password,
        terms: true,
        ...(form.inviteCode.trim() ? { inviteCode: form.inviteCode.trim() } : {}),
      });
      dispatch({
        type: "PUSH_TOAST",
        toast: {
          title: "Request received",
          message: "If the address is available, the workspace is ready. Sign in with the password you chose.",
          tone: "success",
        },
      });
      navigate("/signin", { replace: true, state: { email: form.email.trim() } });
    } catch (err) {
      setError(err?.message || "Could not create the workspace.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <span className="eyebrow">Create a workspace</span>
      <h1 className="mt-12">Build the twin. Run the attack.</h1>
      <p>
        A new workspace starts on the Starter plan with a 14-day trial and isolated demo data. You will sign in after
        it is created.
      </p>

      {configLoaded && !config.selfSignup ? (
        <>
          <div className="auth-inline-error" role="status">
            Self-service signup is disabled for this deployment. Ask your administrator for an invitation.
          </div>
          <Link to="/signin" className="btn primary block mt-20">Return to sign in</Link>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="auth-inline-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="signup-name">Full name</label>
            <div className="input-icon">
              <User />
              <input id="signup-name" className="input" value={form.name} onChange={update("name")} placeholder="Alex Mercer" autoComplete="name" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="signup-email">Work email</label>
            <div className="input-icon">
              <Mail />
              <input id="signup-email" className="input" type="email" value={form.email} onChange={update("email")} placeholder="alex@company.com" autoComplete="email" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="signup-org">Organization</label>
            <div className="input-icon">
              <Building2 />
              <input id="signup-org" className="input" value={form.org} onChange={update("org")} placeholder="Acme Security" autoComplete="organization" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <div className="input-icon">
              <KeyRound />
              <input
                id="signup-password"
                className="input"
                type="password"
                value={form.password}
                onChange={update("password")}
                placeholder={`At least ${config.passwordMinLength} characters`}
                autoComplete="new-password"
                minLength={config.passwordMinLength}
                maxLength={200}
                required
              />
            </div>
            <span className="hint">Use a unique passphrase of 12–72 bytes with mixed character classes.</span>
          </div>
          {config.inviteRequired && (
            <div className="field">
              <label htmlFor="signup-invite">Invite code</label>
              <div className="input-icon">
                <ShieldCheck />
                <input id="signup-invite" className="input" value={form.inviteCode} onChange={update("inviteCode")} placeholder="Provided by your administrator" autoComplete="one-time-code" required />
              </div>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={form.terms} onChange={update("terms")} />
            I confirm I will only upload logs and model infrastructure I am authorised to test.
          </label>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? <>Creating workspace… <Loader2 className="spin" /></> : <>Create workspace <ArrowRight /></>}
          </button>
        </form>
      )}

      <div className="auth-demo-note">
        Registration responses do not reveal whether an address already has an account. Sign in after creating a
        workspace; sessions are issued only by the API.
      </div>

      <div className="auth-switch">
        Already have a workspace? <Link className="link" to="/signin">Sign in</Link>
      </div>
    </AuthLayout>
  );
}
