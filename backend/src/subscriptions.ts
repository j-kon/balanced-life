import { eq } from "drizzle-orm";
import type { Store } from "./db.js";
import { subscriptions, payments, plans } from "./schema.js";
import type { PaymentProvider } from "./payments.js";
export function addMonths(date: string, months: number): string {
  const value = new Date(date),
    day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString();
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function activateDemo(
  store: Store,
  userId: number,
  input: {
    planId: number;
    renewalMode: "manual" | "automatic";
    reference: string;
  },
  provider: PaymentProvider,
) {
  return store.sqlite.transaction(() => {
    const { db } = store;
    const previous = db
      .select()
      .from(payments)
      .where(eq(payments.reference, input.reference))
      .get();
    if (previous) {
      if (previous.userId !== userId || previous.planId !== input.planId)
        throw new HttpError(
          409,
          "This payment reference has already been used.",
        );
      return {
        subscription: db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, previous.subscriptionId))
          .get(),
        payment: previous,
        replayed: true,
      };
    }
    const plan = db
      .select()
      .from(plans)
      .where(eq(plans.id, input.planId))
      .get();
    if (!plan?.active) throw new HttpError(400, "This plan is not available.");
    const authorization = provider.authorize({
      reference: input.reference,
      amountKobo: plan.amountKobo,
    });
    const now = new Date().toISOString();
    const current = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();
    const base = current && current.expiresAt > now ? current.expiresAt : now;
    const values = {
      userId,
      planId: plan.id,
      startedAt: current?.startedAt || now,
      expiresAt: addMonths(base, plan.months),
      renewalMode: input.renewalMode,
      cancelAtPeriodEnd: false,
      isDemo: true,
    };
    const subscription = db
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.userId, set: values })
      .returning()
      .get();
    const payment = db
      .insert(payments)
      .values({
        userId,
        subscriptionId: subscription.id,
        planId: plan.id,
        planName: plan.name,
        amountKobo: plan.amountKobo,
        reference: authorization.reference,
        provider: provider.name,
        status: authorization.status,
        createdAt: now,
      })
      .returning()
      .get();
    return { subscription, payment, replayed: false };
  })();
}
