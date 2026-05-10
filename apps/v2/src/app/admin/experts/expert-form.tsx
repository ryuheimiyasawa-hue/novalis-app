"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/i18n/prefectures";
import type { ExpertFull } from "./types";

interface Props {
  mode: "create" | "edit";
  initial?: ExpertFull;
}

interface FormState {
  name: string;
  title: string;
  specialty_ja: string;
  specialty_en: string;
  specialty_tl: string;
  bio_ja: string;
  bio_en: string;
  bio_tl: string;
  prefecture_code: string;
  city_name: string;
  avatar_url: string;
  calendar_url: string;
  is_active: boolean;
}

const NULL_PREFECTURE = "__none__";

function emptyForm(): FormState {
  return {
    name: "",
    title: "",
    specialty_ja: "",
    specialty_en: "",
    specialty_tl: "",
    bio_ja: "",
    bio_en: "",
    bio_tl: "",
    prefecture_code: NULL_PREFECTURE,
    city_name: "",
    avatar_url: "",
    calendar_url: "",
    is_active: true,
  };
}

function fromInitial(e: ExpertFull): FormState {
  return {
    name: e.name,
    title: e.title,
    specialty_ja: e.specialty_ja ?? "",
    specialty_en: e.specialty_en ?? "",
    specialty_tl: e.specialty_tl ?? "",
    bio_ja: e.bio_ja ?? "",
    bio_en: e.bio_en ?? "",
    bio_tl: e.bio_tl ?? "",
    prefecture_code: e.prefecture_code ?? NULL_PREFECTURE,
    city_name: e.city_name ?? "",
    avatar_url: e.avatar_url ?? "",
    calendar_url: e.calendar_url ?? "",
    is_active: e.is_active,
  };
}

function buildPayload(form: FormState) {
  return {
    name: form.name.trim(),
    title: form.title.trim(),
    specialty_ja: form.specialty_ja.trim() || null,
    specialty_en: form.specialty_en.trim() || null,
    specialty_tl: form.specialty_tl.trim() || null,
    bio_ja: form.bio_ja.trim() ? form.bio_ja : null,
    bio_en: form.bio_en.trim() ? form.bio_en : null,
    bio_tl: form.bio_tl.trim() ? form.bio_tl : null,
    prefecture_code:
      form.prefecture_code === NULL_PREFECTURE ? null : form.prefecture_code,
    city_name: form.city_name.trim() || null,
    avatar_url: form.avatar_url.trim() || null,
    calendar_url: form.calendar_url.trim() || null,
    is_active: form.is_active,
  };
}

export function ExpertForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(
    initial ? fromInitial(initial) : emptyForm(),
  );
  const [pending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const payload = buildPayload(form);
    const url =
      mode === "edit" && initial
        ? `/api/admin/experts/${initial.id}`
        : `/api/admin/experts`;
    const method = mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      const msg =
        json?.error?.message ??
        (json?.error?.code === "INVALID_INPUT"
          ? "入力内容を確認してください（URL は https:// 必須）"
          : "保存に失敗しました");
      toast.error(msg);
      return;
    }

    toast.success(mode === "edit" ? "更新しました" : "作成しました");
    if (mode === "create" && json.data?.id) {
      router.push(`/admin/experts/${json.data.id}/edit`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="name">氏名 *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="山田 太郎"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="title">肩書 *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="弁護士 / 行政書士 / 社労士"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="is_active">状態</Label>
          <div className="flex items-center h-9">
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) => update("is_active", v)}
            />
            <span className="ml-2 text-sm text-muted-foreground">
              {form.is_active ? "有効" : "無効"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="prefecture_code">所在 都道府県（任意）</Label>
          <Select
            value={form.prefecture_code}
            onValueChange={(v) => update("prefecture_code", v)}
          >
            <SelectTrigger id="prefecture_code">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_PREFECTURE}>未設定</SelectItem>
              {PREFECTURES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.ja}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="city_name">市区町村（任意）</Label>
          <Input
            id="city_name"
            value={form.city_name}
            onChange={(e) => update("city_name", e.target.value)}
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="calendar_url">予約 URL（https:// 必須・任意）</Label>
          <Input
            id="calendar_url"
            value={form.calendar_url}
            onChange={(e) => update("calendar_url", e.target.value)}
            placeholder="https://calendly.com/..."
          />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-1.5">
          <Label htmlFor="avatar_url">プロフィール画像 URL（https:// 必須・任意）</Label>
          <Input
            id="avatar_url"
            value={form.avatar_url}
            onChange={(e) => update("avatar_url", e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">専門領域（3言語）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="specialty_ja">日本語</Label>
            <Textarea
              id="specialty_ja"
              rows={3}
              value={form.specialty_ja}
              onChange={(e) => update("specialty_ja", e.target.value)}
              placeholder="在留資格、家族滞在、永住申請"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialty_en">English</Label>
            <Textarea
              id="specialty_en"
              rows={3}
              value={form.specialty_en}
              onChange={(e) => update("specialty_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialty_tl">Tagalog</Label>
            <Textarea
              id="specialty_tl"
              rows={3}
              value={form.specialty_tl}
              onChange={(e) => update("specialty_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">経歴・紹介文（3言語、任意）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bio_ja">日本語</Label>
            <Textarea
              id="bio_ja"
              rows={10}
              value={form.bio_ja}
              onChange={(e) => update("bio_ja", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio_en">English</Label>
            <Textarea
              id="bio_en"
              rows={10}
              value={form.bio_en}
              onChange={(e) => update("bio_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio_tl">Tagalog</Label>
            <Textarea
              id="bio_tl"
              rows={10}
              value={form.bio_tl}
              onChange={(e) => update("bio_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/admin/experts")}>
          一覧へ戻る
        </Button>
        <Button onClick={submit} disabled={pending}>
          {mode === "edit" ? "更新" : "作成"}
        </Button>
      </div>
    </div>
  );
}
