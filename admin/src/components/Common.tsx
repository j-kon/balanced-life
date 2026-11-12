import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Shield } from "lucide-react";

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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmClassName = "button small",
  busy = false,
  error = "",
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmClassName?: string;
  busy?: boolean;
  error?: string;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="admin-confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="stack">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            type="button"
            className="button outline small"
            disabled={busy}
            onClick={onCancel}
          >
            Close
          </button>
        </div>
        {description && (
          <p className="muted" style={{ margin: 0 }}>
            {description}
          </p>
        )}
        {children}
        <ErrorBox message={error} />
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="button outline small"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmClassName}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function PaginationBar({
  page,
  totalPages,
  total,
  label = "records",
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  label?: string;
  onPage: (nextPage: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="pagination-bar">
      <small className="muted">
        Page {page} of {totalPages} · {total} {label}
      </small>
      {totalPages > 1 && (
        <div className="actions" style={{ margin: 0 }}>
          <button
            type="button"
            className="button outline small"
            disabled={page <= 1}
            onClick={() => onPage(Math.max(1, page - 1))}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            type="button"
            className="button outline small"
            disabled={page >= totalPages}
            onClick={() => onPage(Math.min(totalPages, page + 1))}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
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

