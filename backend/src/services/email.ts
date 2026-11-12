import { createHash, createHmac } from "node:crypto";
import type { EmailTemplateId } from "./emailTemplates.js";
import { renderEmailTemplate } from "./emailTemplates.js";

export type EmailDeliveryResult = {
  delivered: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  statusCode?: number;
  retryable?: boolean;
  rateLimited?: boolean;
};

export function sanitizeProviderError(
  raw: unknown,
  fallback = "Email delivery was not accepted by the provider.",
): string {
  const msg = String(raw || "")
    .replace(/re_[a-zA-Z0-9_]{8,}/g, "[REDACTED_RESEND_KEY]")
    .replace(/sk_(live|test)_[a-zA-Z0-9]+/gi, "[REDACTED_KEY]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]")
    .replace(/\s+/g, " ")
    .trim();
  if (!msg) return fallback;
  return msg.slice(0, 280);
}

export type OutboundEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateId?: EmailTemplateId;
  category?: "transactional" | "optional";
  replyTo?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export interface EmailService {
  readonly configured: boolean;
  readonly providerName?: string;
  readonly fromAddress?: string;
  readonly replyToAddress?: string;
  readonly domainVerified?: boolean;
  sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult>;
  sendPasswordResetCode?: (payload: {
    to: string;
    name: string;
    code: string;
    expiresMinutes: number;
    appBaseUrl: string;
  }) => Promise<EmailDeliveryResult>;
  sendAdminPasswordResetCode?: (payload: {
    to: string;
    name: string;
    code: string;
    expiresMinutes: number;
    appBaseUrl: string;
  }) => Promise<EmailDeliveryResult>;
  sendPasswordReset?: (payload: {
    to: string;
    name: string;
    resetUrl: string;
    expiresAt: string;
  }) => Promise<{ delivered: boolean; error?: string }>;
  sendAdminPasswordReset?: (payload: {
    to: string;
    name: string;
    resetUrl: string;
    expiresAt: string;
  }) => Promise<{ delivered: boolean; error?: string }>;
  sendOrderAccessLink: (payload: {
    to: string;
    name: string;
    orderNumber: string;
    accessUrl: string;
    expiresInMinutes: number;
  }) => Promise<{ delivered: boolean; error?: string }>;
}

function formatFromHeader(fromAddress: string, fromName: string): string {
  const email = fromAddress.trim();
  if (!email) return "noreply@cossyteens.com";
  if (email.includes("<") && email.includes(">")) return email;
  const cleanName = fromName.replace(/[\r\n<>"]/g, "").trim();
  return cleanName ? `${cleanName} <${email}>` : email;
}

abstract class BaseEmailAdapter implements EmailService {
  abstract readonly configured: boolean;
  abstract readonly providerName: string;
  readonly fromAddress: string;
  readonly fromName: string;
  readonly replyToAddress: string;
  readonly domainVerified: boolean;

  constructor(options: {
    fromAddress?: string;
    fromName?: string;
    replyToAddress?: string;
    domainVerified?: boolean;
  }) {
    this.fromAddress = options.fromAddress?.trim() || "noreply@cossyteens.com";
    this.fromName =
      options.fromName?.trim() || "The Balanced Life Devotional";
    this.replyToAddress =
      options.replyToAddress?.trim() || "cossyteensconsult@gmail.com";
    this.domainVerified = Boolean(options.domainVerified);
  }

  protected formattedFrom(): string {
    return formatFromHeader(this.fromAddress, this.fromName);
  }

  abstract sendEmail(
    payload: OutboundEmailMessage,
  ): Promise<EmailDeliveryResult>;

  async sendPasswordResetCode(payload: {
    to: string;
    name: string;
    code: string;
    expiresMinutes: number;
    appBaseUrl: string;
  }): Promise<EmailDeliveryResult> {
    const rendered = renderEmailTemplate("password_reset_code", {
      recipientName: payload.name,
      code: payload.code,
      expiresMinutes: payload.expiresMinutes,
      audience: "reader",
      appBaseUrl: payload.appBaseUrl,
    });
    return this.sendEmail({
      to: payload.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: "password_reset_code",
      category: "transactional",
    });
  }

  async sendAdminPasswordResetCode(payload: {
    to: string;
    name: string;
    code: string;
    expiresMinutes: number;
    appBaseUrl: string;
  }): Promise<EmailDeliveryResult> {
    const rendered = renderEmailTemplate("password_reset_code", {
      recipientName: payload.name,
      code: payload.code,
      expiresMinutes: payload.expiresMinutes,
      audience: "admin",
      appBaseUrl: payload.appBaseUrl,
    });
    return this.sendEmail({
      to: payload.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: "password_reset_code",
      category: "transactional",
    });
  }

  async sendOrderAccessLink(payload: {
    to: string;
    name: string;
    orderNumber: string;
    accessUrl: string;
    expiresInMinutes: number;
  }): Promise<{ delivered: boolean; error?: string }> {
    let appBaseUrl: string;
    try {
      appBaseUrl = new URL(payload.accessUrl).origin;
    } catch {
      appBaseUrl = "https://cossyteens.com";
    }
    const rendered = renderEmailTemplate("printed_order_received", {
      recipientName: payload.name,
      reference: payload.orderNumber,
      quantity: 1,
      subtotalKobo: 500000,
      destinationLabel: `Order Lookup Link (valid ${payload.expiresInMinutes} mins)`,
      trackingUrl: payload.accessUrl,
      appBaseUrl,
    });
    const result = await this.sendEmail({
      to: payload.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: "printed_order_received",
      category: "transactional",
    });
    return { delivered: result.delivered, error: result.error };
  }
}

export class ResendEmailAdapter extends BaseEmailAdapter {
  readonly configured: boolean;
  readonly providerName = "resend";
  private readonly apiKey: string;

  constructor(options: {
    apiKey: string;
    fromAddress?: string;
    fromName?: string;
    replyToAddress?: string;
    domainVerified?: boolean;
  }) {
    super(options);
    this.apiKey = options.apiKey.trim();
    this.configured = Boolean(this.apiKey);
  }

  async sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    if (!this.configured) {
      return {
        delivered: false,
        provider: this.providerName,
        error: "Resend API key is not configured.",
        statusCode: 503,
        retryable: false,
      };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };
      if (payload.idempotencyKey) {
        headers["Idempotency-Key"] = payload.idempotencyKey.slice(0, 120);
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          from: this.formattedFrom(),
          to: [payload.to],
          reply_to: payload.replyTo || this.replyToAddress,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          headers: payload.headers,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
        error?: { message?: string };
      };

      if (!response.ok) {
        const rawMsg = body?.message || body?.error?.message || "";
        const safeDetail = sanitizeProviderError(
          rawMsg,
          `Resend responded with HTTP ${response.status}.`,
        );

        if (response.status === 401) {
          return {
            delivered: false,
            provider: this.providerName,
            statusCode: 401,
            retryable: false,
            error:
              "Resend rejected the API key (HTTP 401). Check EMAIL_API_KEY configuration.",
          };
        }
        if (response.status === 403) {
          return {
            delivered: false,
            provider: this.providerName,
            statusCode: 403,
            retryable: false,
            error: `Resend rejected the sender or recipient (HTTP 403): ${safeDetail}`,
          };
        }
        if (response.status === 429) {
          return {
            delivered: false,
            provider: this.providerName,
            statusCode: 429,
            retryable: true,
            rateLimited: true,
            error: `Resend free-tier sending or rate limit reached (HTTP 429): ${safeDetail}`,
          };
        }
        if (response.status >= 500) {
          return {
            delivered: false,
            provider: this.providerName,
            statusCode: response.status,
            retryable: true,
            error: `Resend service is temporarily unavailable (HTTP ${response.status}).`,
          };
        }
        return {
          delivered: false,
          provider: this.providerName,
          statusCode: response.status,
          retryable: false,
          error: safeDetail,
        };
      }

      const acceptedId =
        typeof body?.id === "string" ? body.id.trim() : "";
      if (!acceptedId) {
        return {
          delivered: false,
          provider: this.providerName,
          statusCode: response.status,
          retryable: true,
          error:
            "Resend did not return an accepted email ID. The email was not confirmed as sent.",
        };
      }

      return {
        delivered: true,
        provider: this.providerName,
        statusCode: response.status,
        messageId: acceptedId,
      };
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        delivered: false,
        provider: this.providerName,
        statusCode: 504,
        retryable: true,
        error: isAbort
          ? "Resend request timed out before confirming delivery."
          : sanitizeProviderError(
              error instanceof Error ? error.message : "",
              "Network error while contacting Resend.",
            ),
      };
    }
  }
}

export class PostmarkEmailAdapter extends BaseEmailAdapter {
  readonly configured: boolean;
  readonly providerName = "postmark";
  private readonly serverToken: string;

  constructor(options: {
    apiKey: string;
    fromAddress?: string;
    fromName?: string;
    replyToAddress?: string;
    domainVerified?: boolean;
  }) {
    super(options);
    this.serverToken = options.apiKey.trim();
    this.configured = Boolean(this.serverToken);
  }

  async sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    if (!this.configured) {
      return {
        delivered: false,
        provider: this.providerName,
        error: "Postmark server token is not configured.",
      };
    }

    try {
      const extraHeaders = payload.headers
        ? Object.entries(payload.headers).map(([Name, Value]) => ({
            Name,
            Value,
          }))
        : undefined;

      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": this.serverToken,
        },
        body: JSON.stringify({
          From: this.formattedFrom(),
          To: payload.to,
          ReplyTo: payload.replyTo || this.replyToAddress,
          Subject: payload.subject,
          HtmlBody: payload.html,
          TextBody: payload.text,
          Tag: payload.templateId || payload.category || "transactional",
          Headers: extraHeaders,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        MessageID?: string;
        Message?: string;
        ErrorCode?: number;
      };

      if (!response.ok || (body.ErrorCode && body.ErrorCode !== 0)) {
        return {
          delivered: false,
          provider: this.providerName,
          error:
            body?.Message ||
            `Postmark responded with HTTP ${response.status}.`,
        };
      }

      return {
        delivered: true,
        provider: this.providerName,
        messageId: body.MessageID,
      };
    } catch (error) {
      return {
        delivered: false,
        provider: this.providerName,
        error:
          error instanceof Error
            ? error.message
            : "Postmark delivery failed.",
      };
    }
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

export class SesEmailAdapter extends BaseEmailAdapter {
  readonly configured: boolean;
  readonly providerName = "ses";
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(options: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    fromAddress?: string;
    fromName?: string;
    replyToAddress?: string;
    domainVerified?: boolean;
  }) {
    super(options);
    this.region = options.region.trim() || "us-east-1";
    this.accessKeyId = options.accessKeyId.trim();
    this.secretAccessKey = options.secretAccessKey.trim();
    this.configured = Boolean(this.accessKeyId && this.secretAccessKey);
  }

  async sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    if (!this.configured) {
      return {
        delivered: false,
        provider: this.providerName,
        error: "Amazon SES credentials are not configured.",
      };
    }

    const host = `email.${this.region}.amazonaws.com`;
    const canonicalUri = "/v2/email/outbound-emails";
    const endpoint = `https://${host}${canonicalUri}`;
    const bodyString = JSON.stringify({
      FromEmailAddress: this.formattedFrom(),
      ReplyToAddresses: [payload.replyTo || this.replyToAddress],
      Destination: {
        ToAddresses: [payload.to],
      },
      Content: {
        Simple: {
          Subject: { Data: payload.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: payload.text, Charset: "UTF-8" },
            Html: { Data: payload.html, Charset: "UTF-8" },
          },
        },
      },
    });

    const now = new Date();
    const amzDate = now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(bodyString);
    const canonicalHeaders =
      `content-type:application/json\n` +
      `host:${host}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-date";
    const canonicalRequest = [
      "POST",
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/ses/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate = hmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.region);
    const kService = hmacSha256(kRegion, "ses");
    const kSigning = hmacSha256(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning)
      .update(stringToSign, "utf8")
      .digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Amz-Date": amzDate,
          Authorization: authorization,
        },
        body: bodyString,
      });

      const body = (await response.json().catch(() => ({}))) as {
        MessageId?: string;
        message?: string;
      };

      if (!response.ok) {
        return {
          delivered: false,
          provider: this.providerName,
          error:
            body?.message ||
            `Amazon SES responded with HTTP ${response.status}.`,
        };
      }

      return {
        delivered: true,
        provider: this.providerName,
        messageId: body.MessageId,
      };
    } catch (error) {
      return {
        delivered: false,
        provider: this.providerName,
        error:
          error instanceof Error
            ? error.message
            : "Amazon SES delivery failed.",
      };
    }
  }
}

export class WebhookEmailService extends BaseEmailAdapter {
  readonly configured: boolean;
  readonly providerName = "webhook";
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;

  constructor(options: {
    webhookUrl?: string;
    webhookSecret?: string;
    from?: string;
    fromAddress?: string;
    fromName?: string;
    replyToAddress?: string;
    domainVerified?: boolean;
  }) {
    super({
      fromAddress: options.fromAddress || options.from,
      fromName: options.fromName,
      replyToAddress: options.replyToAddress,
      domainVerified: options.domainVerified,
    });
    this.webhookUrl = options.webhookUrl?.trim() || "";
    this.webhookSecret = options.webhookSecret?.trim() || "";
    this.configured = Boolean(this.webhookUrl);
  }

  async sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    if (!this.configured) {
      return {
        delivered: false,
        provider: this.providerName,
        error: "Transactional email webhook is not configured.",
      };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.webhookSecret) {
        headers["X-Email-Webhook-Secret"] = this.webhookSecret;
      }
      if (payload.idempotencyKey) {
        headers["Idempotency-Key"] = payload.idempotencyKey;
      }

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: payload.templateId || "transactional",
          category: payload.category || "transactional",
          from: this.formattedFrom(),
          replyTo: payload.replyTo || this.replyToAddress,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          headers: payload.headers,
          idempotencyKey: payload.idempotencyKey,
        }),
      });

      if (!response.ok) {
        return {
          delivered: false,
          provider: this.providerName,
          error: `Email webhook responded with HTTP ${response.status}.`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as {
        messageId?: string;
        id?: string;
      };

      return {
        delivered: true,
        provider: this.providerName,
        messageId: data.messageId || data.id || `webhook_${Date.now()}`,
      };
    } catch (error) {
      return {
        delivered: false,
        provider: this.providerName,
        error:
          error instanceof Error ? error.message : "Email delivery failed.",
      };
    }
  }
}

export class LocalCaptureEmailAdapter extends BaseEmailAdapter {
  readonly configured = true;
  readonly providerName = "capture";
  readonly captured: Array<
    OutboundEmailMessage & { capturedAt: string; messageId: string }
  > = [];

  async sendEmail(payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    const messageId = `capture_${Date.now()}_${this.captured.length + 1}`;
    this.captured.push({
      ...payload,
      capturedAt: new Date().toISOString(),
      messageId,
    });
    if (this.captured.length > 200) {
      this.captured.shift();
    }
    return {
      delivered: true,
      provider: this.providerName,
      messageId,
    };
  }
}

export class UnconfiguredEmailAdapter extends BaseEmailAdapter {
  readonly configured = false;
  readonly providerName = "none";

  async sendEmail(_payload: OutboundEmailMessage): Promise<EmailDeliveryResult> {
    return {
      delivered: false,
      provider: this.providerName,
      error: "Email delivery provider is not configured.",
    };
  }
}

export function createEmailService(config: {
  provider: string;
  apiKey?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  domainVerified?: boolean;
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
}): EmailService {
  const shared = {
    fromAddress: config.from,
    fromName: config.fromName,
    replyToAddress: config.replyTo,
    domainVerified: config.domainVerified,
  };

  switch (config.provider) {
    case "resend":
      return new ResendEmailAdapter({
        ...shared,
        apiKey: config.apiKey || "",
      });
    case "postmark":
      return new PostmarkEmailAdapter({
        ...shared,
        apiKey: config.apiKey || "",
      });
    case "ses":
      return new SesEmailAdapter({
        ...shared,
        region: config.sesRegion || "us-east-1",
        accessKeyId: config.sesAccessKeyId || "",
        secretAccessKey: config.sesSecretAccessKey || "",
      });
    case "webhook":
      return new WebhookEmailService({
        ...shared,
        webhookUrl: config.webhookUrl,
        webhookSecret: config.webhookSecret,
      });
    case "capture":
      return new LocalCaptureEmailAdapter(shared);
    default:
      return new UnconfiguredEmailAdapter(shared);
  }
}
