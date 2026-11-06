export interface PaymentProvider {
  readonly name: string;
  authorize(input: { reference: string; amountKobo: number }): {
    reference: string;
    status: "succeeded";
  };
}
/** Development simulator only. A real provider must verify a server-side payment before activation. */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo";
  constructor(enabled: boolean, environment: string) {
    if (!enabled || environment === "production")
      throw new Error("Demo payments are disabled.");
  }
  authorize(input: { reference: string; amountKobo: number }) {
    if (input.amountKobo <= 0) throw new Error("Invalid payment amount");
    return { reference: input.reference, status: "succeeded" as const };
  }
}
