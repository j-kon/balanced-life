-- Preserve existing entitlements and payment history; stop selling recurring plans.
UPDATE subscription_plans SET active = 0;
INSERT INTO settings (key, value) VALUES ('hardcoverPriceKobo', '500000') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO settings (key, value) VALUES ('digitalEditionPriceKobo', '350000') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO settings (key, value) VALUES ('digitalEditionScope', 'edition_2027') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO settings (key, value) VALUES ('digitalEditionNote', 'One payment of ₦3,500 gives your account access to all published readings in the 2027 edition, including readings published later. No monthly renewal. Future editions and the printed book are sold separately.') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO settings (key, value) VALUES ('enableAutoRenewal', 'false') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
