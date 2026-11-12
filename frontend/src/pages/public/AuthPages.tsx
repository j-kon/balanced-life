import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  MailCheck,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ErrorBox } from "../../components/Common";
import { api } from "../../api";

export function AuthPage({ register = false }: { register?: boolean }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ageGroup, setAgeGroup] = useState<
    "13_17" | "18_25" | "adult_mentor"
  >("18_25");
  const [guardianConsent, setGuardianConsent] = useState(true);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (register) {
        await api("/auth/register", {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          ageGroup,
          guardianConsentConfirmed:
            ageGroup === "13_17" ? guardianConsent : true,
        });
      } else {
        await api("/auth/login", {
          email: f.get("email"),
          password: f.get("password"),
        });
      }
      await refresh();
      const redirectTarget =
        (location.state as { from?: string })?.from || "/dashboard";
      navigate(redirectTarget);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout container">
      <aside>
        <span className="eyebrow">A moment to reconnect</span>
        <h1>
          Your next chapter
          <br />
          starts here.
        </h1>
        <p>
          Come as you are. Make room to connect with Jesus, learn, reflect,
          apply, and track your growth.
        </p>
        <div className="auth-decoration">
          <BookOpen size={84} strokeWidth={0.7} />
        </div>
      </aside>
      <section className="auth-card">
        <h2>{register ? "Begin your journey" : "Welcome back"}</h2>
        <p>
          {register
            ? "Create your account to keep your reflections, daily accountability, and reading progress together."
            : "Take a breath. Your daily space is waiting."}
        </p>
        <form className="stack" onSubmit={submit}>
          {register && (
            <>
              <label>
                Your name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Reader group
                <select
                  name="ageGroup"
                  value={ageGroup}
                  onChange={(e) => {
                    const next = e.target.value as
                      | "13_17"
                      | "18_25"
                      | "adult_mentor";
                    setAgeGroup(next);
                    if (next !== "13_17") setGuardianConsent(true);
                  }}
                >
                  <option value="18_25">Young Adult (Ages 18–25)</option>
                  <option value="13_17">Teenager (Ages 13–17)</option>
                  <option value="adult_mentor">
                    Parent, Teacher, Youth Leader or Mentor
                  </option>
                </select>
              </label>
              {ageGroup === "13_17" && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={guardianConsent}
                    required
                    onChange={(e) => setGuardianConsent(e.target.checked)}
                  />
                  <span>
                    I confirm that I have permission from my parent, guardian,
                    school chaplain, or youth mentor to create this devotional
                    account.
                  </span>
                </label>
              )}
            </>
          )}
          <label>
            Email address
            <input name="email" required type="email" autoComplete="email" />
          </label>
          <label id="password-label">
            <span className="label-row">
              <span>Password</span>
              {!register && (
                <Link className="forgot-link" to="/forgot-password">
                  Forgot password?
                </Link>
              )}
            </span>
            <input
              name="password"
              aria-labelledby="password-label"
              aria-describedby={register ? "password-help" : undefined}
              required
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && (
            <small id="password-help" className="field-help">
              Use at least 10 characters. We collect only your name and email —
              no birth date, phone number, or home address is required.
            </small>
          )}
          <ErrorBox message={error} />
          <button className="button full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to the journey?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ForgotPasswordPage() {
  const { config, toast } = useApp();
  const [step, setStep] = useState<"email" | "code" | "password" | "done">(
    "email",
  );
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resetProofToken, setResetProofToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expirySeconds, setExpirySeconds] = useState(0);

  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);
  const firstDigitFocusTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0 && expirySeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds, expirySeconds]);

  useEffect(() => {
    if (step === "code") {
      firstDigitFocusTimeout.current = window.setTimeout(() => {
        digitRefs.current[0]?.focus();
      }, 40);
    }
    return () => {
      if (firstDigitFocusTimeout.current !== null) {
        window.clearTimeout(firstDigitFocusTimeout.current);
      }
    };
  }, [step]);

  async function requestCode(targetEmail: string) {
    const cleanEmail = targetEmail.trim().toLowerCase();
    setError("");
    setBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        cooldownSeconds?: number;
        expiresInSeconds?: number;
        message: string;
      }>("/auth/forgot-password", { email: cleanEmail });
      setEmail(cleanEmail);
      setDigits(["", "", "", "", "", ""]);
      setCooldownSeconds(res.cooldownSeconds ?? 60);
      setExpirySeconds(res.expiresInSeconds ?? 600);
      setStep("code");
      toast("Verification code sent if your email matches an active account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEmailStep(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await requestCode(email);
  }

  function handleDigitChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((ch, idx) => {
        next[idx] = ch;
      });
      setDigits(next);
      const focusIdx = Math.min(chars.length, 5);
      digitRefs.current[focusIdx]?.focus();
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
    if (index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        digitRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      digitRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((ch, idx) => {
      next[idx] = ch;
    });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    digitRefs.current[focusIdx]?.focus();
  }

  async function submitCodeStep(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter all 6 digits from your email.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api<{ verified: boolean; resetProofToken: string }>(
        "/auth/verify-reset-code",
        { email, code },
      );
      setResetProofToken(res.resetProofToken);
      setStep("password");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const meetsMinLength = password.length >= 10;
  const passwordsMatch = Boolean(password) && password === confirmPassword;

  async function submitPasswordStep(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!meetsMinLength) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api("/auth/reset-password", {
        email,
        resetProofToken,
        password,
      });
      setStep("done");
      toast("Your password has been updated. Please sign in.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeStepNum = step === "email" ? 1 : step === "code" ? 2 : 3;

  return (
    <div className="auth-layout container">
      <aside>
        <span className="eyebrow">Account recovery</span>
        <h1>
          Restore your
          <br />
          quiet space.
        </h1>
        <p>
          Verify your email with a single-use 6-digit code right inside the app—no
          browser redirects required.
        </p>
      </aside>
      <section className="auth-card recovery-card">
        <div
          className="recovery-steps"
          role="progressbar"
          aria-valuenow={activeStepNum}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={`Password reset step ${activeStepNum} of 3`}
        >
          <span
            className={`recovery-step ${activeStepNum >= 1 ? "active" : ""}`}
          >
            1. Email
          </span>
          <span
            className={`recovery-step ${activeStepNum >= 2 ? "active" : ""}`}
          >
            2. Code
          </span>
          <span
            className={`recovery-step ${activeStepNum >= 3 ? "active" : ""}`}
          >
            3. New Password
          </span>
        </div>

        {!config.email.configured && step === "email" && (
          <div className="notice">
            <Shield size={20} />
            <div>
              <strong>Email delivery not configured yet</strong>
              <p>
                Password recovery emails are disabled in this environment. Contact{" "}
                {config.settings.contactEmail} for recovery support.
              </p>
            </div>
          </div>
        )}

        {step === "email" && (
          <form className="stack" onSubmit={submitEmailStep}>
            <h2>Forgot your password?</h2>
            <p className="muted">
              Enter your registered email and we&apos;ll send you a verification
              code.
            </p>
            <label>
              Email address
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <ErrorBox message={error} />
            <button
              className="button full"
              type="submit"
              disabled={busy}
            >
              {busy ? "Sending Verification Code…" : "Send Verification Code"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
        )}

        {step === "code" && (
          <form className="stack" onSubmit={submitCodeStep}>
            <div className="recovery-heading-row">
              <h2>Check your email.</h2>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setError("");
                  setStep("email");
                }}
              >
                <ArrowLeft size={14} /> Change email
              </button>
            </div>
            <p className="muted">
              Enter the 6-digit verification code sent to{" "}
              <strong>{email}</strong>.
            </p>

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
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={6}
                  aria-label={`Verification digit ${index + 1} of 6`}
                  className="otp-digit-input"
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(index, e)}
                  onPaste={handleDigitPaste}
                />
              ))}
            </div>

            <div className="recovery-meta-row">
              <span className="muted">
                {expirySeconds > 0
                  ? `Code expires in ${formatCountdown(expirySeconds)}`
                  : "Code expired — request a new code"}
              </span>
              <button
                type="button"
                className="link-btn"
                disabled={busy || cooldownSeconds > 0}
                onClick={() => requestCode(email)}
              >
                <RefreshCw size={14} />{" "}
                {cooldownSeconds > 0
                  ? `Resend in ${cooldownSeconds}s`
                  : "Resend code"}
              </button>
            </div>

            <ErrorBox message={error} />
            <button
              className="button full"
              type="submit"
              disabled={busy || digits.join("").length !== 6}
            >
              {busy ? "Verifying…" : "Verify Code"} <ArrowRight size={17} />
            </button>
          </form>
        )}

        {step === "password" && (
          <form className="stack" onSubmit={submitPasswordStep}>
            <div className="recovery-badge-verified">
              <MailCheck size={16} /> Email code verified
            </div>
            <h2>Create your new password.</h2>
            <p className="muted">
              Updating your password signs out all older sessions across your
              devices.
            </p>

            <label>
              New password
              <div className="password-field-wrap">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            <label>
              Confirm password
              <div className="password-field-wrap">
                <input
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-label={
                    showConfirm
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            <ul className="password-reqs">
              <li className={meetsMinLength ? "met" : ""}>
                <Check size={14} /> At least 10 characters
              </li>
              <li className={passwordsMatch ? "met" : ""}>
                <Check size={14} /> Passwords match
              </li>
            </ul>

            <ErrorBox message={error} />
            <button
              className="button full"
              type="submit"
              disabled={busy || !meetsMinLength || !passwordsMatch}
            >
              {busy ? "Resetting Password…" : "Reset Password"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="stack">
            <div className="notice success">
              <CheckCircle2 size={20} />
              <div>
                <strong>Your password has been reset</strong>
                <p>
                  Previous active sessions have been signed out for your
                  protection. Sign in with your new password.
                </p>
              </div>
            </div>
            <Link className="button full" to="/login">
              Sign In <ArrowRight size={17} />
            </Link>
          </div>
        )}

        {step !== "done" && (
          <p className="auth-switch">
            Remembered your password? <Link to="/login">Return to sign in</Link>
          </p>
        )}
      </section>
    </div>
  );
}

export function ResetPasswordPage() {
  return <ForgotPasswordPage />;
}
