import { useState, type FormEvent } from "react";
import { UserCheck } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { ErrorBox } from "../../components/Common";
import { api } from "../../api";

export function AccountPage() {
  const { user, refresh, toast } = useApp();
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProfileError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        "/me/profile",
        {
          name: f.get("name"),
          email: f.get("email"),
        },
        "PATCH",
      );
      await refresh();
      toast("Your profile details have been updated.");
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setPasswordError("");
    const f = new FormData(form);
    try {
      await api("/me/password", {
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
      });
      form.reset();
      toast("Your password has been changed.");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Profile & Security</span>
          <h1>Account settings</h1>
          <p>Manage your personal information and account security.</p>
        </div>
        <UserCheck size={40} strokeWidth={1} />
      </div>

      <div className="admin-plans">
        <form className="panel stack" onSubmit={saveProfile}>
          <h2>Personal profile</h2>
          <p>
            Update the name and email address associated with your devotional
            account.
          </p>
          <label>
            Full name
            <input
              name="name"
              defaultValue={user?.name || ""}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              defaultValue={user?.email || ""}
              required
            />
          </label>
          <p className="muted">
            Account role:{" "}
            <strong>
              {user?.role === "admin" ? "Administrator" : "Reader"}
            </strong>
          </p>
          <ErrorBox message={profileError} />
          <button className="button" disabled={busy}>
            Save profile
          </button>
        </form>

        <form className="panel stack" onSubmit={savePassword}>
          <h2>Change password</h2>
          <p>
            Choose a strong password of at least 10 characters to protect your
            account and private journal.
          </p>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <ErrorBox message={passwordError} />
          <button className="button outline" disabled={busy}>
            Update password
          </button>
        </form>
      </div>
    </>
  );
}

