import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email address associated with your workspace.");
      return;
    }
    setError("");
    setSent(true);
  };

  return (
    <AuthLayout>
      <span className="eyebrow">Account recovery</span>
      <h1 className="mt-12">Reset your access.</h1>
      <p>Enter your workspace email. In the real product, HUNTER sends a signed, single-use reset link.</p>

      {sent ? (
        <>
          <div className="auth-success">
            <CheckCircle2 />
            <div>
              <div className="strong">Reset link prepared</div>
              <p className="small muted mt-6">
                Demo mode does not send email. In production a signed link would be delivered to {email} and expire
                after 30 minutes.
              </p>
            </div>
          </div>
          <Link to="/signin" className="btn primary block mt-20">Return to sign in</Link>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="auth-inline-error">{error}</div>}
          <div className="field">
            <label htmlFor="forgot-email">Work email</label>
            <div className="input-icon">
              <Mail />
              <input
                id="forgot-email"
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="analyst@company.com"
              />
            </div>
          </div>
          <button type="submit" className="btn primary block">Send reset link</button>
        </form>
      )}

      <div className="auth-switch">
        <Link className="link row" to="/signin" style={{ justifyContent: "center" }}>
          <ArrowLeft size={13} /> Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
