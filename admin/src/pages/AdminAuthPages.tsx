import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api";
import { AdminBrand, ErrorBox } from "../components/Common";
import { useAdminAuth } from "../context/AdminAuthContext";
import { generateQrSvgMarkup } from "../utils/qr";
import type { PublicAdmin } from "../types";

function AdminAuthLayout({
  title,
  badge,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  badge: string;
  subtitle: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-auth-page">
      <div className="admin-auth-topbar">
        <AdminBrand to="/login" />
        <span className="pill">Restricted Staff Access</span>
      </div>

      <main className={"admin-auth-card" + (wide ? " wide" : "")}>
        <span className="admin-auth-badge">
          <Lock size={14} /> {badge}
        </span>
        <div>
          <h1>{title}</h1>
          <p className="muted" style={{ marginTop: "6px" }}>
            {subtitle}
          </p>
        </div>
        {children}
      </main>

      <footer className="admin-auth-footer">
        The Balanced Life Devotional · Private Administration Console · All
        actions are logged.
      </footer>
    </div>
  );
}

function PasswordInput({
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required = true,
}: {
  name: string;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={128}
        required={required}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function AdminLoginPage() {
  const { refresh } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        admin: PublicAdmin;
        nextStep: "enroll_mfa" | "verify_mfa";
      }>("/admin/auth/login", { email, password });
      await refresh();
      if (res.nextStep === "enroll_mfa") {
        navigate("/mfa-setup", { replace: true });
      } else {
        navigate("/mfa-verify", { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminAuthLayout
      badge="Administrator Sign-In"
      title="Staff Administration Portal"
      subtitle="Sign in with your dedicated administrator email and password. Reader accounts cannot access this portal."
    >
      <form className="stack" onSubmit={submit}>
        <label>
          Administrator email
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="staff@cossyteens.com"
            required
          />
        </label>
        <label>
          Administrator password
          <PasswordInput
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Enter administrator password"
          />
        </label>
        <ErrorBox message={error} />
        <button className="button" disabled={busy} type="submit">
          {busy ? "Verifying credentials..." : "Continue to verification"}
        </button>
      </form>
      <div
        className="actions"
        style={{ justifyContent: "space-between", fontSize: "0.85rem" }}
      >
        <Link to="/forgot-password" className="text-link">
          Forgot administrator password?
        </Link>
        <span className="muted">MFA required for access</span>
      </div>
    </AdminAuthLayout>
  );
}

export function AdminMfaEnrollPage() {
  const { admin, refresh, logout, toast } = useAdminAuth();
  const navigate = useNavigate();
  const [setupData, setSetupData] = useState<{
    otpauthUri: string;
    manualEntryKey: string;
    accountEmail: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function initEnrollment() {
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        otpauthUri: string;
        manualEntryKey: string;
        accountEmail: string;
      }>("/admin/auth/mfa/enroll", {});
      setSetupData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void initEnrollment();
  }, []);

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{
        admin: PublicAdmin;
        recoveryCodes: string[];
      }>("/admin/auth/mfa/confirm", { code });
      setRecoveryCodes(res.recoveryCodes);
      toast("Authenticator MFA enabled.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast("Backup recovery codes copied.");
    } catch {
      toast("Select and copy codes manually.");
    }
  }

  async function copySecret() {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.manualEntryKey);
      toast("Authenticator setup key copied.");
    } catch {
      toast("Copy the setup key shown above.");
    }
  }

  async function enterPortal() {
    await refresh();
    navigate("/dashboard", { replace: true });
  }

  if (recoveryCodes) {
    return (
      <AdminAuthLayout
        wide
        badge="Step 2 of 2 · Save Backup Codes"
        title="Store Your Recovery Codes"
        subtitle="Each code works once if you lose access to your authenticator app. Store them safely now — they will not be displayed again."
      >
        <div className="recovery-codes-grid" aria-label="Backup recovery codes">
          {recoveryCodes.map((c) => (
            <div className="recovery-code-item" key={c}>
              {c}
            </div>
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            className="button outline small"
            onClick={copyCodes}
          >
            <Copy size={15} /> Copy all codes
          </button>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={savedConfirmed}
            onChange={(e) => setSavedConfirmed(e.target.checked)}
          />
          <span>
            I have saved these 8 single-use recovery codes in a secure location.
          </span>
        </label>
        <button
          type="button"
          className="button"
          disabled={!savedConfirmed}
          onClick={enterPortal}
        >
          <CheckCircle2 size={17} /> Enter Administration Dashboard
        </button>
      </AdminAuthLayout>
    );
  }

  const qrSvg = setupData ? generateQrSvgMarkup(setupData.otpauthUri) : "";
  const qrDataUrl = qrSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`
    : "";

  return (
    <AdminAuthLayout
      wide
      badge="Step 2 of 2 · Authenticator Setup"
      title="Protect Your Administrator Account"
      subtitle={`Signed in as ${admin?.email || "staff"}. Scan the QR code with Google Authenticator, 1Password, or Authy to enable required 2-step verification.`}
    >
      {setupData && (
        <div className="mfa-qr-box">
          {qrDataUrl && (
            <div className="mfa-qr-frame">
              <img
                src={qrDataUrl}
                alt="Authenticator setup QR code"
                width={180}
                height={180}
              />
            </div>
          )}
          <div className="stack" style={{ flex: 1, minWidth: "220px" }}>
            <strong style={{ color: "var(--wine)" }}>
              Manual entry key (if camera unavailable)
            </strong>
            <div className="mfa-manual-key">{setupData.manualEntryKey}</div>
            <div className="actions">
              <button
                type="button"
                className="button outline small"
                onClick={copySecret}
              >
                <Copy size={14} /> Copy key
              </button>
              <button
                type="button"
                className="button outline small"
                disabled={busy}
                onClick={initEnrollment}
              >
                <RefreshCw size={14} /> New key
              </button>
            </div>
          </div>
        </div>
      )}

      <form className="stack" onSubmit={confirmCode}>
        <label>
          Enter the 6-digit code shown in your authenticator app
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <ErrorBox message={error} />
        <div className="actions">
          <button className="button" disabled={busy} type="submit">
            <ShieldCheck size={17} />{" "}
            {busy ? "Confirming..." : "Verify & enable MFA"}
          </button>
          <button
            type="button"
            className="button outline"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </AdminAuthLayout>
  );
}

export function AdminMfaChallengePage() {
  const { admin, refresh, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (useRecovery) {
        await api("/admin/auth/mfa/recover", { recoveryCode });
      } else {
        await api("/admin/auth/mfa/verify", { code });
      }
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminAuthLayout
      badge="Step 2 of 2 · MFA Verification"
      title="Two-Step Verification"
      subtitle={`Verify your session for ${admin?.email || "administrator"} before opening operational tools.`}
    >
      <form className="stack" onSubmit={submit}>
        {useRecovery ? (
          <label>
            Single-use backup recovery code
            <input
              name="recoveryCode"
              placeholder="XXXX-XXXX-XX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
            />
          </label>
        ) : (
          <label>
            6-digit authenticator code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
        )}
        <ErrorBox message={error} />
        <button className="button" disabled={busy} type="submit">
          <KeyRound size={17} />{" "}
          {busy ? "Checking code..." : "Verify & enter dashboard"}
        </button>
      </form>

      <div className="actions" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setError("");
            setUseRecovery((r) => !r);
          }}
        >
          {useRecovery
            ? "Use 6-digit authenticator app code"
            : "Use a single-use backup recovery code"}
        </button>
        <button
          type="button"
          className="text-link"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        >
          Sign out
        </button>
      </div>
    </AdminAuthLayout>
  );
}

export function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await api<{ message: string }>(
        "/admin/auth/forgot-password",
        { email },
      );
      setDone(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminAuthLayout
      badge="Administrator Account Recovery"
      title="Reset Administrator Password"
      subtitle="Enter your staff administrator email. A time-limited reset link will be dispatched if email recovery is configured."
    >
      {done ? (
        <div className="notice">
          <CheckCircle2 size={20} />
          <p>{done}</p>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label>
            Administrator email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <ErrorBox message={error} />
          <button className="button" disabled={busy}>
            {busy ? "Sending recovery link..." : "Send administrator reset link"}
          </button>
        </form>
      )}
      <Link to="/login" className="text-link">
        Back to administrator sign-in
      </Link>
    </AdminAuthLayout>
  );
}

export function AdminResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/admin/auth/reset-password",
        { token, password },
      );
      setDone(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminAuthLayout
      badge="Administrator Account Recovery"
      title="Set New Administrator Password"
      subtitle="Use at least 12 characters with uppercase, lowercase, and at least one number or symbol."
    >
      {!token ? (
        <ErrorBox message="Missing password reset token. Open the link from your administrator recovery email." />
      ) : done ? (
        <div className="stack">
          <div className="notice">
            <CheckCircle2 size={20} />
            <p>{done}</p>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => navigate("/login")}
          >
            Sign in with new password
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label>
            New strong password
            <PasswordInput
              name="password"
              value={password}
              onChange={setPassword}
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm new password
            <PasswordInput
              name="confirm"
              value={confirm}
              onChange={setConfirm}
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <ErrorBox message={error} />
          <button className="button" disabled={busy}>
            {busy ? "Updating password..." : "Update administrator password"}
          </button>
        </form>
      )}
      <Link to="/login" className="text-link">
        Back to administrator sign-in
      </Link>
    </AdminAuthLayout>
  );
}

