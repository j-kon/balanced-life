import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../errors.js";

export type PaymentInitializeInput = {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

export type PaymentInitializeResult = {
  reference: string;
  authorizationUrl: string;
};

export type PaymentVerificationResult = {
  reference: string;
  status: "succeeded" | "failed" | "abandoned" | "pending";
  amountKobo: number;
  currency: string;
  providerTransactionId: string;
  subscriptionCode?: string;
  paidAt?: string;
};

export interface PaymentProvider {
  readonly name: "paystack";
  readonly configured: boolean;
  readonly mode?: "test" | "live" | "unconfigured";
  readonly publicKey: string | null;
  initializeTransaction(
    input: PaymentInitializeInput,
  ): Promise<PaymentInitializeResult>;
  verifyTransaction(reference: string): Promise<PaymentVerificationResult>;
  verifyWebhookSignature(rawBody: string, signature?: string): boolean;
}

export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  readonly configured: boolean;
  readonly mode: "test" | "live" | "unconfigured";
  readonly publicKey: string | null;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(options: {
    secretKey?: string;
    publicKey?: string | null;
    webhookSecret?: string | null;
    baseUrl?: string;
  }) {
    this.secretKey = options.secretKey?.trim() || "";
    this.webhookSecret = options.webhookSecret?.trim() || this.secretKey;
    this.publicKey = options.publicKey?.trim() || null;
    this.configured = Boolean(this.secretKey);
    this.mode = !this.configured
      ? "unconfigured"
      : this.secretKey.startsWith("sk_live_")
        ? "live"
        : "test";
    this.baseUrl = options.baseUrl || "https://api.paystack.co";
  }

  private ensureConfigured() {
    if (!this.configured) {
      throw new HttpError(
        503,
        "Online payment processing via Paystack is not configured in this environment. Set PAYSTACK_SECRET_KEY to enable live or test transactions, or grant complimentary access from the administrator dashboard.",
      );
    }
  }

  async initializeTransaction(
    input: PaymentInitializeInput,
  ): Promise<PaymentInitializeResult> {
    this.ensureConfigured();
    if (input.amountKobo <= 0) {
      throw new HttpError(400, "Invalid payment amount.");
    }

    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });

    const payload = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };

    if (!res.ok || !payload.status || !payload.data?.authorization_url) {
      throw new HttpError(
        502,
        payload.message || "Could not initialize Paystack payment session.",
      );
    }

    return {
      reference: payload.data.reference || input.reference,
      authorizationUrl: payload.data.authorization_url,
    };
  }

  async verifyTransaction(
    reference: string,
  ): Promise<PaymentVerificationResult> {
    this.ensureConfigured();

    const res = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      },
    );

    const payload = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number | string;
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        paid_at?: string;
        plan_object?: { plan_code?: string };
      };
    };

    if (!res.ok || !payload.status || !payload.data) {
      throw new HttpError(
        502,
        payload.message || "Unable to verify payment with Paystack.",
      );
    }

    const data = payload.data;
    const rawStatus = (data.status || "").toLowerCase();
    const status: PaymentVerificationResult["status"] =
      rawStatus === "success"
        ? "succeeded"
        : rawStatus === "failed"
          ? "failed"
          : rawStatus === "abandoned"
            ? "abandoned"
            : "pending";

    return {
      reference: data.reference || reference,
      status,
      amountKobo: Number(data.amount) || 0,
      currency: (data.currency || "NGN").toUpperCase(),
      providerTransactionId: String(data.id || ""),
      paidAt: data.paid_at || new Date().toISOString(),
    };
  }

  verifyWebhookSignature(rawBody: string, signature?: string): boolean {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac("sha512", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signature, "utf8");
    return (
      expectedBuf.length === actualBuf.length &&
      timingSafeEqual(expectedBuf, actualBuf)
    );
  }
}

