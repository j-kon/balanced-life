import { z } from "zod";
import type { FastifyRequest } from "fastify";

export const idOf = (req: FastifyRequest) =>
  z.coerce
    .number()
    .int()
    .positive()
    .parse((req.params as { id: string }).id);

export const monthOf = (req: FastifyRequest) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .parse((req.params as { month: string }).month);

export const yearDate = z
  .string()
  .regex(/^2027-\d{2}-\d{2}$/, "Use a valid date in 2027 (YYYY-MM-DD).")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid calendar date in 2027.",
  );

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100),
    email: z
      .email("Enter a valid email address.")
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters.")
      .max(128),
    ageGroup: z
      .enum(["13_17", "18_25", "adult_mentor"])
      .default("18_25"),
    guardianConsentConfirmed: z.boolean().default(true),
  })
  .refine(
    (v) => v.ageGroup !== "13_17" || v.guardianConsentConfirmed === true,
    "Readers aged 13–17 must confirm parent, guardian, or youth mentor permission.",
  );

export const loginSchema = z.object({
  email: z
    .email("Enter a valid email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z
    .email("Enter a valid email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(128),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email("Enter a valid email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(10, "New password must be at least 10 characters.")
    .max(128),
});

export const entrySchema = z
  .object({
    date: yearDate,
    title: z.string().trim().min(1, "Title is required.").max(300),
    theme: z.string().trim().max(300).default(""),
    bibleText: z.string().max(10000).default(""),
    memoryVerse: z.string().max(10000).default(""),
    reflection: z.string().max(30000).default(""),
    thinkAbout: z.string().max(10000).default(""),
    prayer: z.string().max(10000).default(""),
    challenge: z.string().max(10000).default(""),
    sample: z.boolean().default(false),
    published: z.boolean().default(false),
    reviewStatus: z
      .enum(["pending_review", "needs_revision", "approved"])
      .default("pending_review"),
    reviewerNotes: z.string().trim().max(2000).default(""),
  })
  .refine(
    (d) =>
      !d.published ||
      [
        d.bibleText,
        d.memoryVerse,
        d.reflection,
        d.thinkAbout,
        d.prayer,
        d.challenge,
      ].every((v) => v.trim().length > 0),
    "All six devotional reading sections are required before publishing.",
  )
  .refine(
    (d) => !d.published || d.reviewStatus !== "needs_revision",
    "Entries marked as needing revision cannot be published until approved.",
  );

export const entryStatusPatchSchema = z.object({
  published: z.boolean().optional(),
  sample: z.boolean().optional(),
  reviewStatus: z
    .enum(["pending_review", "needs_revision", "approved"])
    .optional(),
  reviewerNotes: z.string().trim().max(2000).optional(),
});

export const themeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).default(""),
});

export const journalCreateSchema = z.object({
  devotionalId: z.number().int().positive().optional(),
  title: z.string().trim().max(200).default(""),
  lessonLearned: z.string().trim().max(2000).default(""),
  body: z.string().trim().min(1, "Reflection body cannot be empty.").max(10000),
  actionStep: z.string().trim().max(2000).default(""),
  prayerFocus: z.string().trim().max(2000).default(""),
  completed: z.boolean().optional(),
});

export const journalUpdateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  lessonLearned: z.string().trim().max(2000).optional(),
  body: z.string().trim().min(1, "Reflection body cannot be empty.").max(10000),
  actionStep: z.string().trim().max(2000).optional(),
  prayerFocus: z.string().trim().max(2000).optional(),
  completed: z.boolean().optional(),
});

export const subscriptionPreferenceSchema = z
  .object({
    renewalMode: z.enum(["manual", "automatic"]).optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
  })
  .refine(
    (v) => v.renewalMode !== undefined || v.cancelAtPeriodEnd !== undefined,
    "Choose a renewal setting.",
  );

export const checkoutInitiateSchema = z.object({
  planId: z.number().int().positive(),
  renewalMode: z.enum(["manual", "automatic"]).default("manual"),
});

export const checkoutVerifySchema = z.object({
  reference: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export const digitalPurchaseInitiateSchema = z.object({
  paymentMethod: z.enum(["paystack", "bank_transfer"]).default("paystack"),
  currency: z.enum(["NGN", "USD", "GBP"]).default("NGN"),
  transferReference: z.string().trim().max(120).default(""),
  payerNote: z.string().trim().max(1000).default(""),
});

export const digitalTransferProofSchema = z.object({
  transferReference: z
    .string()
    .trim()
    .min(3, "Enter a bank transfer reference or narration.")
    .max(120),
  payerNote: z.string().trim().max(1000).default(""),
});

export const adminReconcileDigitalPurchaseSchema = z.object({
  action: z.enum(["approve", "reject", "refund", "revoke"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export const bulkOrderCreateSchema = z.object({
  contactName: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(160),
  organizationType: z.enum([
    "parent",
    "school",
    "church",
    "youth_organization",
    "other",
  ]),
  email: z.email("Enter a valid email address.").max(254),
  phone: z.string().trim().min(5).max(40),
  quantity: z.coerce.number().int().min(1).max(50000),
  preferredFormat: z.enum(["printed", "digital", "mixed"]).default("printed"),
  deliveryLocation: z.string().trim().min(2).max(240),
  notes: z.string().trim().max(3000).default(""),
});

export const adminBulkOrderUpdateSchema = z.object({
  status: z
    .enum([
      "new",
      "contacted",
      "quoted",
      "approved",
      "converted",
      "fulfilled",
      "archived",
    ])
    .optional(),
  unitPriceKobo: z.coerce.number().int().min(100).max(100000000).optional(),
  discountPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  quotedTotalKobo: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000000)
    .nullable()
    .optional(),
  agreedTotalKobo: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000000)
    .nullable()
    .optional(),
  quotationSummary: z.string().trim().max(3000).optional(),
  fulfillmentStatus: z
    .enum(["pending", "processing", "shipped", "delivered", "cancelled"])
    .optional(),
  trackingNote: z.string().trim().max(1000).optional(),
  adminNotes: z.string().trim().max(3000).optional(),
});

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const notificationPreferencesSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  dailyReminderEnabled: z.boolean().optional(),
  unreadReminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(hhmmRegex, "Use HH:MM 24-hour format.")
    .optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  quietHoursStart: z
    .string()
    .regex(hhmmRegex, "Use HH:MM 24-hour format.")
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(hhmmRegex, "Use HH:MM 24-hour format.")
    .optional(),
  subscriptionAlertsEnabled: z.boolean().optional(),
  purchaseAlertsEnabled: z.boolean().optional(),
});

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(2000),
    p256dhKey: z.string().trim().min(8).max(500).optional(),
    authKey: z.string().trim().min(4).max(500).optional(),
    p256dh: z.string().trim().min(8).max(500).optional(),
    auth: z.string().trim().min(4).max(500).optional(),
    keys: z
      .object({
        p256dh: z.string().trim().min(8).max(500),
        auth: z.string().trim().min(4).max(500),
      })
      .optional(),
    userAgent: z.string().trim().max(500).optional(),
    deviceLabel: z.string().trim().max(80).optional(),
  })
  .transform((val, ctx) => {
    const p256dhKey =
      val.p256dhKey || val.p256dh || val.keys?.p256dh || "";
    const authKey = val.authKey || val.auth || val.keys?.auth || "";
    if (!p256dhKey || !authKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Push subscription keys (p256dh and auth) are required.",
      });
      return z.NEVER;
    }
    return {
      endpoint: val.endpoint,
      p256dhKey,
      authKey,
      userAgent: val.userAgent || "",
      deviceLabel: val.deviceLabel,
    };
  });

export const complimentaryGrantSchema = z.object({
  planId: z.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(2, "Provide a brief reason for the audit log.")
    .max(500),
});

export const revokeAccessSchema = z.object({
  reason: z.string().trim().max(500).default("Revoked by administrator"),
});

export const userStatusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500).default(""),
});

export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amountKobo: z.number().int().min(100).max(100000000),
  active: z.boolean(),
});

export const inquiryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(40).default(""),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  deliveryLocation: z.string().trim().max(200).default(""),
  message: z.string().trim().max(2000).default(""),
  inquiryType: z.enum(["hardcover", "general"]).default("hardcover"),
});

export const inquiryUpdateSchema = z.object({
  status: z.enum(["new", "reviewed", "contacted", "fulfilled", "archived"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export const bankAccountSchema = z.object({
  currency: z.enum(["NGN", "USD", "GBP"]),
  label: z.string().trim().min(2).max(80),
  bankName: z.string().trim().min(2).max(120),
  accountName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().min(6).max(40),
});

export const settingsUpdateSchema = z.object({
  siteTitle: z.string().trim().min(2).max(120).optional(),
  siteTagline: z.string().trim().min(2).max(300).optional(),
  brandStatement: z.string().trim().min(2).max(300).optional(),
  siteHeadline: z.string().trim().min(2).max(300).optional(),
  siteSubheadline: z.string().trim().min(2).max(300).optional(),
  targetAudience: z.string().trim().min(2).max(120).optional(),
  organizationName: z.string().trim().min(2).max(120).optional(),
  organizationDescription: z.string().trim().max(2000).optional(),
  authorName: z.string().trim().min(2).max(120).optional(),
  authorTitle: z.string().trim().max(200).optional(),
  authorBio: z.string().trim().max(4000).optional(),
  contactEmail: z.email().max(254).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  contactSecondaryPhone: z.string().trim().max(60).optional(),
  contactWebsite: z.string().trim().max(160).optional(),
  contactAddress: z.string().trim().max(300).optional(),
  hardcoverPriceKobo: z.coerce
    .number()
    .int()
    .min(100)
    .max(100000000)
    .optional(),
  hardcoverAvailability: z
    .enum(["available", "preorder", "out_of_stock"])
    .optional(),
  hardcoverNote: z.string().trim().max(1000).optional(),
  digitalEditionPriceKobo: z.coerce
    .number()
    .int()
    .min(100)
    .max(100000000)
    .optional(),
  digitalEditionAvailability: z
    .enum(["available", "unavailable"])
    .optional(),
  digitalEditionScope: z
    .enum(["edition_2027", "includes_membership_updates"])
    .optional(),
  digitalEditionNote: z.string().trim().max(1000).optional(),
  bulkDiscountNote: z.string().trim().max(1000).optional(),
  bankTransferEnabled: z.boolean().optional(),
  bankAccounts: z.array(bankAccountSchema).min(1).max(6).optional(),
  allowRegistration: z.boolean().optional(),
  enableAutoRenewal: z.boolean().optional(),
  renewalReminderDays: z.coerce.number().int().min(1).max(60).optional(),
});
