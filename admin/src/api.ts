export const money = (kobo: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);

export const dateLabel = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const monthName = (month: number) =>
  new Date(2027, month - 1, 1).toLocaleString("en-GB", { month: "long" });

export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const headers: Record<string, string> = {};
  if (isMutation) {
    headers["X-Requested-With"] = "BalancedLifeAdmin";
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Request could not be completed.");
  }
  return data as T;
}

