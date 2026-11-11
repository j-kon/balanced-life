import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export const Loading = () => (
  <div className="skeletons" aria-label="Loading" role="status">
    <div />
    <div />
    <div />
  </div>
);

export const ErrorBox = ({ message }: { message: string }) =>
  message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;

export function Empty({
  title = "No records to display",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Shield size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function AdminBrand({ to = "/dashboard" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="brand"
      aria-label="The Balanced Life Administration Portal"
    >
      <span className="brand-icon">
        <Shield size={22} />
      </span>
      <span>
        The Balanced Life
        <small>Administration Portal · Cossy Teens Consult</small>
      </span>
    </Link>
  );
}

