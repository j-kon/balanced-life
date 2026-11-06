import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Shield } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ErrorBox } from "../../components/Common";
import { api } from "../../api";

export function AuthPage({ register = false }: { register?: boolean }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(
        register ? "/auth/register" : "/auth/login",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await refresh();
      navigate("/dashboard");
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
        <p>Come as you are. Make room to read, reflect, and grow.</p>
        <div className="auth-decoration">
          <BookOpen size={84} strokeWidth={0.7} />
        </div>
      </aside>
      <section className="auth-card">
        <h2>{register ? "Begin your journey" : "Welcome back"}</h2>
        <p>
          {register
            ? "Create your account to keep your reflections and progress together."
            : "Take a breath. Your daily space is waiting."}
        </p>
        <form className="stack" onSubmit={submit}>
          {register && (
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
              Use at least 10 characters. No birth date or address needed.
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

export function ForgotPasswordPage() {
  const { config, toast } = useApp();
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/auth/forgot-password",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      setSentMessage(res.message);
      toast("Password recovery request processed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          Enter the email address associated with your reader account to request
          a secure password reset link.
        </p>
      </aside>
      <section className="auth-card">
        <h2>Forgot password</h2>
        <p>
          Password reset links expire after 60 minutes and immediately revoke
          older sessions once used.
        </p>
        {!config.email.configured && (
          <div className="notice">
            <Shield size={20} />
            <div>
              <strong>Email provider not yet configured</strong>
              <p>
                Transactional email delivery (<code>EMAIL_WEBHOOK_URL</code>) is
                currently disabled in this environment. Please contact{" "}
                {config.settings.contactEmail} for account recovery assistance.
              </p>
            </div>
          </div>
        )}
        {sentMessage ? (
          <div className="notice success">
            <CheckCircle2 />
            <p>{sentMessage}</p>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <ErrorBox message={error} />
            <button
              className="button full"
              disabled={busy || !config.email.configured}
            >
              {busy ? "Sending…" : "Send reset link"} <ArrowRight size={17} />
            </button>
          </form>
        )}
        <p className="auth-switch">
          Remembered your password? <Link to="/login">Return to sign in</Link>
        </p>
      </section>
    </div>
  );
}

export function ResetPasswordPage() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/reset-password", {
        token: f.get("token"),
        password: f.get("password"),
      });
      toast("Your password has been updated. Please sign in.");
      navigate("/login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout container">
      <aside>
        <span className="eyebrow">Account recovery</span>
        <h1>
          Choose a new
          <br />
          password.
        </h1>
        <p>Use at least 10 characters to keep your journal and account safe.</p>
      </aside>
      <section className="auth-card">
        <h2>Reset your password</h2>
        <p>Enter your reset token and choose a new password below.</p>
        <form className="stack" onSubmit={submit}>
          <label>
            Reset token
            <input
              name="token"
              defaultValue={token}
              required
              minLength={32}
              placeholder="Paste the token from your reset link"
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <ErrorBox message={error} />
          <button className="button full" disabled={busy}>
            {busy ? "Updating…" : "Update password"} <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}

