"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Locale = "ja" | "en" | "tl";
type Status = "idle" | "sending" | "done" | "duplicate" | "error" | "rate";

const FIELD_KEYS = [
  "name",
  "prefecture_code",
  "city_name",
  "address",
  "hours",
  "phone",
  "website_url",
  "description",
  "contact_name",
  "contact_email",
  "consent",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

export function RestaurantApplyForm({
  locale,
  prefectures,
  sourceCode,
}: {
  locale: Locale;
  prefectures: { code: string; label: string }[];
  sourceCode: string;
}) {
  const t = useTranslations("restaurantApply");
  const [status, setStatus] = useState<Status>("idle");
  const [badField, setBadField] = useState<FieldKey | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    setStatus("sending");
    setBadField(null);
    try {
      const res = await fetch("/api/restaurant-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: get("name"),
          prefecture_code: get("prefecture_code"),
          city_name: get("city_name"),
          address: get("address"),
          hours: get("hours"),
          phone: get("phone"),
          website_url: get("website_url"),
          description: get("description"),
          description_lang: get("description_lang") || locale,
          contact_name: get("contact_name"),
          contact_email: get("contact_email"),
          consent: fd.get("consent") === "on",
          source_code: sourceCode,
          company_website: get("company_website"),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; data: { status: string } }
        | { ok: false; error: { code: string; message?: string } }
        | null;
      if (body?.ok) {
        setStatus(body.data.status === "already_received" ? "duplicate" : "done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.status === 429) return setStatus("rate");
      const field = body && !body.ok ? body.error.message : undefined;
      if (res.status === 400 && field && (FIELD_KEYS as readonly string[]).includes(field)) {
        setBadField(field as FieldKey);
        setStatus("idle");
        document.getElementById(`ra-${field}`)?.focus();
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done" || status === "duplicate") {
    return (
      <div role="status" className="space-y-2 rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="text-xl font-bold">{t("doneTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {status === "duplicate" ? t("duplicateBody") : t("doneBody")}
        </p>
      </div>
    );
  }

  const err = (k: FieldKey) =>
    badField === k ? (
      <p className="text-sm text-destructive">{t(`error.${k}`)}</p>
    ) : null;
  const req = <span className="ml-1 text-destructive">*</span>;
  const fieldClass = "space-y-2";
  const selectClass =
    "h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold">{t("sectionShop")}</h2>

      <div className={fieldClass}>
        <Label htmlFor="ra-name">{t("name")}{req}</Label>
        <Input id="ra-name" name="name" required maxLength={100} aria-invalid={badField === "name"} />
        {err("name")}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className={fieldClass}>
          <Label htmlFor="ra-prefecture_code">{t("prefecture")}{req}</Label>
          <select id="ra-prefecture_code" name="prefecture_code" required defaultValue="" className={selectClass} aria-invalid={badField === "prefecture_code"}>
            <option value="" disabled>{t("prefecturePlaceholder")}</option>
            {prefectures.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
          {err("prefecture_code")}
        </div>
        <div className={fieldClass}>
          <Label htmlFor="ra-city_name">{t("city")}{req}</Label>
          <Input id="ra-city_name" name="city_name" required maxLength={100} placeholder={t("cityPlaceholder")} aria-invalid={badField === "city_name"} />
          {err("city_name")}
        </div>
      </div>

      <div className={fieldClass}>
        <Label htmlFor="ra-address">{t("address")}</Label>
        <Input id="ra-address" name="address" maxLength={200} aria-invalid={badField === "address"} />
        {err("address")}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className={fieldClass}>
          <Label htmlFor="ra-hours">{t("hours")}</Label>
          <Input id="ra-hours" name="hours" maxLength={200} placeholder={t("hoursPlaceholder")} aria-invalid={badField === "hours"} />
          {err("hours")}
        </div>
        <div className={fieldClass}>
          <Label htmlFor="ra-phone">{t("phone")}</Label>
          <Input id="ra-phone" name="phone" type="tel" maxLength={30} placeholder="03-1234-5678" aria-invalid={badField === "phone"} />
          {err("phone")}
        </div>
      </div>

      <div className={fieldClass}>
        <Label htmlFor="ra-website_url">{t("website")}</Label>
        <Input id="ra-website_url" name="website_url" type="url" maxLength={500} placeholder="https://www.facebook.com/..." aria-invalid={badField === "website_url"} />
        <p className="text-xs text-muted-foreground">{t("websiteHelp")}</p>
        {err("website_url")}
      </div>

      <div className={fieldClass}>
        <Label htmlFor="ra-description">{t("description")}</Label>
        <Textarea id="ra-description" name="description" maxLength={1000} rows={4} placeholder={t("descriptionPlaceholder")} aria-invalid={badField === "description"} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t("descriptionLang")}</span>
          {(["ja", "tl", "en"] as const).map((l) => (
            <label key={l} className="inline-flex items-center gap-1.5">
              <input type="radio" name="description_lang" value={l} defaultChecked={l === locale} />
              {t(`lang.${l}`)}
            </label>
          ))}
        </div>
        {err("description")}
      </div>

      <h2 className="pt-2 text-lg font-bold">{t("sectionContact")}</h2>
      <p className="-mt-4 text-xs text-muted-foreground">{t("contactHelp")}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className={fieldClass}>
          <Label htmlFor="ra-contact_name">{t("contactName")}{req}</Label>
          <Input id="ra-contact_name" name="contact_name" required maxLength={100} aria-invalid={badField === "contact_name"} />
          {err("contact_name")}
        </div>
        <div className={fieldClass}>
          <Label htmlFor="ra-contact_email">{t("contactEmail")}{req}</Label>
          <Input id="ra-contact_email" name="contact_email" type="email" required maxLength={254} aria-invalid={badField === "contact_email"} />
          {err("contact_email")}
        </div>
      </div>

      {/* Honeypot: hidden from people and from assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company website
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input id="ra-consent" type="checkbox" name="consent" required className="mt-1" aria-invalid={badField === "consent"} />
          <span>{t("consent")}{req}</span>
        </label>
        {err("consent")}
      </div>

      {status === "error" && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
      {status === "rate" && <p role="alert" className="text-sm text-destructive">{t("errorRate")}</p>}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={status === "sending"}>
        {status === "sending" ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
