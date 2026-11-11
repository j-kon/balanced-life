import { HttpError } from "../errors.js";

export type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export type OrderAccessEmailInput = {
  to: string;
  name: string;
  orderNumber: string;
  accessUrl: string;
  expiresInMinutes: number;
};

export interface EmailService {
  readonly configured: boolean;
  sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
  sendOrderAccessLink?(input: OrderAccessEmailInput): Promise<void>;
}

export class WebhookEmailService implements EmailService {
  readonly configured: boolean;
  private readonly webhookUrl: string;
  private readonly from: string;

  constructor(options: { webhookUrl?: string; from?: string }) {
    this.webhookUrl = options.webhookUrl?.trim() || "";
    this.from = options.from?.trim() || "noreply@cossyteensconsult.org";
    this.configured = Boolean(this.webhookUrl);
  }

  async sendPasswordReset(input: PasswordResetEmailInput): Promise<void> {
    if (!this.configured) {
      throw new HttpError(
        503,
        "Transactional email delivery is not configured in this environment. Set EMAIL_WEBHOOK_URL to enable automated password-reset emails, or contact an administrator.",
      );
    }

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: "Reset your password — The Balanced Life Devotional",
        text: `Hello ${input.name},\n\nWe received a request to reset your password for The Balanced Life Devotional.\n\nReset link (valid for ${input.expiresInMinutes} minutes):\n${input.resetUrl}\n\nIf you did not request this change, you can safely ignore this message.`,
      }),
    });

    if (!res.ok) {
      throw new HttpError(
        502,
        "Password reset email could not be delivered by the configured email provider.",
      );
    }
  }

  async sendOrderAccessLink(input: OrderAccessEmailInput): Promise<void> {
    if (!this.configured) {
      throw new HttpError(
        503,
        "Transactional email delivery is not configured in this environment. Set EMAIL_WEBHOOK_URL to enable order access links, or contact an administrator.",
      );
    }

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: `Access your printed book order (${input.orderNumber}) — The Balanced Life Devotional`,
        text: `Hello ${input.name},\n\nUse the secure link below to view your printed book order (${input.orderNumber}), review your delivery quotation, or complete payment.\n\nOrder access link (valid for ${input.expiresInMinutes} minutes):\n${input.accessUrl}\n\nIf you did not request this link, you can safely ignore this message.`,
      }),
    });

    if (!res.ok) {
      throw new HttpError(
        502,
        "Order access email could not be delivered by the configured email provider.",
      );
    }
  }
}

