import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Clock,
  Eye,
  Megaphone,
  Play,
  Send,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "../api";
import { Empty, ErrorBox, ConfirmDialog } from "../components/Common";
import { useAdminAuth } from "../context/AdminAuthContext";
import type {
  AdminNotificationCampaign,
  AdminOverviewData,
  AdminSaveFn,
  AdminSectionId,
} from "./AdminTypes";

const tabMap: Record<string, AdminSectionId> = {
  "printed-orders": "Printed Orders",
  payments: "Payments",
  "online-access": "Online Access",
  "bulk-orders": "Bulk Orders",
  devotionals: "Devotionals",
  notifications: "Notifications",
};

function makeDraftKey() {
  return `admin_camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const SAFE_DESTINATIONS = [
  { value: "/dashboard", label: "Reader Dashboard (/dashboard)" },
  { value: "/library", label: "Devotional Library (/library)" },
  { value: "/sample", label: "Free Sample Devotional (/sample)" },
  { value: "/journal", label: "My Growth Journal (/journal)" },
  { value: "/digital-edition", label: "2027 Online Access (/digital-edition)" },
  { value: "/bookstore", label: "Printed Book (/bookstore)" },
  { value: "/notifications", label: "Notification Center (/notifications)" },
  { value: "/account", label: "Account & Reminders (/account)" },
  { value: "/install", label: "Install Mobile App Guide (/install)" },
];

type SearchReaderRow = {
  id: number;
  name: string;
  email: string;
  accessStatus: string;
  notificationsEnabled: boolean;
  announcementsEnabled: boolean;
  pushDevicesCount: number;
};

type CampaignPreview = {
  totalMatchedReaders: number;
  eligibleCount: number;
  skippedOptOutCount: number;
  subscribedPushReadersCount: number;
  sampleRecipients: Array<{ id: number; name: string; accessStatus: string }>;
};

type CampaignsResponse = {
  items: AdminNotificationCampaign[];
  total: number;
  page: number;
  totalPages: number;
};

export function NotificationsPage({
  data,
  busy,
  save,
  reload,
  onNavigate,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
  reload?: () => void;
  onNavigate: (tab: AdminSectionId) => void;
}) {
  const { hasPermission, toast } = useAdminAuth();
  const canWrite = hasPermission("notifications.write");
  const canBroadcast = hasPermission("notifications.broadcast");

  const alerts = data.operationalAlerts || [];
  const pushSummary = data.pushStatusSummary;

  const [targetType, setTargetType] = useState<"individual" | "all" | "segment">(
    "individual",
  );
  const [targetSegment, setTargetSegment] = useState<
    "free" | "pending_payment" | "scheduled" | "active" | "expired" | "revoked"
  >("free");
  const [category, setCategory] = useState<
    "announcement" | "account" | "system" | "subscription"
  >("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("/dashboard");
  const [deliveryTiming, setDeliveryTiming] = useState<"now" | "later">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [draftKey, setDraftKey] = useState<string>(() => makeDraftKey());

  const [readerSearch, setReaderSearch] = useState("");
  const [readerSegmentFilter, setReaderSegmentFilter] = useState<
    "all" | "free" | "pending_payment" | "scheduled" | "active" | "expired" | "revoked"
  >("all");
  const [readerResults, setReaderResults] = useState<SearchReaderRow[]>([]);
  const [selectedReader, setSelectedReader] = useState<SearchReaderRow | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);

  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [campaignsData, setCampaignsData] = useState<CampaignsResponse | null>(
    null,
  );
  const [cancelTarget, setCancelTarget] =
    useState<AdminNotificationCampaign | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const confirmDialogRef = useRef<HTMLDialogElement | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api<CampaignsResponse>(
        `/admin/notifications/campaigns?page=${campaignsPage}&limit=10`,
      );
      setCampaignsData(res);
    } catch {
      // Initial fallback uses overview summary campaigns
    }
  }, [campaignsPage]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!canWrite || targetType !== "individual") return;
    let active = true;
    setSearchLoading(true);
    const params = new URLSearchParams({ limit: "25" });
    if (readerSearch.trim()) params.set("search", readerSearch.trim());
    if (readerSegmentFilter !== "all") params.set("segment", readerSegmentFilter);
    api<{ items: SearchReaderRow[] }>(
      `/admin/notifications/readers?${params.toString()}`,
    )
      .then((res) => {
        if (active) setReaderResults(res.items || []);
      })
      .catch(() => {
        if (active) setReaderResults([]);
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canWrite, targetType, readerSearch, readerSegmentFilter]);

  useEffect(() => {
    setDraftKey(makeDraftKey());
  }, [targetType, targetSegment, selectedReader?.id, title, body, actionUrl, scheduledLocal, deliveryTiming]);

  const effectiveCategory =
    targetType === "individual" ? category : "announcement";

  const buildPayload = () => {
    let scheduledFor: string | null = null;
    if (deliveryTiming === "later") {
      if (!scheduledLocal) {
        throw new Error("Choose a future date and time for scheduled delivery.");
      }
      const dt = new Date(scheduledLocal);
      if (Number.isNaN(dt.getTime())) {
        throw new Error("Enter a valid scheduled date and time.");
      }
      if (dt.getTime() < Date.now() - 60_000) {
        throw new Error("Scheduled delivery time must be in the future.");
      }
      scheduledFor = dt.toISOString();
    }
    return {
      targetType,
      targetSegment: targetType === "segment" ? targetSegment : undefined,
      targetUserId:
        targetType === "individual" ? selectedReader?.id : undefined,
      category: effectiveCategory,
      title: title.trim(),
      body: body.trim(),
      actionUrl: actionUrl.trim() || "/dashboard",
      scheduledFor,
    };
  };

  async function runPreview(openConfirm = false) {
    setComposerError("");
    setComposerBusy(true);
    try {
      const payload = buildPayload();
      const res = await api<CampaignPreview>(
        "/admin/notifications/preview",
        payload,
      );
      setPreview(res);
      if (openConfirm) {
        const dlg = confirmDialogRef.current;
        if (dlg && !dlg.open) {
          dlg.showModal();
        }
      }
    } catch (err) {
      setComposerError((err as Error).message);
    } finally {
      setComposerBusy(false);
    }
  }

  async function submitConfirmedCampaign() {
    if (composerBusy) return;
    setComposerError("");
    setComposerBusy(true);
    try {
      const payload = buildPayload();
      const res = await api<{
        deduplicated: boolean;
        campaign: AdminNotificationCampaign;
      }>("/admin/notifications/campaigns", {
        ...payload,
        confirmed: true,
        idempotencyKey: draftKey,
      });

      if (confirmDialogRef.current?.open) {
        confirmDialogRef.current.close();
      }

      toast(
        res.deduplicated
          ? "Duplicate request prevented; existing notification campaign reused."
          : res.campaign.status === "scheduled"
            ? `Notification scheduled for ${res.campaign.eligibleCount} eligible reader(s).`
            : `Notification queued (${res.campaign.inAppCreatedCount} in-app alert(s) created).`,
      );
      setTitle("");
      setBody("");
      setPreview(null);
      setScheduledLocal("");
      setDeliveryTiming("now");
      setDraftKey(makeDraftKey());
      await loadCampaigns();
      reload?.();
    } catch (err) {
      if (confirmDialogRef.current?.open) {
        confirmDialogRef.current.close();
      }
      setComposerError((err as Error).message);
    } finally {
      setComposerBusy(false);
    }
  }

  const historyItems =
    campaignsData?.items || pushSummary?.campaigns || [];

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <div>
          <h2>Operational Notifications &amp; Reminder Worker</h2>
          <p className="muted" style={{ margin: 0 }}>
            Real-time operational alerts, administrator reader messaging, and
            background Web Push worker delivery.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="button small"
            disabled={busy}
            onClick={async () => {
              const ok = await save(
                "/admin/notifications/run-worker",
                {},
                "POST",
                "Notification worker cycle executed.",
              );
              if (ok) {
                await loadCampaigns();
                reload?.();
              }
            }}
          >
            <Play size={15} /> Run Notification Worker Now
          </button>
        )}
      </div>

      {/* Administrator Reader Notification & Broadcast Composer */}
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h3>Compose Reader Notification or Announcement</h3>
            <small className="muted">
              Send an in-app notification (and push alert when enabled) to one
              reader, an access segment, or all opted-in readers. Never targets
              staff admin accounts.
            </small>
          </div>
          <Megaphone size={20} />
        </div>

        {!canWrite ? (
          <div className="notice">
            <ShieldAlert size={18} />
            <div>
              <strong>Composer restricted for your role</strong>
              <p>
                Your administrator role has read-only access to notification
                history. Only the owner or explicitly permitted administrators
                can compose reader messages.
              </p>
            </div>
          </div>
        ) : (
          <div className="notif-composer-grid">
            <div className="stack">
              <div className="stack" style={{ gap: "8px" }}>
                <strong>1. Select audience</strong>
                <div className="actions">
                  <button
                    type="button"
                    className={
                      targetType === "individual"
                        ? "button small"
                        : "button outline small"
                    }
                    onClick={() => {
                      setTargetType("individual");
                      setPreview(null);
                    }}
                  >
                    <UserCheck size={14} /> One Reader
                  </button>
                  <button
                    type="button"
                    className={
                      targetType === "all"
                        ? "button small"
                        : "button outline small"
                    }
                    disabled={!canBroadcast}
                    title={
                      !canBroadcast
                        ? "Owner grant required for broadcasts"
                        : undefined
                    }
                    onClick={() => {
                      setTargetType("all");
                      setPreview(null);
                    }}
                  >
                    <Users size={14} /> All Eligible Readers
                  </button>
                  <button
                    type="button"
                    className={
                      targetType === "segment"
                        ? "button small"
                        : "button outline small"
                    }
                    disabled={!canBroadcast}
                    title={
                      !canBroadcast
                        ? "Owner grant required for segment broadcasts"
                        : undefined
                    }
                    onClick={() => {
                      setTargetType("segment");
                      setPreview(null);
                    }}
                  >
                    <Megaphone size={14} /> Audience Segment
                  </button>
                </div>
                {!canBroadcast && (
                  <small className="muted">
                    Multi-reader broadcasts require explicit{" "}
                    <code>notifications.broadcast</code> permission from the
                    portal owner. You can still send individual reader notices.
                  </small>
                )}
              </div>

              {targetType === "individual" && (
                <div className="stack" style={{ gap: "8px" }}>
                  <div className="form-row-2">
                    <label>
                      Search registered reader (by name or email)
                      <input
                        placeholder="Type reader name or email..."
                        value={readerSearch}
                        onChange={(e) => setReaderSearch(e.target.value)}
                      />
                    </label>
                    <label>
                      Filter by access segment
                      <select
                        aria-label="Filter individual reader search by segment"
                        value={readerSegmentFilter}
                        onChange={(e) =>
                          setReaderSegmentFilter(
                            e.target.value as typeof readerSegmentFilter,
                          )
                        }
                      >
                        <option value="all">All access states</option>
                        <option value="free">Free readers</option>
                        <option value="pending_payment">Payment pending</option>
                        <option value="scheduled">Scheduled 2027</option>
                        <option value="active">Active 2027</option>
                        <option value="expired">Expired</option>
                        <option value="revoked">Revoked</option>
                      </select>
                    </label>
                  </div>
                  <div
                    className="reader-search-list"
                    aria-label="Reader search results"
                  >
                    {searchLoading ? (
                      <small className="muted">Loading readers...</small>
                    ) : readerResults.length === 0 ? (
                      <small className="muted">
                        No active reader accounts match your search.
                      </small>
                    ) : (
                      readerResults.map((r) => {
                        const isSelected = selectedReader?.id === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className={`reader-search-item ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedReader(r);
                              setPreview(null);
                            }}
                          >
                            <div>
                              <strong>{r.name}</strong> ·{" "}
                              <small>{r.email}</small>
                              <br />
                              <small className="muted">
                                Access: {r.accessStatus} ·{" "}
                                {r.announcementsEnabled
                                  ? "Announcements opted in"
                                  : "Announcements opted out"}{" "}
                                · {r.pushDevicesCount} push device(s)
                              </small>
                            </div>
                            <span className="pill">
                              {isSelected ? "Selected" : "Choose"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {targetType === "segment" && (
                <label>
                  Target reader access segment
                  <select
                    value={targetSegment}
                    onChange={(e) => {
                      setTargetSegment(
                        e.target.value as typeof targetSegment,
                      );
                      setPreview(null);
                    }}
                  >
                    <option value="free">Free readers</option>
                    <option value="pending_payment">Pending payment</option>
                    <option value="scheduled">
                      Scheduled (pre-2027 confirmed)
                    </option>
                    <option value="active">Active online access</option>
                    <option value="expired">Expired online access</option>
                    <option value="revoked">Revoked access</option>
                  </select>
                </label>
              )}

              <div className="two-col" style={{ gap: "12px" }}>
                <label>
                  Notification category
                  <select
                    value={effectiveCategory}
                    disabled={targetType !== "individual"}
                    onChange={(e) =>
                      setCategory(e.target.value as typeof category)
                    }
                  >
                    <option value="announcement">
                      Community Announcement (respects opt-in)
                    </option>
                    {targetType === "individual" && (
                      <>
                        <option value="account">
                          Essential Account / Support Notice
                        </option>
                        <option value="subscription">
                          Online Access Update
                        </option>
                        <option value="system">System Service Notice</option>
                      </>
                    )}
                  </select>
                </label>

                <label>
                  Destination screen inside app
                  <select
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                  >
                    {SAFE_DESTINATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                <small className="muted">Quick templates:</small>
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => {
                    setTitle("Welcome to Balanced Life");
                    setBody(
                      "We're glad you're here. Your devotional journey starts with one step.",
                    );
                    setPreview(null);
                  }}
                >
                  Welcome preset
                </button>
                <button
                  type="button"
                  className="button outline small"
                  onClick={() => {
                    setTitle("A Message from Cossy Teens Consult");
                    setBody(
                      "Thank you for being part of our community. We have an important update for our readers.",
                    );
                    setPreview(null);
                  }}
                >
                  Community announcement preset
                </button>
              </div>

              <label>
                Notification title
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="e.g. A Message from Cossy Teens Consult"
                />
              </label>

              <label>
                Message body (plain text only, max 600 chars)
                <textarea
                  required
                  maxLength={600}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Write a clear, helpful message for your readers..."
                />
              </label>

              <div className="two-col" style={{ gap: "12px" }}>
                <label>
                  Delivery schedule
                  <select
                    value={deliveryTiming}
                    onChange={(e) =>
                      setDeliveryTiming(e.target.value as "now" | "later")
                    }
                  >
                    <option value="now">Send Now (Queue Immediately)</option>
                    <option value="later">Schedule for Later</option>
                  </select>
                </label>
                {deliveryTiming === "later" && (
                  <label>
                    Scheduled date &amp; time
                    <input
                      type="datetime-local"
                      value={scheduledLocal}
                      onChange={(e) => setScheduledLocal(e.target.value)}
                    />
                  </label>
                )}
              </div>

              <ErrorBox message={composerError} />

              <div className="actions">
                <button
                  type="button"
                  className="button outline small"
                  disabled={composerBusy}
                  onClick={() => runPreview(false)}
                >
                  <Eye size={15} /> Preview Eligible Count
                </button>
                <button
                  type="button"
                  className="button small"
                  disabled={composerBusy}
                  onClick={() => runPreview(true)}
                >
                  <Send size={15} />{" "}
                  {deliveryTiming === "later"
                    ? "Review & Schedule"
                    : "Review & Send Now"}
                </button>
              </div>
            </div>

            <div className="stack">
              <strong>Live Reader Preview</strong>
              <div className="notif-preview-card">
                <span className="pill" style={{ alignSelf: "flex-start" }}>
                  {effectiveCategory}
                </span>
                <strong>{title.trim() || "Notification title preview"}</strong>
                <p style={{ margin: 0 }}>
                  {body.trim() ||
                    "Your notification message body will display cleanly inside the reader's Notification Center and Web Push toast (truncated cleanly at 240 chars for push)."}
                </p>
                <small className="muted">
                  Destination: <code>{actionUrl}</code>
                </small>
              </div>

              {preview && (
                <div className="notice success">
                  <Users size={18} />
                  <div>
                    <strong>
                      Eligible Recipients: {preview.eligibleCount}
                    </strong>
                    <p>
                      Matched cohort: {preview.totalMatchedReaders} · Opted out
                      / skipped: {preview.skippedOptOutCount} · Subscribed push
                      readers: {preview.subscribedPushReadersCount}
                    </p>
                    {preview.sampleRecipients.length > 0 && (
                      <small>
                        Sample:{" "}
                        {preview.sampleRecipients
                          .map((r) => `${r.name} (${r.accessStatus})`)
                          .join(", ")}
                      </small>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Sending / Broadcasts */}
      <dialog
        ref={confirmDialogRef}
        className="admin-confirm-dialog"
        aria-labelledby="confirm-campaign-title"
      >
        <div className="stack">
          <h3 id="confirm-campaign-title" style={{ margin: 0 }}>
            Confirm Reader Notification Dispatch
          </h3>
          {preview && (
            <div className="stack" style={{ gap: "8px" }}>
              <p style={{ margin: 0 }}>
                Target:{" "}
                <strong>
                  {targetType === "individual"
                    ? selectedReader?.email
                    : targetType === "segment"
                      ? `Segment: ${targetSegment}`
                      : "All eligible opted-in readers"}
                </strong>
              </p>
              <p style={{ margin: 0 }}>
                Eligible recipients: <strong>{preview.eligibleCount}</strong>{" "}
                (Opted-out skipped: {preview.skippedOptOutCount})
              </p>
              <p style={{ margin: 0 }}>
                Title: <strong>{title}</strong>
              </p>
              {deliveryTiming === "later" && scheduledLocal && (
                <p style={{ margin: 0 }}>
                  <Clock size={14} style={{ display: "inline" }} /> Scheduled:{" "}
                  <strong>{new Date(scheduledLocal).toLocaleString()}</strong>
                </p>
              )}
            </div>
          )}
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="button outline small"
              autoFocus
              disabled={composerBusy}
              onClick={() => confirmDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button small"
              disabled={composerBusy}
              onClick={submitConfirmedCampaign}
            >
              Confirm &amp;{" "}
              {deliveryTiming === "later" ? "Schedule" : "Queue Notification"}
            </button>
          </div>
        </div>
      </dialog>

      {/* Campaign Delivery History */}
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h3>Administrator Notification Campaign History</h3>
            <small className="muted">
              Push acceptance records reflect push-service HTTP 201 delivery and
              never assume the notification was read until the reader opens it.
            </small>
          </div>
        </div>

        {historyItems.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Created / Scheduled</th>
                    <th>Audience</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Eligible / Opted Out Skipped</th>
                    <th>In-App Created</th>
                    <th>Push (Att / Acc / Skip-Fail)</th>
                    <th>Read In-App</th>
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {new Date(c.createdAt).toLocaleString("en-GB")}
                        {c.scheduledFor && (
                          <>
                            <br />
                            <small className="muted">
                              Sched:{" "}
                              {new Date(c.scheduledFor).toLocaleString("en-GB")}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        <span className="pill">{c.targetType}</span>{" "}
                        {c.targetSegment || (c.targetUserId ? `#${c.targetUserId}` : "")}
                        <br />
                        <small className="muted">{c.actorEmail}</small>
                      </td>
                      <td>
                        <strong>{c.title}</strong>
                        <br />
                        <small className="muted">
                          {c.body.slice(0, 72)}
                          {c.body.length > 72 ? "…" : ""} ·{" "}
                          <code>{c.actionUrl}</code>
                        </small>
                      </td>
                      <td>
                        <span className="pill">{c.status}</span>
                        {c.status === "scheduled" && canWrite && (
                          <button
                            type="button"
                            className="text-link"
                            style={{ display: "block", marginTop: "4px" }}
                            onClick={() => {
                              setCancelError("");
                              setCancelTarget(c);
                            }}
                          >
                            Cancel schedule
                          </button>
                        )}
                      </td>
                      <td>
                        {c.eligibleCount} eligible
                        <br />
                        <small className="muted">
                          {c.skippedOptOutCount} opt-out skipped
                        </small>
                      </td>
                      <td>
                        {c.inAppCreatedCount}{" "}
                        <small className="muted">({c.queuedCount} q)</small>
                      </td>
                      <td>
                        {c.pushAttempts} / {c.pushProviderAccepted} /{" "}
                        {c.pushFailedOrSkipped}
                      </td>
                      <td>{c.readCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {campaignsData && campaignsData.totalPages > 1 && (
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="button outline small"
                  disabled={campaignsPage <= 1}
                  onClick={() => setCampaignsPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {campaignsData.page} of {campaignsData.totalPages}
                </span>
                <button
                  type="button"
                  className="button outline small"
                  disabled={campaignsPage >= campaignsData.totalPages}
                  onClick={() => setCampaignsPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">No administrator campaigns sent yet.</p>
        )}
      </div>

      {/* Operational Alerts for Administrator */}
      <div className="panel stack">
        <h3>Active Operational Alerts ({alerts.length})</h3>
        {alerts.length ? (
          alerts.map((al) => {
            const targetTab = tabMap[al.actionTab] || "Overview";
            return (
              <div
                className={
                  "notice " + (al.severity === "high" ? "" : "success")
                }
                key={al.id}
              >
                <AlertCircle size={20} />
                <div style={{ flex: 1 }}>
                  <strong>{al.title}</strong>
                  <p style={{ margin: "4px 0 8px" }}>{al.description}</p>
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => onNavigate(targetTab)}
                  >
                    Open {targetTab} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <Empty title="All operational queues are clear">
            No pending delivery quotations, unverified bank transfers, or
            delayed dispatches require immediate attention.
          </Empty>
        )}
      </div>

      {/* Reader Web Push & Background Reminder Summary */}
      <div className="panel stack">
        <div className="section-title" style={{ margin: 0 }}>
          <div>
            <h3>Reader Web Push &amp; Scheduled Reminder Delivery</h3>
            <small className="muted">
              VAPID Status:{" "}
              {pushSummary?.configured ? "Configured & Active" : "Unconfigured"}{" "}
              · Active Subscribed Devices:{" "}
              <strong>{pushSummary?.activePushDevicesCount ?? 0}</strong>
            </small>
          </div>
          <Bell size={20} />
        </div>

        {pushSummary?.recentEvents && pushSummary.recentEvents.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Body</th>
                  <th>Action URL</th>
                </tr>
              </thead>
              <tbody>
                {pushSummary.recentEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>{new Date(ev.createdAt).toLocaleString("en-GB")}</td>
                    <td>
                      <span className="pill">{ev.category}</span>
                    </td>
                    <td>
                      <strong>{ev.title}</strong>
                    </td>
                    <td>{ev.body}</td>
                    <td>
                      <code>{ev.actionUrl}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No reader notification events have been generated yet.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`Cancel scheduled notification "${cancelTarget?.title || ""}"?`}
        description="Scheduled delivery will be stopped and pending queued items for this campaign cancelled."
        confirmLabel="Cancel Scheduled Notification"
        busy={cancelBusy}
        error={cancelError}
        onCancel={() => {
          setCancelError("");
          setCancelTarget(null);
        }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          setCancelBusy(true);
          setCancelError("");
          try {
            await api(
              `/admin/notifications/campaigns/${cancelTarget.id}/cancel`,
              {},
            );
            setCancelTarget(null);
            await loadCampaigns();
            reload?.();
            toast("Scheduled campaign cancelled.");
          } catch (err) {
            setCancelError((err as Error).message);
          } finally {
            setCancelBusy(false);
          }
        }}
      />
    </div>
  );
}
