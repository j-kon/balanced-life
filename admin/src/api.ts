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
  const rawText = await res.text();
  let data: any = null;
  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // non-JSON response body
    }
  }
  if (!res.ok) {
    const errorMsg =
      data?.message ||
      data?.error ||
      (rawText && rawText.length < 200 ? rawText : "") ||
      `Server returned HTTP ${res.status} ${res.statusText || ""}`.trim();
    throw new Error(errorMsg);
  }
  return data as T;
}

