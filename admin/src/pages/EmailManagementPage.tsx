import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Monitor,
} from "lucide-react";
import { api } from "../api";
import { ConfirmDialog, Empty, ErrorBox, Loading } from "../components/Common";
import { useAdminAuth } from "../context/AdminAuthContext";

type EmailTemplateId =
  | "welcome"
  | "password_reset_code"
  | "password_changed"
  | "online_access_confirmed"
  | "online_access_expiry_reminder"
  | "online_access_renewed"
  | "printed_order_received"
  | "delivery_quotation_ready"
  | "printed_payment_confirmed"
  | "order_dispatched"
  | "order_delivered"
  | "admin_announcement"
  | "daily_devotional_reminder";

type TemplateCatalogItem = {
  id: EmailTemplateId;
  label: string;
  category: "transactional" | "optional";
  description: string;
};

type EmailOverview = {
  configuration: {
    configured: boolean;
    provider: string;
    fromAddress: string;
    replyToAddress: string;
    senderDomain: string;
    domainVerified: boolean;
  };
  counts: {
    pending: number;
    retrying: number;
    sent: number;
    failed: number;
    bounced: number;
    suppressed: number;
    suppressedReaders: number;
  };
  recentQueue: Array<{
    id: number;
    userId: number | null;
    recipientEmail: string;
    recipientName: string;
    templateId: string;
    category: "transactional" | "optional";
    subject: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    provider: string;
    lastError: string | null;
    nextAttemptAt: string;
    sentAt: string | null;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: number;
    recipientEmail: string;
    templateId: string;
    eventType: string;
    provider: string;
    detail: string | null;
    createdAt: string;
  }>;
  campaigns: Array<{
    id: number;
    actorName: string;
    targetType: "individual" | "segment" | "all";
    targetSegment: string | null;
    targetUserId: number | null;
    audienceChannel: "announcements" | "community_updates";
    subject: string;
    actionPath: string;
    status: string;
    scheduledFor: string | null;
    eligibleCount: number;
    skippedOptOutCount: number;
    queuedCount: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
  }>;
  templates: TemplateCatalogItem[];
};

type TemplatePreviewResponse = {
  templateId: EmailTemplateId;
  category: "transactional" | "optional";
  subject: string;
  previewText: string;
  html: string;
  text: string;
};

type SearchReaderRow = {
  id: number;
  name: string;
  email: string;
  accessState: string;
  notificationsEnabled: boolean;
};

type CampaignPreviewResponse = {
  totalMatchedReaders: number;
  eligibleCount: number;
  skippedOptOutCount: number;
  sampleRecipients: Array<{ id: number; name: string; email: string }>;
  previewHtml: string;
  previewText: string;
};

const SEGMENT_LABELS: Record<string, string> = {
  all: "All opted-in readers",
  free: "Free readers",
  pending_payment: "Pending payment verification",
  scheduled: "Scheduled 2027 access",
  active: "Active online readers",
  expired: "Expired access readers",
  revoked: "Revoked access readers",
};

const makeDraftKey = () =>
  `email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function EmailManagementPage({
  setMessage,
}: {
  setMessage?: (msg: string) => void;
}) {
  const { admin, hasPermission } = useAdminAuth();
  const canWrite =
    hasPermission("notifications.write") || hasPermission("settings.write");

  const [overview, setOverview] = useState<EmailOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [workerBusy, setWorkerBusy] = useState(false);

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setMessage?.(msg);
  };

  // Template preview & test email state
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<EmailTemplateId>("welcome");
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [templatePreview, setTemplatePreview] =
    useState<TemplatePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  // Campaign composer state
  const [targetType, setTargetType] = useState<"individual" | "segment" | "all">(
    "segment",
  );
  const [targetSegment, setTargetSegment] = useState<
    "free" | "pending_payment" | "scheduled" | "active" | "expired" | "revoked"
  >("active");
  const [audienceChannel, setAudienceChannel] = useState<
    "announcements" | "community_updates"
  >("announcements");
  const [readerSearch, setReaderSearch] = useState("");
  const [readerResults, setReaderResults] = useState<SearchReaderRow[]>([]);
  const [selectedReader, setSelectedReader] = useState<SearchReaderRow | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [actionPath, setActionPath] = useState("/dashboard");
  const [actionLabel, setActionLabel] = useState("Open Balanced Life App");
  const [deliveryTiming, setDeliveryTiming] = useState<"now" | "later">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [draftKey, setDraftKey] = useState<string>(() => makeDraftKey());

  const [campaignPreview, setCampaignPreview] =
    useState<CampaignPreviewResponse | null>(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<
    EmailOverview["campaigns"][number] | null
  >(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [retryingQueueId, setRetryingQueueId] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await api<EmailOverview>("/admin/email/overview");
      setOverview(res);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    api<TemplatePreviewResponse>(
      `/admin/email/templates/preview?templateId=${encodeURIComponent(selectedTemplateId)}`,
    )
      .then((res) => {
        if (active) setTemplatePreview(res);
      })
      .catch((err) => {
        if (active) setActionError((err as Error).message);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!canWrite || targetType !== "individual") return;
    let active = true;
    setSearchLoading(true);
    const params = new URLSearchParams({ limit: "25" });
    if (readerSearch.trim()) params.set("search", readerSearch.trim());
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
  }, [canWrite, targetType, readerSearch]);

  useEffect(() => {
    setDraftKey(makeDraftKey());
  }, [
    targetType,
    targetSegment,
    audienceChannel,
    selectedReader?.id,
    subject,
    body,
    actionPath,
    actionLabel,
    deliveryTiming,
    scheduledLocal,
  ]);

  function buildCampaignPayload() {
    let scheduledFor: string | null = null;
    if (deliveryTiming === "later") {
      if (!scheduledLocal) {
        throw new Error("Choose a date and time for scheduled delivery.");
      }
      const parsed = new Date(scheduledLocal);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Enter a valid scheduled date and time.");
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        throw new Error("Scheduled email delivery time must be in the future.");
      }
      scheduledFor = parsed.toISOString();
    }
    if (targetType === "individual" && !selectedReader) {
      throw new Error("Select a recipient reader first.");
    }
    return {
      targetType,
      targetSegment: targetType === "segment" ? targetSegment : undefined,
      targetUserId:
        targetType === "individual" ? selectedReader?.id : undefined,
      audienceChannel,
      title: subject.trim(),
      body: body.trim(),
      actionPath: actionPath.trim() || "/dashboard",
      actionLabel: actionLabel.trim() || "Open Balanced Life App",
      scheduledFor,
      idempotencyKey: draftKey,
    };
  }

  async function handlePreviewCampaign(openConfirmAfter: boolean) {
    setComposerError("");
    setActionError("");
    try {
      const payload = buildCampaignPayload();
      setCampaignBusy(true);
      const res = await api<CampaignPreviewResponse>(
        "/admin/email/campaigns/preview",
        payload,
      );
      setCampaignPreview(res);
      if (openConfirmAfter) {
        setConfirmSendOpen(true);
      }
    } catch (err) {
      setComposerError((err as Error).message);
    } finally {
      setCampaignBusy(false);
    }
  }

  async function handleConfirmSendCampaign() {
    setComposerError("");
    try {
      const payload = buildCampaignPayload();
      setCampaignBusy(true);
      const res = await api<{
        deduplicated: boolean;
        campaign: EmailOverview["campaigns"][number];
      }>("/admin/email/campaigns", payload);
      setConfirmSendOpen(false);
      setSubject("");
      setBody("");
      setCampaignPreview(null);
      notify(
        res.campaign.status === "scheduled"
          ? `Email campaign scheduled for ${res.campaign.eligibleCount} opted-in readers.`
          : `Email campaign queued for ${res.campaign.queuedCount} opted-in readers (${res.campaign.skippedOptOutCount} skipped opt-out/suppressed).`,
      );
      await loadOverview();
    } catch (err) {
      setComposerError((err as Error).message);
    } finally {
      setCampaignBusy(false);
    }
  }

  async function handleSendTestEmail() {
    setActionError("");
    setTestBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        sentTo: string;
        subject: string;
        provider: string;
        error?: string;
      }>("/admin/email/test", { templateId: selectedTemplateId });
      if (!res.ok) {
        setActionError(
          res.error || "Test email delivery failed with the active provider.",
        );
      } else {
        notify(
          `Test email "${res.subject}" sent to ${res.sentTo} via ${res.provider}.`,
        );
      }
      await loadOverview();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTestBusy(false);
    }
  }

  async function handleRunWorker() {
    setActionError("");
    setWorkerBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        result: {
          queue: { sent: number; retried: number; failed: number };
          campaignsReleased: number;
          remindersQueued: number;
        };
      }>("/admin/email/run-worker", {});
      notify(
        `Email worker completed: ${res.result.queue.sent} sent, ${res.result.queue.retried} retried, ${res.result.queue.failed} failed, ${res.result.remindersQueued} reminders queued.`,
      );
      await loadOverview();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setWorkerBusy(false);
    }
  }

  async function handleRetryQueue(id: number) {
    setActionError("");
    setRetryingQueueId(id);
    try {
      await api(`/admin/email/queue/${id}/retry`, {});
      notify(`Delivery #${id} re-queued and processed.`);
      await loadOverview();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setRetryingQueueId(null);
    }
  }

  async function handleCancelCampaign() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      await api(`/admin/email/campaigns/${cancelTarget.id}/cancel`, {});
      notify(`Cancelled scheduled email campaign #${cancelTarget.id}.`);
      setCancelTarget(null);
      await loadOverview();
    } catch (err) {
      setCancelError((err as Error).message);
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading && !overview) return <Loading />;
  if (loadError && !overview) return <ErrorBox message={loadError} />;
  if (!overview) return null;

  const selectedCatalog = overview.templates.find(
    (t) => t.id === selectedTemplateId,
  );

  return (
    <div className="stack">
      <div className="row wrap between">
        <div>
          <h2>Email System &amp; Templates</h2>
          <p className="muted small">
            Monitor transactional &amp; optional email delivery separately from
            Web Push notifications.
          </p>
        </div>
        <div className="row wrap">
          <button
            type="button"
            className="button outline small"
            onClick={() => void loadOverview()}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {canWrite && (
            <button
              type="button"
              className="button small"
              disabled={workerBusy}
              onClick={() => void handleRunWorker()}
            >
              <Send size={15} />
              {workerBusy ? "Processing Queue..." : "Process Email Queue"}
            </button>
          )}
        </div>
      </div>

      <ErrorBox message={actionError} />
      {statusMessage && (
        <div className="notice">
          <CheckCircle2 size={18} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Provider & DNS Readiness */}
      <div className="email-grid-2">
        <div className="panel stack">
          <div className="row between">
            <h3>Provider Configuration</h3>
            <span
              className={`badge ${overview.configuration.configured ? "ok" : "warn"}`}
            >
              {overview.configuration.configured ? "Configured" : "Not Configured"}
            </span>
          </div>
          <div className="detail-grid">
            <div>
              <span className="muted small">Active provider</span>
              <strong>{overview.configuration.provider}</strong>
            </div>
            <div>
              <span className="muted small">Sender domain</span>
              <strong>{overview.configuration.senderDomain}</strong>
            </div>
            <div>
              <span className="muted small">From address</span>
              <strong>{overview.configuration.fromAddress}</strong>
            </div>
            <div>
              <span className="muted small">Reply-To address</span>
              <strong>{overview.configuration.replyToAddress}</strong>
            </div>
          </div>
          <div
            className={`notice ${overview.configuration.domainVerified ? "" : "warn-box"}`}
          >
            {overview.configuration.domainVerified ? (
              <ShieldCheck size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <div>
              <strong>
                {overview.configuration.domainVerified
                  ? "Sender Domain DNS Verified (SPF, DKIM, DMARC)"
                  : "Sender Domain DNS Unverified"}
              </strong>
              <p className="small muted" style={{ marginTop: 4 }}>
                {overview.configuration.domainVerified
                  ? `Verified sending domain ${overview.configuration.senderDomain} is active via EMAIL_DOMAIN_VERIFIED.`
                  : `SPF, DKIM, and DMARC records for ${overview.configuration.senderDomain} must be verified with your email provider and confirmed via EMAIL_DOMAIN_VERIFIED=true before live production launch.`}
              </p>
            </div>
          </div>
        </div>

        <div className="panel stack">
          <h3>Email Queue Health</h3>
          <div className="kpis">
            <div className="kpi">
              <span>Sent</span>
              <strong>{overview.counts.sent}</strong>
            </div>
            <div className="kpi">
              <span>Pending / Retrying</span>
              <strong>
                {overview.counts.pending + overview.counts.retrying}
              </strong>
            </div>
            <div className="kpi">
              <span>Failed</span>
              <strong>{overview.counts.failed}</strong>
            </div>
            <div className="kpi">
              <span>Bounced / Suppressed</span>
              <strong>
                {overview.counts.bounced + overview.counts.suppressedReaders}
              </strong>
            </div>
          </div>
          <p className="muted small">
            Bounces and spam complaints automatically suppress optional and
            bouncing emails without altering Web Push or In-App alerts.
          </p>
        </div>
      </div>

      {/* 13 Branded Template Preview & Test Sender */}
      <div className="panel stack">
        <div className="row wrap between">
          <div>
            <h3>Email Templates &amp; Live Preview ({overview.templates.length})</h3>
            <p className="muted small">
              Inspect desktop/mobile HTML formatting and plain-text fallbacks, or
              send a sample to your administrator inbox ({admin?.email}).
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              className="button small"
              disabled={testBusy || previewLoading}
              onClick={() => void handleSendTestEmail()}
            >
              <Mail size={15} />
              {testBusy ? "Sending Test..." : "Send Test to My Inbox"}
            </button>
          )}
        </div>

        <div className="email-template-bar">
          <label style={{ flex: "1 1 260px" }}>
            Select email template
            <select
              value={selectedTemplateId}
              onChange={(e) =>
                setSelectedTemplateId(e.target.value as EmailTemplateId)
              }
            >
              {overview.templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label} ({tpl.category === "transactional" ? "Transactional" : "Optional"})
                </option>
              ))}
            </select>
          </label>

          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <button
              type="button"
              className={`button small ${previewMode === "html" ? "" : "outline"}`}
              onClick={() => setPreviewMode("html")}
            >
              <Eye size={14} /> HTML View
            </button>
            <button
              type="button"
              className={`button small ${previewMode === "text" ? "" : "outline"}`}
              onClick={() => setPreviewMode("text")}
            >
              <FileText size={14} /> Plain Text
            </button>
            {previewMode === "html" && (
              <>
                <button
                  type="button"
                  className={`button small ${previewViewport === "desktop" ? "" : "outline"}`}
                  onClick={() => setPreviewViewport("desktop")}
                  aria-label="Desktop email preview"
                >
                  <Monitor size={14} /> Desktop
                </button>
                <button
                  type="button"
                  className={`button small ${previewViewport === "mobile" ? "" : "outline"}`}
                  onClick={() => setPreviewViewport("mobile")}
                  aria-label="Mobile email preview"
                >
                  <Smartphone size={14} /> Mobile
                </button>
              </>
            )}
          </div>
        </div>

        {selectedCatalog && (
          <div className="row wrap between muted small">
            <span>{selectedCatalog.description}</span>
            <span className="badge">
              {selectedCatalog.category === "transactional"
                ? "Essential Transactional"
                : "Optional / Unsubscribable"}
            </span>
          </div>
        )}

        {previewLoading ? (
          <Loading />
        ) : templatePreview ? (
          <div className="stack">
            <div className="detail-grid">
              <div>
                <span className="muted small">Subject</span>
                <strong>{templatePreview.subject}</strong>
              </div>
              <div>
                <span className="muted small">Preheader</span>
                <span>{templatePreview.previewText}</span>
              </div>
            </div>
            {previewMode === "html" ? (
              <div
                className={`email-preview-stage ${previewViewport === "mobile" ? "is-mobile" : ""}`}
              >
                <iframe
                  title={`Preview of ${selectedTemplateId}`}
                  srcDoc={templatePreview.html}
                  sandbox=""
                  className="email-preview-frame"
                />
              </div>
            ) : (
              <pre className="email-text-preview">{templatePreview.text}</pre>
            )}
          </div>
        ) : null}
      </div>

      {/* Safe Plain-Text Campaign Composer */}
      {canWrite && (
        <div className="panel stack">
          <div>
            <h3>Compose Reader Email Campaign</h3>
            <p className="muted small">
              Announcements and community emails reach only readers who explicitly
              opted into that email channel and have not unsubscribed or bounced.
              Message content is safely escaped into our branded layout.
            </p>
          </div>

          <div className="grid2">
            <label>
              Audience targeting
              <select
                value={targetType}
                onChange={(e) =>
                  setTargetType(
                    e.target.value as "individual" | "segment" | "all",
                  )
                }
              >
                <option value="segment">Reader access segment</option>
                <option value="individual">Single reader</option>
                <option value="all">All opted-in readers</option>
              </select>
            </label>

            <label>
              Optional email channel
              <select
                value={audienceChannel}
                onChange={(e) =>
                  setAudienceChannel(
                    e.target.value as "announcements" | "community_updates",
                  )
                }
              >
                <option value="announcements">General announcements</option>
                <option value="community_updates">Community updates</option>
              </select>
            </label>
          </div>

          {targetType === "segment" && (
            <label>
              Reader segment
              <select
                value={targetSegment}
                onChange={(e) =>
                  setTargetSegment(
                    e.target.value as
                      | "free"
                      | "pending_payment"
                      | "scheduled"
                      | "active"
                      | "expired"
                      | "revoked",
                  )
                }
              >
                {Object.entries(SEGMENT_LABELS)
                  .filter(([k]) => k !== "all")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {targetType === "individual" && (
            <div className="stack">
              <label>
                Search reader by name or email
                <input
                  value={readerSearch}
                  onChange={(e) => setReaderSearch(e.target.value)}
                  placeholder="Type reader name or email..."
                />
              </label>
              {searchLoading ? (
                <p className="muted small">Searching readers...</p>
              ) : (
                <div className="reader-pick-list">
                  {readerResults.slice(0, 8).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`reader-pick-item ${selectedReader?.id === r.id ? "is-selected" : ""}`}
                      onClick={() => setSelectedReader(r)}
                    >
                      <strong>{r.name}</strong>
                      <span className="muted small">
                        {r.email} • {r.accessState}
                      </span>
                    </button>
                  ))}
                  {readerResults.length === 0 && (
                    <p className="muted small">No matching readers found.</p>
                  )}
                </div>
              )}
              {selectedReader && (
                <div className="notice">
                  <CheckCircle2 size={16} />
                  <span>
                    Selected recipient: <strong>{selectedReader.name}</strong> (
                    {selectedReader.email})
                  </span>
                </div>
              )}
            </div>
          )}

          <label>
            Email subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={140}
              placeholder="e.g., Welcome to your 2027 Balanced Life reading journey"
            />
          </label>

          <label>
            Plain-text message body
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              placeholder="Write plain paragraphs separated by blank lines. Links and raw HTML tags are automatically escaped for reader safety."
            />
          </label>

          <div className="grid2">
            <label>
              Button destination path (in-app route)
              <input
                value={actionPath}
                onChange={(e) => setActionPath(e.target.value)}
                placeholder="/dashboard"
              />
            </label>
            <label>
              Button label
              <input
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
                placeholder="Open Balanced Life App"
              />
            </label>
          </div>

          <div className="grid2">
            <label>
              Delivery timing
              <select
                value={deliveryTiming}
                onChange={(e) =>
                  setDeliveryTiming(e.target.value as "now" | "later")
                }
              >
                <option value="now">Queue immediately</option>
                <option value="later">Schedule for later</option>
              </select>
            </label>

            {deliveryTiming === "later" && (
              <label>
                Scheduled local date &amp; time
                <input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                />
              </label>
            )}
          </div>

          <ErrorBox message={composerError} />

          <div className="row wrap">
            <button
              type="button"
              className="button outline"
              disabled={campaignBusy}
              onClick={() => void handlePreviewCampaign(false)}
            >
              <Eye size={15} /> Preview Audience &amp; Render
            </button>
            <button
              type="button"
              className="button"
              disabled={campaignBusy}
              onClick={() => void handlePreviewCampaign(true)}
            >
              <Send size={15} />{" "}
              {deliveryTiming === "later"
                ? "Review & Schedule Email"
                : "Review & Send Email"}
            </button>
          </div>

          {campaignPreview && (
            <div className="panel stack">
              <div className="row wrap between">
                <strong>Campaign Preview Summary</strong>
                <span className="muted small">
                  Matched: {campaignPreview.totalMatchedReaders} • Eligible
                  opted-in: {campaignPreview.eligibleCount} • Skipped opt-out /
                  suppressed: {campaignPreview.skippedOptOutCount}
                </span>
              </div>
              {campaignPreview.sampleRecipients.length > 0 && (
                <p className="muted small">
                  Sample eligible recipients:{" "}
                  {campaignPreview.sampleRecipients
                    .map((r) => `${r.name} (${r.email})`)
                    .join(", ")}
                </p>
              )}
              <iframe
                title="Campaign HTML preview"
                srcDoc={campaignPreview.previewHtml}
                sandbox=""
                className="email-preview-frame"
              />
            </div>
          )}
        </div>
      )}

      {/* Email Campaigns Table */}
      <div className="panel stack">
        <h3>Email Campaigns ({overview.campaigns.length})</h3>
        {overview.campaigns.length === 0 ? (
          <Empty title="No email campaigns yet">
            Composed announcements and community email campaigns will appear here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Channel / Audience</th>
                  <th>Status</th>
                  <th>Eligible / Skipped</th>
                  <th>Sent / Failed</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.subject}</strong>
                      <div className="muted small">by {c.actorName}</div>
                    </td>
                    <td>
                      <div>{c.audienceChannel}</div>
                      <div className="muted small">
                        {c.targetType === "segment"
                          ? c.targetSegment
                          : c.targetType}
                      </div>
                    </td>
                    <td>
                      <span className="badge">{c.status}</span>
                    </td>
                    <td>
                      {c.eligibleCount} eligible / {c.skippedOptOutCount}{" "}
                      skipped
                    </td>
                    <td>
                      {c.sentCount} sent / {c.failedCount} failed
                    </td>
                    <td className="small muted">
                      {c.scheduledFor
                        ? `Scheduled ${new Date(c.scheduledFor).toLocaleString()}`
                        : new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td>
                      {canWrite && c.status === "scheduled" ? (
                        <button
                          type="button"
                          className="button outline small"
                          onClick={() => {
                            setCancelError("");
                            setCancelTarget(c);
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delivery Queue & Failure Log */}
      <div className="panel stack">
        <h3>Recent Email Queue &amp; Failure Log</h3>
        {overview.recentQueue.length === 0 ? (
          <Empty title="Email queue is empty">
            Transactional and campaign email deliveries will appear here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Recipient</th>
                  <th>Template / Subject</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Error / Detail</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentQueue.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>
                      <strong>{item.recipientName}</strong>
                      <div className="muted small">{item.recipientEmail}</div>
                    </td>
                    <td>
                      <div>{item.subject}</div>
                      <div className="muted small">
                        {item.templateId} • {item.category}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          item.status === "sent"
                            ? "ok"
                            : item.status === "failed" ||
                                item.status === "bounced"
                              ? "bad"
                              : "warn"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.attempts}/{item.maxAttempts}
                    </td>
                    <td className="small muted">
                      {item.lastError ||
                        (item.sentAt
                          ? `Sent ${new Date(item.sentAt).toLocaleString()}`
                          : `Next ${new Date(item.nextAttemptAt).toLocaleString()}`)}
                    </td>
                    <td>
                      {canWrite &&
                      ["failed", "retrying", "pending"].includes(item.status) ? (
                        <button
                          type="button"
                          className="button outline small"
                          disabled={retryingQueueId === item.id}
                          onClick={() => void handleRetryQueue(item.id)}
                        >
                          {retryingQueueId === item.id ? "Retrying..." : "Retry"}
                        </button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bounce / Complaint / Delivery Events */}
      <div className="panel stack">
        <h3>Recent Provider Webhook &amp; Delivery Events</h3>
        {overview.recentEvents.length === 0 ? (
          <Empty title="No provider events recorded yet">
            Delivered, bounce, and complaint telemetry will be logged here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Recipient</th>
                  <th>Template</th>
                  <th>Provider</th>
                  <th>Detail</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <span className="badge">{ev.eventType}</span>
                    </td>
                    <td>{ev.recipientEmail}</td>
                    <td>{ev.templateId}</td>
                    <td>{ev.provider}</td>
                    <td className="small muted">{ev.detail || "—"}</td>
                    <td className="small muted">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmSendOpen}
        title={
          deliveryTiming === "later"
            ? "Schedule Reader Email Campaign"
            : "Send Reader Email Campaign"
        }
        description={
          campaignPreview
            ? `This will queue "${subject}" to ${campaignPreview.eligibleCount} eligible opted-in readers (${campaignPreview.skippedOptOutCount} opted-out or suppressed readers skipped).`
            : "Confirm queuing this email campaign."
        }
        confirmLabel={
          deliveryTiming === "later" ? "Confirm Schedule" : "Confirm & Queue Email"
        }
        busy={campaignBusy}
        error={composerError}
        onConfirm={() => void handleConfirmSendCampaign()}
        onCancel={() => setConfirmSendOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Scheduled Email Campaign"
        description={
          cancelTarget
            ? `Cancel scheduled campaign "${cancelTarget.subject}" before delivery begins?`
            : undefined
        }
        confirmLabel="Cancel Campaign"
        busy={cancelBusy}
        error={cancelError}
        onConfirm={() => void handleCancelCampaign()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
