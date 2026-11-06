export type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
};
export type Entry = {
  id: number;
  date: string;
  title: string;
  theme: string;
  sample: boolean;
  published: boolean;
  completed?: boolean;
  saved?: boolean;
  bibleText?: string;
  memoryVerse?: string;
  reflection?: string;
  thinkAbout?: string;
  prayer?: string;
  challenge?: string;
};
export type Plan = {
  id: number;
  name: string;
  months: number;
  amountKobo: number;
  active: boolean;
};
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
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
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
  if (!res.ok)
    throw new Error(data.message || "Something went wrong. Please try again.");
  return data as T;
}
