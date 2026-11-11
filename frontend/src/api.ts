export type { Entry, Plan, User } from "./types";

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

export const daysUntil2027 = (currentDate: string) => {
  const now = new Date(currentDate + "T00:00:00Z").getTime();
  const start = new Date("2027-01-01T00:00:00Z").getTime();
  return Math.max(0, Math.ceil((start - now) / 86400000));
};

const inflightGets = new Map<string, Promise<unknown>>();

async function executeRequest<T>(
  path: string,
  body: unknown,
  method: string,
): Promise<T> {
  const res = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-Requested-With": "BalancedLife",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }
  return data as T;
}

export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" && body === undefined) {
    const existing = inflightGets.get(path);
    if (existing) {
      return (await existing) as T;
    }

    const requestPromise = executeRequest<T>(path, body, normalizedMethod);
    inflightGets.set(path, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (inflightGets.get(path) === requestPromise) {
        inflightGets.delete(path);
      }
    }
  }

  return executeRequest<T>(path, body, normalizedMethod);
}
