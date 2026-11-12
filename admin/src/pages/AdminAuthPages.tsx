import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MailCheck,
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

function formatCountdownSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resetProofToken, setResetProofToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expiresSeconds, setExpiresSeconds] = useState(0);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldownSeconds <= 0 && expiresSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiresSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds, expiresSeconds]);

  useEffect(() => {
    if (step === 2) {
      digitRefs.current[0]?.focus();
    }
  }, [step]);

  const code = digits.join("");
  const hasMinLen = password.length >= 12;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigitOrSymbol = /[\d\W_]/.test(password);
  const passwordsMatch = Boolean(password) && password === confirm;

  async function requestCode(isResend = false) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const normalized = email.trim().toLowerCase();
      const res = await api<{
        ok: boolean;
        cooldownSeconds?: number;
        expiresInSeconds?: number;
        message: string;
      }>("/admin/auth/forgot-password", { email: normalized });
      setEmail(normalized);
      setDigits(["", "", "", "", "", ""]);
      setResetProofToken("");
      setCooldownSeconds(res.cooldownSeconds ?? 60);
      setExpiresSeconds(res.expiresInSeconds ?? 600);
      setInfo(res.message);
      setStep(2);
      if (isResend) {
        digitRefs.current[0]?.focus();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    await requestCode(false);
  }

  function handleDigitChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length > 1) {
      handleDigitPasteString(cleaned, index);
      return;
    }
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      digitRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      digitRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitPasteString(raw: string, startIndex = 0) {
    const clean = raw.replace(/\D/g, "").slice(0, 6);
    if (!clean) return;
    const next = [...digits];
    let lastFilled = startIndex;
    for (let i = 0; i < clean.length && startIndex + i < 6; i++) {
      next[startIndex + i] = clean[i]!;
      lastFilled = startIndex + i;
    }
    setDigits(next);
    const focusIndex = Math.min(lastFilled + 1, 5);
    digitRefs.current[focusIndex]?.focus();
  }

  async function submitStep2(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (code.length !== 6) {
      setError("Enter all 6 digits from your verification email.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; resetProofToken: string }>(
        "/admin/auth/verify-reset-code",
        { email, code },
      );
      setResetProofToken(res.resetProofToken);
      setError("");
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitStep3(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!hasMinLen || !hasUpper || !hasLower || !hasDigitOrSymbol) {
      setError(
        "Use at least 12 characters with uppercase, lowercase, and at least one number or symbol.",
      );
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/admin/auth/reset-password", {
        email,
        resetProofToken,
        password,
      });
      setDone(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stepMeta =
    step === 1
      ? {
          title: "Forgot your password?",
          subtitle:
            "Enter your registered email and we'll send you a verification code.",
        }
      : step === 2
        ? {
            title: "Check your email.",
            subtitle: `Enter the 6-digit verification code sent to ${email}.`,
          }
        : {
            title: "Create your new password.",
            subtitle:
              "Set a new strong administrator password. Authenticator MFA remains required when signing in.",
          };

  return (
    <AdminAuthLayout
      badge="Administrator Account Recovery"
      title={done ? "Password Updated" : stepMeta.title}
      subtitle={
        done
          ? "Your administrator password has been reset and previous sessions were signed out."
          : stepMeta.subtitle
      }
    >
      {!done && (
        <ol className="recovery-steps" aria-label="Password recovery steps">
          <li className={step === 1 ? "is-active" : step > 1 ? "is-done" : ""}>
            <span>1</span> Email
          </li>
          <li className={step === 2 ? "is-active" : step > 2 ? "is-done" : ""}>
            <span>2</span> Code
          </li>
          <li className={step === 3 ? "is-active" : ""}>
            <span>3</span> Password
          </li>
        </ol>
      )}

      {done ? (
        <div className="stack">
          <div className="notice">
            <CheckCircle2 size={20} />
            <div>
              <p>{done}</p>
              <p className="muted small" style={{ marginTop: 6 }}>
                You will be prompted to verify your authenticator MFA code on
                sign-in.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => navigate("/login")}
          >
            Sign In
          </button>
        </div>
      ) : step === 1 ? (
        <form className="stack" onSubmit={submitStep1}>
          <label>
            Administrator email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@balancedlife.org"
              autoComplete="email"
              required
            />
          </label>
          <p className="muted small">
            Authenticator MFA cannot be bypassed through password recovery and
            will still be required after resetting your password.
          </p>
          <ErrorBox message={error} />
          <button className="button" disabled={busy}>
            {busy ? "Sending Verification Code..." : "Send Verification Code"}
          </button>
        </form>
      ) : step === 2 ? (
        <form className="stack" onSubmit={submitStep2}>
          {info && (
            <div className="notice">
              <MailCheck size={18} />
              <p>{info}</p>
            </div>
          )}

          <div>
            <span className="field-label">6-digit verification code</span>
            <div
              className="otp-digit-grid"
              role="group"
              aria-label="6-digit verification code"
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    digitRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Verification code digit ${index + 1}`}
                  className="otp-digit-input"
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(index, e)}
                  onPaste={(e) => {
                    e.preventDefault();
                    handleDigitPasteString(
                      e.clipboardData.getData("text"),
                      index === 0 ? 0 : index,
                    );
                  }}
                />
              ))}
            </div>
          </div>

          <div className="row wrap between muted small">
            <span>
              {expiresSeconds > 0
                ? `Code expires in ${formatCountdownSeconds(expiresSeconds)}`
                : "Code expired — request a new verification code."}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={busy || cooldownSeconds > 0}
              onClick={() => void requestCode(true)}
            >
              {cooldownSeconds > 0
                ? `Resend in ${cooldownSeconds}s`
                : "Resend code"}
            </button>
          </div>

          <ErrorBox message={error} />
          <button className="button" disabled={busy || code.length !== 6}>
            {busy ? "Verifying Code..." : "Verify Code"}
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => {
              setStep(1);
              setError("");
              setInfo("");
              setDigits(["", "", "", "", "", ""]);
            }}
          >
            <ArrowLeft size={16} />
            Change email
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={submitStep3}>
          <div className="recovery-badge-verified">
            <Check size={16} />
            <span>Verification code confirmed for {email}</span>
          </div>
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
          <ul className="password-reqs" aria-label="Password requirements">
            <li className={hasMinLen ? "is-met" : ""}>
              <Check size={14} /> At least 12 characters
            </li>
            <li className={hasUpper && hasLower ? "is-met" : ""}>
              <Check size={14} /> Uppercase and lowercase letters
            </li>
            <li className={hasDigitOrSymbol ? "is-met" : ""}>
              <Check size={14} /> At least one number or symbol
            </li>
            <li className={passwordsMatch ? "is-met" : ""}>
              <Check size={14} /> Passwords match
            </li>
          </ul>
          <ErrorBox message={error} />
          <button className="button" disabled={busy}>
            {busy ? "Resetting Password..." : "Reset Password"}
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
  return <AdminForgotPasswordPage />;
}

