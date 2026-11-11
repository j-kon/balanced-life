import { useState } from "react";
import { Landmark, Settings } from "lucide-react";
import type { BankAccountSetting } from "../types";
import type { AdminOverviewData, AdminSaveFn } from "./AdminTypes";

export function SettingsPage({
  data,
  busy,
  save,
}: {
  data: AdminOverviewData;
  busy: boolean;
  save: AdminSaveFn;
}) {
  const [bankAccountsDraft, setBankAccountsDraft] = useState<
    BankAccountSetting[] | null
  >(null);

  const currentBankAccounts =
    bankAccountsDraft || data.settings.bankAccounts || [];

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const defaultFeeRaw = String(
          f.get("defaultDeliveryFeeNgn") || "",
        ).trim();
        const stockRaw = String(
          f.get("printedBookStockCount") || "",
        ).trim();
        await save(
          "/admin/settings",
          {
            siteTitle: f.get("siteTitle"),
            siteTagline: f.get("siteTagline"),
            brandStatement: f.get("brandStatement"),
            siteHeadline: f.get("siteHeadline"),
            siteSubheadline: f.get("siteSubheadline"),
            targetAudience: f.get("targetAudience"),
            organizationName: f.get("organizationName"),
            organizationDescription: f.get("organizationDescription"),
            authorName: f.get("authorName"),
            authorTitle: f.get("authorTitle"),
            authorBio: f.get("authorBio"),
            digitalEditionPriceKobo: Math.round(
              Number(f.get("digitalEditionPriceNgn")) * 100,
            ),
            digitalAccessDurationMonths: Number(
              f.get("digitalAccessDurationMonths") || 12,
            ),
            digitalEditionAvailability: f.get("digitalEditionAvailability"),
            digitalEditionNote: f.get("digitalEditionNote"),
            hardcoverPriceKobo: Math.round(
              Number(f.get("hardcoverPriceNgn")) * 100,
            ),
            printedBookStockCount:
              stockRaw === "" ? null : Math.max(0, Number(stockRaw)),
            hardcoverAvailability: f.get("hardcoverAvailability"),
            deliveryPricingMode: f.get("deliveryPricingMode"),
            defaultDeliveryFeeKobo:
              defaultFeeRaw === ""
                ? null
                : Math.round(Number(defaultFeeRaw) * 100),
            deliveryPolicyNote: f.get("deliveryPolicyNote"),
            hardcoverNote: f.get("hardcoverNote"),
            contactEmail: f.get("contactEmail"),
            contactPhone: f.get("contactPhone"),
            contactSecondaryPhone: f.get("contactSecondaryPhone"),
            contactWebsite: f.get("contactWebsite"),
            contactAddress: f.get("contactAddress"),
            bulkDiscountNote: f.get("bulkDiscountNote"),
            bankTransferEnabled: f.get("bankTransferEnabled") === "on",
            bankTransferInstructions: f.get("bankTransferInstructions"),
            bankAccounts: currentBankAccounts,
            allowRegistration: f.get("allowRegistration") === "on",
            enableAutoRenewal: f.get("enableAutoRenewal") === "on",
            renewalReminderDays: Number(f.get("renewalReminderDays")),
          },
          "PUT",
        );
      }}
    >
      <h2>Brand Identity &amp; Homepage Headlines</h2>
      <div className="form-row-2">
        <label>
          Publication title
          <input
            name="siteTitle"
            defaultValue={data.settings.siteTitle}
            required
          />
        </label>
        <label>
          Organization name
          <input
            name="organizationName"
            defaultValue={data.settings.organizationName}
            required
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Brand statement
          <input
            name="brandStatement"
            defaultValue={data.settings.brandStatement}
            required
          />
        </label>
        <label>
          Target audience
          <input
            name="targetAudience"
            defaultValue={data.settings.targetAudience}
            required
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Main homepage headline
          <input
            name="siteHeadline"
            defaultValue={data.settings.siteHeadline}
            required
          />
        </label>
        <label>
          Homepage supporting message
          <input
            name="siteSubheadline"
            defaultValue={data.settings.siteSubheadline}
            required
          />
        </label>
      </div>
      <label>
        Established tagline
        <input
          name="siteTagline"
          defaultValue={data.settings.siteTagline}
          required
        />
      </label>
      <label>
        Organization description
        <textarea
          name="organizationDescription"
          rows={3}
          defaultValue={data.settings.organizationDescription}
          required
        />
      </label>

      <h2>Author Information</h2>
      <div className="form-row-2">
        <label>
          Author name
          <input
            name="authorName"
            defaultValue={data.settings.authorName}
            required
          />
        </label>
        <label>
          Author credentials / role title
          <input
            name="authorTitle"
            defaultValue={data.settings.authorTitle}
            required
          />
        </label>
      </div>
      <label>
        Author biography
        <textarea
          name="authorBio"
          rows={4}
          defaultValue={data.settings.authorBio}
          required
        />
      </label>

      <h2>Product A &amp; Product B Commerce Configuration</h2>
      <div className="form-row-2">
        <label>
          2027 Digital Access price (NGN)
          <input
            name="digitalEditionPriceNgn"
            type="number"
            min={100}
            step="1"
            defaultValue={data.settings.digitalEditionPriceKobo / 100}
            required
          />
        </label>
        <label>
          Digital Access duration (calendar months)
          <input
            name="digitalAccessDurationMonths"
            type="number"
            min={1}
            max={60}
            defaultValue={data.settings.digitalAccessDurationMonths || 12}
            required
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Digital Access availability
          <select
            name="digitalEditionAvailability"
            defaultValue={data.settings.digitalEditionAvailability}
          >
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
        <label>
          Digital Access product note
          <input
            name="digitalEditionNote"
            defaultValue={data.settings.digitalEditionNote}
            required
          />
        </label>
      </div>

      <div className="form-row-2">
        <label>
          Printed Book price per copy (NGN)
          <input
            name="hardcoverPriceNgn"
            type="number"
            min={100}
            step="1"
            defaultValue={data.settings.hardcoverPriceKobo / 100}
            required
          />
        </label>
        <label>
          Owner-confirmed printed stock inventory (leave blank if unconfigured)
          <input
            name="printedBookStockCount"
            type="number"
            min={0}
            max={1000000}
            defaultValue={data.settings.printedBookStockCount ?? ""}
            placeholder="Unconfigured — enter confirmed stock count"
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Printed Book availability
          <select
            name="hardcoverAvailability"
            defaultValue={data.settings.hardcoverAvailability}
          >
            <option value="available">Available</option>
            <option value="preorder">Pre-order</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </label>
        <label>
          Delivery fee policy mode
          <select
            name="deliveryPricingMode"
            defaultValue={
              data.settings.deliveryPricingMode || "quotation_required"
            }
          >
            <option value="quotation_required">
              Quotation required per address (Default)
            </option>
            <option value="fixed_fee">Fixed delivery fee</option>
          </select>
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Default fixed delivery fee in NGN (optional)
          <input
            name="defaultDeliveryFeeNgn"
            type="number"
            min={0}
            step="1"
            defaultValue={
              data.settings.defaultDeliveryFeeKobo !== null &&
              data.settings.defaultDeliveryFeeKobo !== undefined
                ? data.settings.defaultDeliveryFeeKobo / 100
                : ""
            }
            placeholder="Blank when quoted per address"
          />
        </label>
        <label>
          Delivery policy note
          <input
            name="deliveryPolicyNote"
            defaultValue={
              data.settings.deliveryPolicyNote ||
              "Delivery fees are calculated based on your city and state and confirmed before payment."
            }
            required
          />
        </label>
      </div>
      <label>
        Printed Book product note
        <input
          name="hardcoverNote"
          defaultValue={data.settings.hardcoverNote}
          required
        />
      </label>

      <h2>Contact Details</h2>
      <div className="form-row-2">
        <label>
          Contact email
          <input
            name="contactEmail"
            type="email"
            defaultValue={data.settings.contactEmail}
            required
          />
        </label>
        <label>
          Website
          <input
            name="contactWebsite"
            defaultValue={data.settings.contactWebsite}
            required
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Primary phone / WhatsApp
          <input
            name="contactPhone"
            defaultValue={data.settings.contactPhone}
            required
          />
        </label>
        <label>
          Secondary phone
          <input
            name="contactSecondaryPhone"
            defaultValue={data.settings.contactSecondaryPhone}
          />
        </label>
      </div>
      <div className="form-row-2">
        <label>
          Contact address / city
          <input
            name="contactAddress"
            defaultValue={data.settings.contactAddress}
            required
          />
        </label>
        <label>
          Bulk order note
          <input
            name="bulkDiscountNote"
            defaultValue={data.settings.bulkDiscountNote}
            required
          />
        </label>
      </div>

      <h2>
        <Landmark
          size={20}
          style={{ display: "inline", marginRight: "8px" }}
        />
        Bank-Transfer Payment Accounts (Access Bank)
      </h2>
      <label className="check-label">
        <input
          type="checkbox"
          name="bankTransferEnabled"
          defaultChecked={data.settings.bankTransferEnabled}
        />
        <span>
          Enable public Bank-Transfer checkout &amp; display Access Bank
          account numbers on purchase pages
        </span>
      </label>
      <label>
        Bank transfer instructions
        <input
          name="bankTransferInstructions"
          defaultValue={
            data.settings.bankTransferInstructions ||
            "Transfer the exact total to the official Access Bank account and submit your transfer reference for administrator verification."
          }
        />
      </label>

      <div className="admin-plans">
        {currentBankAccounts.map((acc, idx) => (
          <div className="panel stack" key={acc.currency}>
            <strong>
              {acc.label} ({acc.currency})
            </strong>
            <label>
              Bank name
              <input
                value={acc.bankName}
                onChange={(e) => {
                  const next = [...currentBankAccounts];
                  next[idx] = { ...next[idx], bankName: e.target.value };
                  setBankAccountsDraft(next);
                }}
              />
            </label>
            <label>
              Account name
              <input
                value={acc.accountName}
                onChange={(e) => {
                  const next = [...currentBankAccounts];
                  next[idx] = { ...next[idx], accountName: e.target.value };
                  setBankAccountsDraft(next);
                }}
              />
            </label>
            <label>
              Account number
              <input
                value={acc.accountNumber}
                onChange={(e) => {
                  const next = [...currentBankAccounts];
                  next[idx] = { ...next[idx], accountNumber: e.target.value };
                  setBankAccountsDraft(next);
                }}
              />
            </label>
          </div>
        ))}
      </div>

      <h2>Access &amp; Account Configuration</h2>
      <label>
        Expiry reminder window (days before 12-month access expiration)
        <input
          name="renewalReminderDays"
          type="number"
          min={1}
          max={60}
          defaultValue={data.settings.renewalReminderDays}
          required
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="allowRegistration"
          defaultChecked={data.settings.allowRegistration}
        />
        Allow public reader registration
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="enableAutoRenewal"
          defaultChecked={data.settings.enableAutoRenewal}
        />
        Allow automatic renewal preference selection
      </label>

      <div>
        <button className="button" disabled={busy}>
          <Settings size={16} /> Save all settings
        </button>
      </div>
    </form>
  );
}

