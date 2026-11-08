import "./config.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const DEFAULT_PLANS = [
  { name: "Monthly", months: 1, amountKobo: 100000, active: false },
  { name: "Quarterly", months: 3, amountKobo: 270000, active: false },
  { name: "Six months", months: 6, amountKobo: 480000, active: false },
  { name: "Yearly", months: 12, amountKobo: 850000, active: false },
] as const;

export const DEFAULT_MONTHLY_THEMES = [
  {
    month: 1,
    title: "Gratitude, Identity & Intentionality",
    description:
      "Beginning the year with thanksgiving, a clear sense of identity in Christ, and daily spiritual habits.",
  },
  {
    month: 2,
    title: "Love, Family, friendship Relationships & Healthy Connections",
    description:
      "Nurturing godly love, honouring family, choosing wise friendships, and setting healthy relational boundaries.",
  },
  {
    month: 3,
    title: "EMOTIONAL INTELLIGENCE • SELF-AWARENESS • RESILIENCE",
    description:
      "Understanding your emotions, responding with grace under pressure, and building resilience through faith.",
  },
  {
    month: 4,
    title: "ACADEMIC / CAREER EXCELLENCE • SKILLS • CONSISTENCY",
    description:
      "Pursuing diligence in study and work, sharpening your gifts, and practicing faithful consistency.",
  },
  {
    month: 5,
    title: "SELF-DISCOVERY • CONFIDENCE • PURPOSE • A HABIT OF PRAYER",
    description:
      "Uncovering God's purpose for your life and anchoring your confidence in a steady life of prayer.",
  },
  {
    month: 6,
    title: "FINANCIAL WISDOM • WORK • STEWARDSHIP",
    description:
      "Learning contentment, generosity, wise resource management, and faithful stewardship early in life.",
  },
  {
    month: 7,
    title: "LEADERSHIP • RESPONSIBILITY • INFLUENCE",
    description:
      "Leading by example, taking ownership of your choices, and being a Christlike influence in your community.",
  },
  {
    month: 8,
    title: "HOLINESS • THE FEAR OF GOD • HEALTHY LIVING",
    description:
      "Walking in purity, reverencing God in private and public, and caring for your mind and body.",
  },
  {
    month: 9,
    title: "LEARNING • DIGITAL DISCIPLINE • OPPORTUNITY",
    description:
      "Redeeming your time online, cultivating lifelong curiosity, and stewarding every season of opportunity.",
  },
  {
    month: 10,
    title: "NONCONFORMITY • COURAGE • BEING DIFFERENT IN A CHANGING WORLD.",
    description:
      "Standing firm in conviction, resisting peer pressure with grace, and shining brightly in a shifting culture.",
  },
  {
    month: 11,
    title: "THE HOLY SPIRIT • SPIRITUAL GIFTS • SERVING GOD",
    description:
      "Walking in step with the Holy Spirit, discovering spiritual gifts, and serving others wholeheartedly.",
  },
  {
    month: 12,
    title:
      "THE FRUIT OF THE SPIRIT • JESUS' BIRTH • GRATITUDE • PRAYER FOR THE NEW YEAR",
    description:
      "Reflecting Christ's character, celebrating the incarnation, and preparing your heart in gratitude for the year ahead.",
  },
] as const;

export type BankAccountSetting = {
  currency: "NGN" | "USD" | "GBP";
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export const DEFAULT_BANK_ACCOUNTS: BankAccountSetting[] = [
  {
    currency: "NGN",
    label: "Naira Account",
    bankName: "Access Bank",
    accountName: "Cossy Teens Consult Enterprises",
    accountNumber: "1996043204",
  },
  {
    currency: "USD",
    label: "USD Account",
    bankName: "Access Bank",
    accountName: "Cossy Teens Consult",
    accountNumber: "2002256283",
  },
  {
    currency: "GBP",
    label: "GBP Account",
    bankName: "Access Bank",
    accountName: "Cossy Teens Consult",
    accountNumber: "2002391667",
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  siteTitle: "The Balanced Life Devotional",
  siteTagline:
    "Godliness for the heart. Wisdom for the journey. Growth for the whole person.",
  brandStatement:
    "Building Minds. Shaping Character. Creating Balanced Lives.",
  siteHeadline: "Growing up is a journey. Make every day count.",
  siteSubheadline:
    "365 Days of Connecting with Jesus with holistic development.",
  targetAudience: "Teenagers & Young Adults | Ages 13–25",
  organizationName: "Cossy Teens Consult Enterprises",
  organizationDescription:
    "Cossy Teens Consult Enterprises is a professional counselling and mentorship hub committed to helping teenagers and young adults grow with balance. Its work helps young people build strong faith, sound character, healthy relationships, emotional wisdom, life skills, and the confidence to live purposefully.",
  authorName: "Mrs. Adindu Ogechukwu Constance Nwisi",
  authorTitle:
    "Certified Counselling Practitioner & Lead Consultant, Cossy Teens Consult Enterprises",
  authorBio:
    "Adindu Ogechukwu Constance Nwisi is a Certified Counselling Practitioner, writer, preacher, public speaker, and the Lead Consultant of Cossy Teens Consult Enterprises. She has worked with teenagers and young adults for over a decade. Her journey with God began as a child—she began using devotionals as far back as Primary Four and gave her life to Christ in Primary Six. Her passion is rooted in a simple desire: to help young people know God for themselves, discover who they are, and grow holistically in every important area of life.",
  contactEmail: "cossyteensconsult@gmail.com",
  contactPhone: "+2349055002143",
  contactSecondaryPhone: "+2349113708399",
  contactWebsite: "cossyteens.com",
  contactAddress: "Nigeria",
  hardcoverPriceKobo: "500000",
  hardcoverAvailability: "available",
  hardcoverNote:
    "Printed copies of the 2027 edition are available at ₦5,000 for individual readers, parents, schools, churches, and youth organizations.",
  digitalEditionPriceKobo: "350000",
  digitalEditionAvailability: "available",
  digitalEditionScope: "edition_2027",
  digitalEditionNote:
    "One-time purchase (₦3,500) granting persistent online reading access to the 2027 edition inside your reader dashboard.",
  bulkDiscountNote:
    "Bulk orders for parents, schools, churches, youth groups, and organizations qualify for a custom discount approved by the author.",
  bankTransferEnabled: "false",
  bankAccountsJson: JSON.stringify(DEFAULT_BANK_ACCOUNTS),
  allowRegistration: "true",
  enableAutoRenewal: "false",
  renewalReminderDays: "7",
};

export function openDatabase(
  path = process.env.DATABASE_PATH ||
    resolve(root, "backend/data/devotional.sqlite"),
) {
  if (path !== ":memory:") {
    if (!isAbsolute(path)) path = resolve(root, "backend", path);
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const file of readdirSync(resolve(root, "backend/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !sqlite
        .prepare("SELECT name FROM schema_migrations WHERE name=?")
        .get(file)
    ) {
      sqlite.transaction(() => {
        sqlite.exec(
          readFileSync(resolve(root, "backend/migrations", file), "utf8"),
        );
        sqlite
          .prepare("INSERT INTO schema_migrations VALUES (?,?)")
          .run(file, new Date().toISOString());
      })();
    }
  }
  const db = drizzle(sqlite, { schema });
  sqlite.transaction(() => {
    for (const plan of DEFAULT_PLANS) {
      db.insert(schema.plans).values(plan).onConflictDoNothing().run();
    }
    for (const theme of DEFAULT_MONTHLY_THEMES) {
      db.insert(schema.monthlyThemes)
        .values(theme)
        .onConflictDoNothing()
        .run();
      sqlite
        .prepare(
          "UPDATE monthly_themes SET description = ? WHERE month = ? AND description = ''",
        )
        .run(theme.description, theme.month);
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      db.insert(schema.settings)
        .values({ key, value })
        .onConflictDoNothing()
        .run();
    }
  })();

  return { sqlite, db };
}

export type Store = ReturnType<typeof openDatabase>;
