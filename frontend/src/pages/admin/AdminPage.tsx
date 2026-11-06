import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gift,
  Landmark,
  PenLine,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useData } from "../../hooks/useData";
import { Empty, ErrorBox, Loading } from "../../components/Common";
import { api, money, monthName } from "../../api";
import type {
  AppSettings,
  BankAccountSetting,
  BulkOrderRecord,
  DigitalEntitlementRecord,
  DigitalPurchaseRecord,
  Entry,
  InquiryRecord,
  MonthlyTheme,
  PaymentRecord,
  Plan,
  SubscriptionDetails,
} from "../../types";

const blankEntry: Partial<Entry> = {
  date: "2027-01-01",
  title: "",
  theme: "",
  bibleText: "",
  memoryVerse: "",
  reflection: "",
  thinkAbout: "",
  prayer: "",
  challenge: "",
  sample: false,
  published: false,
  reviewStatus: "pending_review",
  reviewerNotes: "",
};

type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
  status: "active" | "suspended";
  suspendedReason: string;
  ageGroup?: string;
  guardianConsentConfirmed?: boolean;
  createdAt: string;
  subscription: SubscriptionDetails | null;
  digitalEntitlement?: DigitalEntitlementRecord | null;
  hasDigitalEdition?: boolean;
  planName: string | null;
  accessType: "paid" | "complimentary" | null;
  subscriptionStatus: string;
  expiresAt: string | null;
  renewalMode: "manual" | "automatic" | null;
  cancelAtPeriodEnd: boolean;
  grantReason: string;
};

type AdminOverviewData = {
  metrics: {
    readers: number;
    activeMemberships: number;
    paidMemberships: number;
    complimentaryMemberships: number;
    expiredMemberships: number;
    digitalEditionsSold: number;
    pendingDigitalPurchases: number;
    published: number;
    drafts: number;
    approvedReadings: number;
    needsRevisionReadings: number;
    completions: number;
    bookmarks: number;
    subscriptionRevenueKobo: number;
    digitalRevenueKobo: number;
    verifiedRevenueKobo: number;
    openInquiries: number;
    bulkOrderInquiries: number;
    openBulkOrders: number;
  };
  users: AdminUserRow[];
  devotionals: Entry[];
  themes: MonthlyTheme[];
  plans: Plan[];
  payments: PaymentRecord[];
  digitalPurchases: DigitalPurchaseRecord[];
  bulkOrders: BulkOrderRecord[];
  inquiries: InquiryRecord[];
  engagement: Array<{
    id: number;
    date: string;
    title: string;
    completions: number;
    bookmarks: number;
  }>;
  audit: Array<{
    id: number;
    adminId: number;
    adminName: string | null;
    action: string;
    createdAt: string;
  }>;
  settings: AppSettings;
  paymentsConfig: {
    configured: boolean;
    provider: "paystack";
  };
};

export function AdminPage() {
  const { data, error, reload } = useData<AdminOverviewData>("/admin/overview");
  const { toast, refreshConfig } = useApp();
  const [tab, setTab] = useState("Overview");

  // Devotional filters & pagination
  const [entrySearch, setEntrySearch] = useState("");
  const [entryMonth, setEntryMonth] = useState("all");
  const [entryVisibility, setEntryVisibility] = useState("all");
  const [entryReviewFilter, setEntryReviewFilter] = useState("all");
  const [entryPage, setEntryPage] = useState(1);
  const [showThemesManager, setShowThemesManager] = useState(false);

  // Devotional editor state
  const [edit, setEdit] = useState<any>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  // Reader management state
  const [readerSearch, setReaderSearch] = useState("");
  const [grantTarget, setGrantTarget] = useState<AdminUserRow | null>(null);
  const [grantPlanId, setGrantPlanId] = useState<number>(4);
  const [grantReason, setGrantReason] = useState("");

  // Digital purchases & Bulk orders state
  const [digitalFilter, setDigitalFilter] = useState("all");
  const [reconcileNotes, setReconcileNotes] = useState<Record<number, string>>(
    {},
  );
  const [bulkFilter, setBulkFilter] = useState("all");
  const [editingBulk, setEditingBulk] = useState<BulkOrderRecord | null>(null);

  // Inquiry filter state
  const [inquiryFilter, setInquiryFilter] = useState("all");

  // Editable bank accounts in Settings
  const [bankAccountsDraft, setBankAccountsDraft] = useState<
    BankAccountSetting[] | null
  >(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function save(path: string, body: unknown, method = "PATCH") {
    setBusy(true);
    setFormError("");
    try {
      await api(path, body, method);
      reload();
      await refreshConfig();
      setEdit(null);
      setGrantTarget(null);
      setEditingBulk(null);
      toast("Changes saved.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openEntryEditor(id: number) {
    setLoadingEntry(true);
    setFormError("");
    try {
      const fullEntry = await api<Entry>("/admin/devotionals/" + id);
      setEdit(fullEntry);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoadingEntry(false);
    }
  }

  const filteredDevotionals =
    data?.devotionals.filter((d) => {
      if (
        entryMonth !== "all" &&
        Number(d.date.slice(5, 7)) !== Number(entryMonth)
      ) {
        return false;
      }
      if (entryVisibility === "published" && !d.published) return false;
      if (entryVisibility === "draft" && d.published) return false;
      if (entryVisibility === "sample" && !d.sample) return false;
      if (
        entryReviewFilter !== "all" &&
        d.reviewStatus !== entryReviewFilter
      ) {
        return false;
      }
      if (entrySearch.trim()) {
        const q = entrySearch.trim().toLowerCase();
        if (!`${d.date} ${d.title} ${d.theme}`.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }) || [];

  const pageSize = 30;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDevotionals.length / pageSize),
  );
  const currentPage = Math.min(entryPage, totalPages);
  const pagedDevotionals = filteredDevotionals.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const filteredUsers =
    data?.users.filter((u) =>
      `${u.name} ${u.email} ${u.role} ${u.planName || ""} ${u.subscriptionStatus} ${u.hasDigitalEdition ? "digital" : ""}`
        .toLowerCase()
        .includes(readerSearch.toLowerCase()),
    ) || [];

  const filteredDigitalPurchases =
    data?.digitalPurchases.filter(
      (dp) => digitalFilter === "all" || dp.status === digitalFilter,
    ) || [];

  const filteredBulkOrders =
    data?.bulkOrders.filter(
      (b) => bulkFilter === "all" || b.status === bulkFilter,
    ) || [];

  const filteredInquiries =
    data?.inquiries.filter(
      (i) => inquiryFilter === "all" || i.status === inquiryFilter,
    ) || [];

  const currentBankAccounts =
    bankAccountsDraft || data?.settings.bankAccounts || [];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {data?.settings.organizationName ||
              "Cossy Teens Consult Enterprises"}
          </span>
          <h1>The author's desk</h1>
          <p>
            Manage devotionals, digital purchases, memberships, bulk orders,
            readers, and business settings.
          </p>
        </div>
        <Shield size={36} strokeWidth={1} />
      </div>

      <div
        className="admin-tabs"
        role="navigation"
        aria-label="Administration sections"
      >
        {[
          "Overview",
          "Devotionals",
          "Digital Purchases",
          "Subscriptions",
          "Bulk Orders",
          "Bookstore",
          "Readers",
          "Settings",
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              setEdit(null);
              setGrantTarget(null);
              setEditingBulk(null);
              setFormError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <ErrorBox message={error || formError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {tab === "Overview" && (
              <>
                <div className="metric-grid">
                  {[
                    [Users, "Registered readers", data.metrics.readers],
                    [
                      CheckCircle2,
                      `Active memberships (${data.metrics.paidMemberships} paid, ${data.metrics.complimentaryMemberships} comp)`,
                      data.metrics.activeMemberships,
                    ],
                    [
                      ShoppingBag,
                      `2027 Digital Editions sold (${data.metrics.pendingDigitalPurchases} pending)`,
                      data.metrics.digitalEditionsSold,
                    ],
                    [
                      CreditCard,
                      `Verified revenue (Subs ${money(data.metrics.subscriptionRevenueKobo)} · Digital ${money(data.metrics.digitalRevenueKobo)})`,
                      money(data.metrics.verifiedRevenueKobo),
                    ],
                    [
                      Building2,
                      `Bulk-order inquiries (${data.metrics.openBulkOrders} open)`,
                      data.metrics.bulkOrderInquiries,
                    ],
                    [
                      BookOpen,
                      `Printed-book & contact inquiries (${data.metrics.openInquiries} new)`,
                      data.inquiries.length,
                    ],
                    [
                      BookOpen,
                      `Published readings (of ${data.devotionals.length})`,
                      data.metrics.published,
                    ],
                    [
                      CheckCircle2,
                      `Reading completions (${data.metrics.bookmarks} bookmarks)`,
                      data.metrics.completions,
                    ],
                    [
                      AlertCircle,
                      "Expired / revoked memberships",
                      data.metrics.expiredMemberships,
                    ],
                  ].map(([Icon, label, value]: any) => (
                    <div className="metric" key={label}>
                      <Icon size={22} />
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                <div className="panel">
                  <h2>Editorial &amp; commerce quick actions</h2>
                  <p>
                    {data.metrics.published} readings are published and live in
                    the library. {data.metrics.drafts} entries remain in draft
                    status ({data.metrics.needsRevisionReadings} flagged for
                    revision before approval).
                  </p>
                  <div className="actions">
                    <button
                      className="button"
                      onClick={() => {
                        setTab("Devotionals");
                        setEdit({ ...blankEntry });
                      }}
                    >
                      Create a devotional <PenLine size={16} />
                    </button>
                    <button
                      className="button outline"
                      onClick={() => setTab("Devotionals")}
                    >
                      Review 365-day manuscript ({data.metrics.drafts} drafts)
                    </button>
                    <button
                      className="button outline"
                      onClick={() => setTab("Digital Purchases")}
                    >
                      Manage Digital Purchases ({data.digitalPurchases.length})
                    </button>
                    <button
                      className="button outline"
                      onClick={() => setTab("Bulk Orders")}
                    >
                      Manage Bulk Orders ({data.bulkOrders.length})
                    </button>
                  </div>
                </div>

                <h2>Reading engagement</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reading</th>
                        <th>Completed by</th>
                        <th>Saved by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.engagement.slice(0, 12).map((e) => (
                        <tr key={e.id}>
                          <td>{e.date}</td>
                          <td>{e.title}</td>
                          <td>{e.completions}</td>
                          <td>{e.bookmarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2>Recent administrative activity</h2>
                {data.audit.length ? (
                  data.audit.slice(0, 15).map((a) => (
                    <p className="audit-line" key={a.id}>
                      {new Date(a.createdAt).toLocaleString("en-GB")}
                      {a.adminName ? ` · ${a.adminName}` : ""} — {a.action}
                    </p>
                  ))
                ) : (
                  <p className="muted">No administrative actions logged yet.</p>
                )}
              </>
            )}

            {tab === "Devotionals" &&
              (loadingEntry ? (
                <Loading />
              ) : edit ? (
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(
                      "/admin/devotionals" + (edit.id ? "/" + edit.id : ""),
                      edit,
                      edit.id ? "PUT" : "POST",
                    );
                  }}
                >
                  <div className="section-title">
                    <h2>{edit.id ? "Edit devotional" : "New devotional"}</h2>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Close editor"
                      onClick={() => setEdit(null)}
                    >
                      <X />
                    </button>
                  </div>
                  <p>
                    Review the author's wording carefully against the 2027
                    manuscript before marking as approved and published.
                  </p>
                  {edit.sourcePages && (
                    <p className="muted">
                      Source manuscript page {edit.sourcePages}
                    </p>
                  )}
                  {(edit.date === "2027-02-13" ||
                    edit.reviewStatus === "needs_revision") && (
                    <div className="notice">
                      <AlertCircle size={20} />
                      <p>
                        {edit.reviewerNotes ||
                          "Review needed: check the section boundaries against the manuscript before publishing."}
                      </p>
                    </div>
                  )}
                  <div className="form-row-2">
                    <label>
                      Date
                      <input
                        type="date"
                        required
                        min="2027-01-01"
                        max="2027-12-31"
                        value={edit.date}
                        onChange={(e) =>
                          setEdit({ ...edit, date: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Review status
                      <select
                        value={edit.reviewStatus || "pending_review"}
                        onChange={(e) =>
                          setEdit({ ...edit, reviewStatus: e.target.value })
                        }
                      >
                        <option value="pending_review">Pending review</option>
                        <option value="needs_revision">Needs revision</option>
                        <option value="approved">
                          Approved for publication
                        </option>
                      </select>
                    </label>
                  </div>
                  {[
                    ["title", "Title"],
                    ["theme", "Monthly theme"],
                    ["bibleText", "Bible text"],
                    ["memoryVerse", "Memory verse"],
                    ["reflection", "Reflection"],
                    ["thinkAbout", "Think About This"],
                    ["prayer", "Prayer"],
                    ["challenge", "Daily Bible Challenge"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      {["title", "theme"].includes(key) ? (
                        <input
                          type="text"
                          required={key === "title"}
                          value={edit[key] || ""}
                          onChange={(e) =>
                            setEdit({ ...edit, [key]: e.target.value })
                          }
                        />
                      ) : (
                        <textarea
                          required={edit.published}
                          value={edit[key] || ""}
                          onChange={(e) =>
                            setEdit({ ...edit, [key]: e.target.value })
                          }
                          rows={key === "reflection" ? 8 : 3}
                        />
                      )}
                    </label>
                  ))}
                  <label>
                    Editorial / reviewer notes (internal only)
                    <input
                      type="text"
                      value={edit.reviewerNotes || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, reviewerNotes: e.target.value })
                      }
                      placeholder="Optional note for editorial review…"
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={Boolean(edit.sample)}
                      onChange={(e) =>
                        setEdit({ ...edit, sample: e.target.checked })
                      }
                    />
                    Free sample — visible without a membership
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={Boolean(edit.published)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          published: e.target.checked,
                          reviewStatus: e.target.checked
                            ? "approved"
                            : edit.reviewStatus,
                        })
                      }
                    />
                    Published — approved and visible in the reader library
                  </label>
                  <ErrorBox message={formError} />
                  <div className="actions">
                    <button className="button" disabled={busy}>
                      {busy ? "Saving…" : "Save devotional"}
                    </button>
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => setEdit(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="section-title">
                    <h2>
                      Devotional collection ({filteredDevotionals.length})
                    </h2>
                    <div className="actions">
                      <button
                        className="button outline small"
                        onClick={() => setShowThemesManager(!showThemesManager)}
                      >
                        {showThemesManager
                          ? "Hide monthly themes"
                          : "Manage 12 monthly themes"}
                      </button>
                      <button
                        className="button small"
                        onClick={() => setEdit({ ...blankEntry })}
                      >
                        New entry <PenLine size={15} />
                      </button>
                    </div>
                  </div>

                  {showThemesManager && (
                    <div className="panel stack">
                      <h3>2027 Monthly Themes</h3>
                      <p>
                        Update the title and overview description for any month
                        of the 2027 devotional year.
                      </p>
                      <div className="admin-plans">
                        {data.themes.map((t) => (
                          <form
                            key={t.month}
                            className="panel stack"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              save(
                                "/admin/themes/" + t.month,
                                {
                                  title: f.get("title"),
                                  description: f.get("description") || "",
                                },
                                "PUT",
                              );
                            }}
                          >
                            <strong>
                              Month {t.month} · {monthName(t.month)}
                            </strong>
                            <label>
                              Theme title
                              <input
                                name="title"
                                defaultValue={t.title}
                                required
                              />
                            </label>
                            <label>
                              Overview description
                              <textarea
                                name="description"
                                rows={2}
                                defaultValue={t.description}
                              />
                            </label>
                            <button
                              className="button outline small"
                              disabled={busy}
                            >
                              Save {monthName(t.month)} theme
                            </button>
                          </form>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="filters">
                    <label className="search-box">
                      <Search size={18} />
                      <input
                        aria-label="Find an admin devotional"
                        placeholder="Find a title or date, for example 2027-02-13…"
                        value={entrySearch}
                        onChange={(e) => {
                          setEntrySearch(e.target.value);
                          setEntryPage(1);
                        }}
                      />
                    </label>
                    <select
                      aria-label="Filter by month"
                      value={entryMonth}
                      onChange={(e) => {
                        setEntryMonth(e.target.value);
                        setEntryPage(1);
                      }}
                    >
                      <option value="all">All months</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {monthName(i + 1)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by visibility"
                      value={entryVisibility}
                      onChange={(e) => {
                        setEntryVisibility(e.target.value);
                        setEntryPage(1);
                      }}
                    >
                      <option value="all">All visibility</option>
                      <option value="published">Published</option>
                      <option value="draft">Drafts</option>
                      <option value="sample">Samples</option>
                    </select>
                    <select
                      aria-label="Filter by review status"
                      value={entryReviewFilter}
                      onChange={(e) => {
                        setEntryReviewFilter(e.target.value);
                        setEntryPage(1);
                      }}
                    >
                      <option value="all">All review states</option>
                      <option value="approved">Approved</option>
                      <option value="pending_review">Pending review</option>
                      <option value="needs_revision">Needs revision</option>
                    </select>
                  </div>

                  {pagedDevotionals.length ? (
                    <>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Title</th>
                              <th>Review status</th>
                              <th>Visibility</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedDevotionals.map((d) => (
                              <tr key={d.id}>
                                <td>{d.date}</td>
                                <td>{d.title}</td>
                                <td>
                                  <span className="pill">
                                    {d.reviewStatus === "approved"
                                      ? "Approved"
                                      : d.reviewStatus === "needs_revision"
                                        ? "Needs revision"
                                        : "Pending review"}
                                  </span>
                                </td>
                                <td>
                                  {d.published ? "Published" : "Draft"}
                                  {d.sample ? " · Sample" : ""}
                                </td>
                                <td>
                                  <div className="actions">
                                    <button
                                      className="text-link"
                                      onClick={() => openEntryEditor(d.id)}
                                    >
                                      Edit
                                    </button>
                                    {d.published ? (
                                      <button
                                        className="text-link"
                                        disabled={busy}
                                        onClick={() =>
                                          save(
                                            `/admin/devotionals/${d.id}/status`,
                                            { published: false },
                                          )
                                        }
                                      >
                                        Unpublish
                                      </button>
                                    ) : (
                                      d.reviewStatus !== "needs_revision" && (
                                        <button
                                          className="text-link"
                                          disabled={busy}
                                          onClick={() =>
                                            save(
                                              `/admin/devotionals/${d.id}/status`,
                                              {
                                                published: true,
                                                reviewStatus: "approved",
                                              },
                                            )
                                          }
                                        >
                                          Approve &amp; publish
                                        </button>
                                      )
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="pagination-bar">
                          <span>
                            Page {currentPage} of {totalPages} (
                            {filteredDevotionals.length} entries)
                          </span>
                          <div className="actions">
                            <button
                              className="button outline small"
                              disabled={currentPage <= 1}
                              onClick={() => setEntryPage((p) => p - 1)}
                            >
                              <ChevronLeft size={15} /> Previous
                            </button>
                            <button
                              className="button outline small"
                              disabled={currentPage >= totalPages}
                              onClick={() => setEntryPage((p) => p + 1)}
                            >
                              Next <ChevronRight size={15} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty title="No matching devotionals">
                      Adjust your search or filters, or create a new entry.
                    </Empty>
                  )}
                </>
              ))}

            {tab === "Digital Purchases" && (
              <>
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    save(
                      "/admin/settings",
                      {
                        digitalEditionPriceKobo: Math.round(
                          Number(f.get("digitalPrice")) * 100,
                        ),
                        digitalEditionAvailability: f.get(
                          "digitalAvailability",
                        ),
                        digitalEditionScope: f.get("digitalScope"),
                        digitalEditionNote: f.get("digitalNote"),
                      },
                      "PUT",
                    );
                  }}
                >
                  <h2>2027 Digital Edition Product &amp; Pricing</h2>
                  <p>
                    Configure the one-time Digital Copy price (owner approved:{" "}
                    <strong>₦3,500</strong>) and access scope. A one-time
                    Digital Edition purchase is stored separately from recurring
                    memberships.
                  </p>
                  <div className="form-row-2">
                    <label>
                      Digital Copy price (NGN)
                      <input
                        name="digitalPrice"
                        type="number"
                        min={100}
                        step="1"
                        defaultValue={
                          data.settings.digitalEditionPriceKobo / 100
                        }
                        required
                      />
                    </label>
                    <label>
                      Availability
                      <select
                        name="digitalAvailability"
                        defaultValue={data.settings.digitalEditionAvailability}
                      >
                        <option value="available">
                          Available for purchase
                        </option>
                        <option value="unavailable">Unavailable</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row-2">
                    <label>
                      Entitlement scope
                      <select
                        name="digitalScope"
                        defaultValue={data.settings.digitalEditionScope}
                      >
                        <option value="edition_2027">
                          2027 Edition persistent online access only (Default)
                        </option>
                        <option value="includes_membership_updates">
                          2027 Edition + membership updates
                        </option>
                      </select>
                    </label>
                    <label>
                      Product note
                      <input
                        name="digitalNote"
                        defaultValue={data.settings.digitalEditionNote}
                        required
                      />
                    </label>
                  </div>
                  <button className="button outline" disabled={busy}>
                    Save Digital Edition settings
                  </button>
                </form>

                <div className="section-title">
                  <h2>
                    Digital Edition Orders &amp; Reconciliation (
                    {filteredDigitalPurchases.length})
                  </h2>
                  <select
                    aria-label="Filter digital purchases by status"
                    value={digitalFilter}
                    onChange={(e) => setDigitalFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="verifying_transfer">
                      Verifying bank transfer
                    </option>
                    <option value="succeeded">Succeeded / Active</option>
                    <option value="failed">Failed / Rejected</option>
                    <option value="refunded">Refunded</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>

                {filteredDigitalPurchases.length ? (
                  filteredDigitalPurchases.map((dp) => (
                    <div className="panel stack" key={dp.id}>
                      <div className="section-title" style={{ margin: 0 }}>
                        <div>
                          <h3>
                            {dp.userName} ({dp.email})
                          </h3>
                          <small>
                            Order <code>{dp.reference}</code> ·{" "}
                            {new Date(dp.createdAt).toLocaleString("en-GB")} ·{" "}
                            {dp.paymentMethod === "paystack"
                              ? "Paystack Online"
                              : `Bank Transfer (${dp.currency})`}{" "}
                            · <strong>{money(dp.amountKobo)}</strong>
                          </small>
                        </div>
                        <div className="actions">
                          <span className="pill">Purchase: {dp.status}</span>
                          <span className="pill">
                            Entitlement: {dp.entitlementStatus || "none"}
                          </span>
                        </div>
                      </div>
                      {(dp.transferReference || dp.payerNote) && (
                        <p>
                          <strong>Transfer Reference:</strong>{" "}
                          {dp.transferReference || "—"}
                          {dp.payerNote ? ` · Note: ${dp.payerNote}` : ""}
                        </p>
                      )}
                      <label>
                        Administrator reconciliation note
                        <input
                          value={
                            reconcileNotes[dp.id] !== undefined
                              ? reconcileNotes[dp.id]
                              : dp.adminNotes || ""
                          }
                          onChange={(e) =>
                            setReconcileNotes({
                              ...reconcileNotes,
                              [dp.id]: e.target.value,
                            })
                          }
                          placeholder="Record bank statement verification or refund reason…"
                        />
                      </label>
                      <div className="actions">
                        {dp.status !== "succeeded" && (
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() =>
                              save(
                                `/admin/digital-purchases/${dp.id}/reconcile`,
                                {
                                  action: "approve",
                                  adminNotes:
                                    reconcileNotes[dp.id] ?? dp.adminNotes,
                                },
                                "POST",
                              )
                            }
                          >
                            Verify &amp; Activate 2027 Access
                          </button>
                        )}
                        {(dp.status === "pending" ||
                          dp.status === "verifying_transfer") && (
                          <button
                            className="button outline small"
                            disabled={busy}
                            onClick={() =>
                              save(
                                `/admin/digital-purchases/${dp.id}/reconcile`,
                                {
                                  action: "reject",
                                  adminNotes:
                                    reconcileNotes[dp.id] ?? dp.adminNotes,
                                },
                                "POST",
                              )
                            }
                          >
                            Mark Unverified / Failed
                          </button>
                        )}
                        {dp.status === "succeeded" && (
                          <>
                            <button
                              className="button outline small"
                              disabled={busy}
                              onClick={() =>
                                save(
                                  `/admin/digital-purchases/${dp.id}/reconcile`,
                                  {
                                    action: "refund",
                                    adminNotes:
                                      reconcileNotes[dp.id] ?? dp.adminNotes,
                                  },
                                  "POST",
                                )
                              }
                            >
                              Mark Refunded &amp; Revoke
                            </button>
                            <button
                              className="text-link"
                              disabled={busy}
                              onClick={() =>
                                save(
                                  `/admin/digital-purchases/${dp.id}/reconcile`,
                                  {
                                    action: "revoke",
                                    adminNotes:
                                      reconcileNotes[dp.id] ?? dp.adminNotes,
                                  },
                                  "POST",
                                )
                              }
                            >
                              Revoke Access
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="No Digital Edition purchases in this view">
                    Verified Paystack purchases and pending bank-transfer orders
                    will appear here.
                  </Empty>
                )}
              </>
            )}

            {tab === "Subscriptions" && (
              <>
                <div className="section-title">
                  <h2>Membership plans &amp; pricing</h2>
                  <span className="pill">
                    Paystack:{" "}
                    {data.paymentsConfig.configured
                      ? "Configured"
                      : "Not configured (safe mode)"}
                  </span>
                </div>
                <p>
                  Configure provisional membership plan names, prices in
                  Nigerian Naira (NGN), and checkout availability.
                </p>
                <div className="admin-plans">
                  {data.plans.map((p) => (
                    <form
                      className="panel stack"
                      key={p.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        save("/admin/plans/" + p.id, {
                          name: f.get("name"),
                          amountKobo: Math.round(Number(f.get("amount")) * 100),
                          active: f.get("active") === "on",
                        });
                      }}
                    >
                      <label>
                        Plan name
                        <input name="name" defaultValue={p.name} required />
                      </label>
                      <label>
                        Price (NGN)
                        <input
                          name="amount"
                          type="number"
                          min="1"
                          step=".01"
                          required
                          defaultValue={p.amountKobo / 100}
                        />
                      </label>
                      <p>
                        {p.months} month{p.months > 1 ? "s" : ""} of access
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={p.active}
                        />
                        Available for checkout
                      </label>
                      <button className="button outline" disabled={busy}>
                        Save plan
                      </button>
                    </form>
                  ))}
                </div>

                <h2>Active &amp; past memberships</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Reader</th>
                        <th>Plan</th>
                        <th>Access type</th>
                        <th>Status</th>
                        <th>Renewal preference</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users
                        .filter((u) => u.subscription)
                        .map((u) => (
                          <tr key={u.id}>
                            <td>
                              {u.name} ({u.email})
                            </td>
                            <td>{u.planName}</td>
                            <td>
                              <span className="pill">
                                {u.accessType === "complimentary"
                                  ? "Complimentary"
                                  : "Paid"}
                              </span>
                            </td>
                            <td>{u.subscriptionStatus}</td>
                            <td>
                              {u.cancelAtPeriodEnd
                                ? "Cancels at period end"
                                : u.renewalMode}
                            </td>
                            <td>
                              {u.expiresAt
                                ? new Date(u.expiresAt).toLocaleDateString(
                                    "en-GB",
                                  )
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <h2>Verified subscription payment history</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reader</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {new Date(p.createdAt).toLocaleDateString("en-GB")}
                          </td>
                          <td>{p.email}</td>
                          <td>{p.planName}</td>
                          <td>{money(p.amountKobo)}</td>
                          <td className="reference">{p.reference}</td>
                          <td>
                            <span className="pill">{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.payments.length && (
                    <p className="muted">
                      No verified subscription payment transactions recorded yet.
                    </p>
                  )}
                </div>
              </>
            )}

            {tab === "Bulk Orders" && (
              <>
                <div className="section-title">
                  <h2>
                    Bulk &amp; Institutional Orders ({filteredBulkOrders.length})
                  </h2>
                  <select
                    aria-label="Filter bulk orders by status"
                    value={bulkFilter}
                    onChange={(e) => setBulkFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="quoted">Quoted</option>
                    <option value="approved">Approved</option>
                    <option value="converted">Converted to Order</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {editingBulk && (
                  <form
                    className="panel stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const discountRaw = String(
                        f.get("discountPercent") || "",
                      ).trim();
                      const agreedRaw = String(
                        f.get("agreedTotalNgn") || "",
                      ).trim();
                      save(
                        `/admin/bulk-orders/${editingBulk.id}`,
                        {
                          status: f.get("status"),
                          unitPriceKobo: Math.round(
                            Number(f.get("unitPriceNgn")) * 100,
                          ),
                          discountPercent:
                            discountRaw === "" ? null : Number(discountRaw),
                          agreedTotalKobo:
                            agreedRaw === ""
                              ? null
                              : Math.round(Number(agreedRaw) * 100),
                          quotationSummary: f.get("quotationSummary") || "",
                          fulfillmentStatus: f.get("fulfillmentStatus"),
                          trackingNote: f.get("trackingNote") || "",
                          adminNotes: f.get("adminNotes") || "",
                        },
                        "PATCH",
                      );
                    }}
                  >
                    <div className="section-title" style={{ margin: 0 }}>
                      <h3>
                        Prepare Quotation &amp; Fulfillment:{" "}
                        {editingBulk.organizationName} ({editingBulk.quantity}{" "}
                        copies)
                      </h3>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Close bulk order editor"
                        onClick={() => setEditingBulk(null)}
                      >
                        <X />
                      </button>
                    </div>
                    <div className="form-row-2">
                      <label>
                        Inquiry / Order status
                        <select name="status" defaultValue={editingBulk.status}>
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="quoted">Quotation Sent</option>
                          <option value="approved">Approved by Client</option>
                          <option value="converted">Converted to Order</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="archived">Archived</option>
                        </select>
                      </label>
                      <label>
                        Fulfillment status
                        <select
                          name="fulfillmentStatus"
                          defaultValue={editingBulk.fulfillmentStatus}
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped / In Transit</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                    </div>
                    <div className="form-row-2">
                      <label>
                        Unit price (NGN)
                        <input
                          name="unitPriceNgn"
                          type="number"
                          min={1}
                          defaultValue={editingBulk.unitPriceKobo / 100}
                          required
                        />
                      </label>
                      <label>
                        Custom bulk discount % (optional)
                        <input
                          name="discountPercent"
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          defaultValue={editingBulk.discountPercent ?? ""}
                          placeholder="Leave blank if no discount configured"
                        />
                      </label>
                    </div>
                    <div className="form-row-2">
                      <label>
                        Agreed final total in NGN (optional)
                        <input
                          name="agreedTotalNgn"
                          type="number"
                          min={0}
                          defaultValue={
                            editingBulk.agreedTotalKobo !== null
                              ? editingBulk.agreedTotalKobo / 100
                              : ""
                          }
                          placeholder="Record agreed invoice total…"
                        />
                      </label>
                      <label>
                        Delivery tracking note
                        <input
                          name="trackingNote"
                          defaultValue={editingBulk.trackingNote}
                          placeholder="Courier, dispatch date, or recipient note…"
                        />
                      </label>
                    </div>
                    <label>
                      Quotation summary
                      <textarea
                        name="quotationSummary"
                        rows={2}
                        defaultValue={editingBulk.quotationSummary}
                        placeholder="Details of quotation shared with the school, church, or organization…"
                      />
                    </label>
                    <label>
                      Internal admin notes
                      <textarea
                        name="adminNotes"
                        rows={2}
                        defaultValue={editingBulk.adminNotes}
                      />
                    </label>
                    <div className="actions">
                      <button className="button" disabled={busy}>
                        Save quotation &amp; fulfillment
                      </button>
                      <button
                        type="button"
                        className="button outline"
                        onClick={() => setEditingBulk(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {filteredBulkOrders.length ? (
                  filteredBulkOrders.map((b) => (
                    <div className="panel stack" key={b.id}>
                      <div className="section-title" style={{ margin: 0 }}>
                        <div>
                          <h3>
                            {b.organizationName}{" "}
                            <small>
                              ({b.organizationType} · {b.quantity} copies ·{" "}
                              {b.preferredFormat})
                            </small>
                          </h3>
                          <small>
                            Contact: {b.contactName} · {b.email} · {b.phone} ·
                            Delivery: {b.deliveryLocation}
                          </small>
                        </div>
                        <div className="actions">
                          <span className="pill">Status: {b.status}</span>
                          <span className="pill">
                            Fulfillment: {b.fulfillmentStatus}
                          </span>
                        </div>
                      </div>
                      {b.notes && (
                        <p className="preserve-lines">Notes: {b.notes}</p>
                      )}
                      <p>
                        <strong>Unit Price:</strong> {money(b.unitPriceKobo)} ·{" "}
                        <strong>Discount:</strong>{" "}
                        {b.discountPercent !== null
                          ? `${b.discountPercent}%`
                          : "Not set"}{" "}
                        · <strong>Quoted Total:</strong>{" "}
                        {b.quotedTotalKobo !== null
                          ? money(b.quotedTotalKobo)
                          : "—"}{" "}
                        · <strong>Agreed Total:</strong>{" "}
                        {b.agreedTotalKobo !== null
                          ? money(b.agreedTotalKobo)
                          : "—"}
                      </p>
                      {b.quotationSummary && (
                        <p>
                          <strong>Quotation:</strong> {b.quotationSummary}
                        </p>
                      )}
                      <div className="actions">
                        <button
                          className="button small"
                          onClick={() => setEditingBulk(b)}
                        >
                          Prepare Quotation / Update Order
                        </button>
                        {b.status !== "converted" && (
                          <button
                            className="button outline small"
                            disabled={busy}
                            onClick={() =>
                              save(
                                `/admin/bulk-orders/${b.id}`,
                                { status: "converted" },
                                "PATCH",
                              )
                            }
                          >
                            Mark Converted to Order
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="No bulk order inquiries yet">
                    Bulk requests from parents, schools, churches, and youth
                    organizations will appear here.
                  </Empty>
                )}
              </>
            )}

            {tab === "Bookstore" && (
              <>
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    save(
                      "/admin/settings",
                      {
                        hardcoverPriceKobo: Math.round(
                          Number(f.get("price")) * 100,
                        ),
                        hardcoverAvailability: f.get("availability"),
                        hardcoverNote: f.get("note"),
                      },
                      "PUT",
                    );
                  }}
                >
                  <h2>Printed Copy Availability &amp; Pricing</h2>
                  <div className="form-row-2">
                    <label>
                      Printed copy price (NGN)
                      <input
                        name="price"
                        type="number"
                        min={100}
                        step="1"
                        defaultValue={data.settings.hardcoverPriceKobo / 100}
                        required
                      />
                    </label>
                    <label>
                      Availability status
                      <select
                        name="availability"
                        defaultValue={data.settings.hardcoverAvailability}
                      >
                        <option value="available">Available for order</option>
                        <option value="preorder">Open for pre-order</option>
                        <option value="out_of_stock">Out of stock</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Bookstore availability note
                    <input
                      name="note"
                      defaultValue={data.settings.hardcoverNote}
                      required
                    />
                  </label>
                  <button className="button outline" disabled={busy}>
                    Save bookstore settings
                  </button>
                </form>

                <div className="section-title">
                  <h2>
                    Bookstore &amp; contact inquiries (
                    {filteredInquiries.length})
                  </h2>
                  <select
                    aria-label="Filter inquiries by status"
                    value={inquiryFilter}
                    onChange={(e) => setInquiryFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="contacted">Contacted</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {filteredInquiries.length ? (
                  filteredInquiries.map((i) => (
                    <div className="panel stack" key={i.id}>
                      <div className="section-title">
                        <div>
                          <h3>
                            {i.name}{" "}
                            <small>
                              ({i.inquiryType === "hardcover"
                                ? `Printed copy · ${i.quantity} cop${i.quantity === 1 ? "y" : "ies"}`
                                : "General contact"})
                            </small>
                          </h3>
                          <small>
                            {new Date(i.createdAt).toLocaleString("en-GB")} ·{" "}
                            {i.email}
                            {i.phone ? ` · ${i.phone}` : ""}
                            {i.deliveryLocation
                              ? ` · ${i.deliveryLocation}`
                              : ""}
                          </small>
                        </div>
                        <span className="pill">{i.status}</span>
                      </div>
                      <p className="preserve-lines">
                        {i.message || "Interested in the printed edition."}
                      </p>
                      <div className="actions">
                        {(
                          [
                            "new",
                            "reviewed",
                            "contacted",
                            "fulfilled",
                            "archived",
                          ] as const
                        ).map((st) => (
                          <button
                            key={st}
                            className={
                              "button small " +
                              (i.status === st ? "" : "outline")
                            }
                            disabled={busy || i.status === st}
                            onClick={() =>
                              save("/admin/inquiries/" + i.id, { status: st })
                            }
                          >
                            Mark {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty title="No inquiries in this view">
                    Printed copy orders and contact messages will appear here.
                  </Empty>
                )}
              </>
            )}

            {tab === "Readers" && (
              <>
                <div className="section-title">
                  <h2>Reader &amp; subscriber management</h2>
                </div>
                {grantTarget && (
                  <form
                    className="panel stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(
                        `/admin/users/${grantTarget.id}/complimentary`,
                        { planId: grantPlanId, reason: grantReason },
                        "POST",
                      );
                    }}
                  >
                    <div className="section-title">
                      <h3>
                        Grant complimentary access to {grantTarget.name} (
                        {grantTarget.email})
                      </h3>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Close complimentary access form"
                        onClick={() => setGrantTarget(null)}
                      >
                        <X />
                      </button>
                    </div>
                    <p>
                      Complimentary memberships grant full access to all
                      published 2027 devotionals for the selected duration. They
                      are recorded in the audit log and are never counted as
                      paid revenue.
                    </p>
                    <div className="form-row-2">
                      <label>
                        Membership duration plan
                        <select
                          value={grantPlanId}
                          onChange={(e) =>
                            setGrantPlanId(Number(e.target.value))
                          }
                        >
                          {data.plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.months}{" "}
                              {p.months === 1 ? "month" : "months"})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Reason for complimentary access
                        <input
                          required
                          minLength={2}
                          maxLength={500}
                          value={grantReason}
                          onChange={(e) => setGrantReason(e.target.value)}
                          placeholder="e.g. Sponsored youth group member / local verification"
                        />
                      </label>
                    </div>
                    <div className="actions">
                      <button className="button" disabled={busy}>
                        <Gift size={16} /> Confirm complimentary grant
                      </button>
                      <button
                        type="button"
                        className="button outline"
                        onClick={() => setGrantTarget(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <div className="filters">
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      aria-label="Search subscribers"
                      placeholder="Search readers by name, email, or plan…"
                      value={readerSearch}
                      onChange={(e) => setReaderSearch(e.target.value)}
                    />
                  </label>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role &amp; Status</th>
                        <th>2027 Digital Edition</th>
                        <th>Membership</th>
                        <th>Access until</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>
                            {u.role} · <span className="pill">{u.status}</span>
                          </td>
                          <td>
                            {u.hasDigitalEdition ? (
                              <span className="pill">Active (2027)</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {u.planName
                              ? `${u.planName} (${u.accessType === "complimentary" ? "Complimentary" : "Paid"} · ${u.subscriptionStatus})`
                              : "Free"}
                          </td>
                          <td>
                            {u.expiresAt
                              ? new Date(u.expiresAt).toLocaleDateString(
                                  "en-GB",
                                )
                              : "—"}
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                className="text-link"
                                onClick={() => {
                                  setGrantTarget(u);
                                  setGrantPlanId(data.plans[0]?.id || 1);
                                  setGrantReason("");
                                }}
                              >
                                Grant complimentary
                              </button>
                              {u.subscription?.active && (
                                <button
                                  className="text-link"
                                  disabled={busy}
                                  onClick={() =>
                                    save(
                                      `/admin/users/${u.id}/revoke-access`,
                                      {
                                        reason:
                                          "Revoked from administrator dashboard",
                                      },
                                      "POST",
                                    )
                                  }
                                >
                                  Revoke access
                                </button>
                              )}
                              {u.role !== "admin" && (
                                <button
                                  className="text-link"
                                  disabled={busy}
                                  onClick={() =>
                                    save(`/admin/users/${u.id}/status`, {
                                      status:
                                        u.status === "suspended"
                                          ? "active"
                                          : "suspended",
                                      reason:
                                        u.status === "suspended"
                                          ? ""
                                          : "Suspended by administrator",
                                    })
                                  }
                                >
                                  {u.status === "suspended"
                                    ? "Reactivate"
                                    : "Suspend"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2>Administrative audit log</h2>
                {data.audit.map((a) => (
                  <p className="audit-line" key={a.id}>
                    {new Date(a.createdAt).toLocaleString("en-GB")}
                    {a.adminName ? ` · ${a.adminName}` : ""} — {a.action}
                  </p>
                ))}
              </>
            )}

            {tab === "Settings" && (
              <form
                className="panel stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await save(
                    "/admin/settings",
                    {
                      siteTitle: f.get("siteTitle"),
                      siteTagline: f.get("siteTagline"),
                      brandStatement: f.get("brandStatement"),
                      siteHeadline: f.get("siteHeadline"),
                      siteSubheadline: f.get("siteSubheadline"),
                      targetAudience: f.get("targetAudience"),
                      organizationName: f.get("organizationName"),
                      organizationDescription: f.get("organizationDescription"),
                      authorName: f.get("authorName"),
                      authorTitle: f.get("authorTitle"),
                      authorBio: f.get("authorBio"),
                      contactEmail: f.get("contactEmail"),
                      contactPhone: f.get("contactPhone"),
                      contactSecondaryPhone: f.get("contactSecondaryPhone"),
                      contactWebsite: f.get("contactWebsite"),
                      contactAddress: f.get("contactAddress"),
                      bulkDiscountNote: f.get("bulkDiscountNote"),
                      bankTransferEnabled:
                        f.get("bankTransferEnabled") === "on",
                      bankAccounts: currentBankAccounts,
                      allowRegistration: f.get("allowRegistration") === "on",
                      enableAutoRenewal: f.get("enableAutoRenewal") === "on",
                      renewalReminderDays: Number(f.get("renewalReminderDays")),
                    },
                    "PUT",
                  );
                }}
              >
                <h2>Brand Identity &amp; Homepage Headlines</h2>
                <div className="form-row-2">
                  <label>
                    Publication title
                    <input
                      name="siteTitle"
                      defaultValue={data.settings.siteTitle}
                      required
                    />
                  </label>
                  <label>
                    Organization name
                    <input
                      name="organizationName"
                      defaultValue={data.settings.organizationName}
                      required
                    />
                  </label>
                </div>
                <div className="form-row-2">
                  <label>
                    Brand statement
                    <input
                      name="brandStatement"
                      defaultValue={data.settings.brandStatement}
                      required
                    />
                  </label>
                  <label>
                    Target audience
                    <input
                      name="targetAudience"
                      defaultValue={data.settings.targetAudience}
                      required
                    />
                  </label>
                </div>
                <div className="form-row-2">
                  <label>
                    Main homepage headline
                    <input
                      name="siteHeadline"
                      defaultValue={data.settings.siteHeadline}
                      required
                    />
                  </label>
                  <label>
                    Homepage supporting message
                    <input
                      name="siteSubheadline"
                      defaultValue={data.settings.siteSubheadline}
                      required
                    />
                  </label>
                </div>
                <label>
                  Established tagline
                  <input
                    name="siteTagline"
                    defaultValue={data.settings.siteTagline}
                    required
                  />
                </label>
                <label>
                  Organization description
                  <textarea
                    name="organizationDescription"
                    rows={3}
                    defaultValue={data.settings.organizationDescription}
                    required
                  />
                </label>

                <h2>Author Information</h2>
                <div className="form-row-2">
                  <label>
                    Author name
                    <input
                      name="authorName"
                      defaultValue={data.settings.authorName}
                      required
                    />
                  </label>
                  <label>
                    Author credentials / role title
                    <input
                      name="authorTitle"
                      defaultValue={data.settings.authorTitle}
                      required
                    />
                  </label>
                </div>
                <label>
                  Author biography
                  <textarea
                    name="authorBio"
                    rows={4}
                    defaultValue={data.settings.authorBio}
                    required
                  />
                </label>

                <h2>Contact Details</h2>
                <div className="form-row-2">
                  <label>
                    Contact email
                    <input
                      name="contactEmail"
                      type="email"
                      defaultValue={data.settings.contactEmail}
                      required
                    />
                  </label>
                  <label>
                    Website
                    <input
                      name="contactWebsite"
                      defaultValue={data.settings.contactWebsite}
                      required
                    />
                  </label>
                </div>
                <div className="form-row-2">
                  <label>
                    Primary phone / WhatsApp
                    <input
                      name="contactPhone"
                      defaultValue={data.settings.contactPhone}
                      required
                    />
                  </label>
                  <label>
                    Secondary phone
                    <input
                      name="contactSecondaryPhone"
                      defaultValue={data.settings.contactSecondaryPhone}
                    />
                  </label>
                </div>
                <div className="form-row-2">
                  <label>
                    Contact address / city
                    <input
                      name="contactAddress"
                      defaultValue={data.settings.contactAddress}
                      required
                    />
                  </label>
                  <label>
                    Bulk order note
                    <input
                      name="bulkDiscountNote"
                      defaultValue={data.settings.bulkDiscountNote}
                      required
                    />
                  </label>
                </div>

                <h2>
                  <Landmark
                    size={20}
                    style={{ display: "inline", marginRight: "8px" }}
                  />
                  Bank-Transfer Payment Accounts (Access Bank)
                </h2>
                <p>
                  These official account numbers from the owner's PDF are stored
                  in business settings. Keep public bank-transfer display
                  disabled until the owner approves displaying bank account
                  numbers on public checkout pages.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="bankTransferEnabled"
                    defaultChecked={data.settings.bankTransferEnabled}
                  />
                  <span>
                    Enable public Bank-Transfer checkout &amp; display Access
                    Bank account numbers on purchase pages
                  </span>
                </label>

                <div className="admin-plans">
                  {currentBankAccounts.map((acc, idx) => (
                    <div className="panel stack" key={acc.currency}>
                      <strong>
                        {acc.label} ({acc.currency})
                      </strong>
                      <label>
                        Bank name
                        <input
                          value={acc.bankName}
                          onChange={(e) => {
                            const next = [...currentBankAccounts];
                            next[idx] = {
                              ...next[idx],
                              bankName: e.target.value,
                            };
                            setBankAccountsDraft(next);
                          }}
                        />
                      </label>
                      <label>
                        Account name
                        <input
                          value={acc.accountName}
                          onChange={(e) => {
                            const next = [...currentBankAccounts];
                            next[idx] = {
                              ...next[idx],
                              accountName: e.target.value,
                            };
                            setBankAccountsDraft(next);
                          }}
                        />
                      </label>
                      <label>
                        Account number
                        <input
                          value={acc.accountNumber}
                          onChange={(e) => {
                            const next = [...currentBankAccounts];
                            next[idx] = {
                              ...next[idx],
                              accountNumber: e.target.value,
                            };
                            setBankAccountsDraft(next);
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <h2>Subscription &amp; Account Configuration</h2>
                <label>
                  Renewal reminder window (days before expiry)
                  <input
                    name="renewalReminderDays"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={data.settings.renewalReminderDays}
                    required
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="allowRegistration"
                    defaultChecked={data.settings.allowRegistration}
                  />
                  Allow public reader registration
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="enableAutoRenewal"
                    defaultChecked={data.settings.enableAutoRenewal}
                  />
                  Allow automatic renewal preference selection
                </label>

                <button className="button" disabled={busy}>
                  Save application settings <Settings size={16} />
                </button>
              </form>
            )}
          </>
        )
      )}
    </>
  );
}
