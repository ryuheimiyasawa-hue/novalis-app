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
import type { RestaurantFull } from "./types";

interface Props {
  mode: "create" | "edit";
  initial?: RestaurantFull;
}

interface FormState {
  name: string;
  prefecture_code: string;
  city_name: string;
  address: string;
  cuisine_type: string;
  hours: string;
  photo_url: string;
  description_ja: string;
  description_en: string;
  description_tl: string;
  is_active: boolean;
}

// Restaurants require a prefecture (unlike experts). This sentinel marks the
// "not yet chosen" state so the submit guard can catch it before the API does.
const NULL_PREFECTURE = "__none__";

function emptyForm(): FormState {
  return {
    name: "",
    prefecture_code: NULL_PREFECTURE,
    city_name: "",
    address: "",
    cuisine_type: "",
    hours: "",
    photo_url: "",
    description_ja: "",
    description_en: "",
    description_tl: "",
    is_active: true,
  };
}

function fromInitial(r: RestaurantFull): FormState {
  return {
    name: r.name,
    prefecture_code: r.prefecture_code || NULL_PREFECTURE,
    city_name: r.city_name,
    address: r.address ?? "",
    cuisine_type: r.cuisine_type ?? "",
    hours: r.hours ?? "",
    photo_url: r.photo_url ?? "",
    description_ja: r.description_ja ?? "",
    description_en: r.description_en ?? "",
    description_tl: r.description_tl ?? "",
    is_active: r.is_active,
  };
}

function buildPayload(form: FormState) {
  return {
    name: form.name.trim(),
    prefecture_code:
      form.prefecture_code === NULL_PREFECTURE ? null : form.prefecture_code,
    city_name: form.city_name.trim(),
    address: form.address.trim() || null,
    cuisine_type: form.cuisine_type.trim() || null,
    hours: form.hours.trim() || null,
    photo_url: form.photo_url.trim() || null,
    description_ja: form.description_ja.trim() ? form.description_ja : null,
    description_en: form.description_en.trim() ? form.description_en : null,
    description_tl: form.description_tl.trim() ? form.description_tl : null,
    is_active: form.is_active,
  };
}

export function RestaurantForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(
    initial ? fromInitial(initial) : emptyForm(),
  );
  const [pending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    // Client-side guard for the three required fields so staff get a clear
    // message instead of a generic INVALID_INPUT from the API.
    if (!form.name.trim()) {
      toast.error("店名を入力してください");
      return;
    }
    if (form.prefecture_code === NULL_PREFECTURE) {
      toast.error("都道府県を選択してください");
      return;
    }
    if (!form.city_name.trim()) {
      toast.error("市区町村を入力してください");
      return;
    }

    const payload = buildPayload(form);
    const url =
      mode === "edit" && initial
        ? `/api/admin/restaurants/${initial.id}`
        : `/api/admin/restaurants`;
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
          ? "入力内容を確認してください（写真 URL は https:// 必須）"
          : "保存に失敗しました");
      toast.error(msg);
      return;
    }

    toast.success(mode === "edit" ? "更新しました" : "作成しました");
    if (mode === "create" && json.data?.id) {
      router.push(`/admin/restaurants/${json.data.id}/edit`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-6 space-y-1.5">
          <Label htmlFor="name">店名 *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="マニラ食堂"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="cuisine_type">ジャンル（任意）</Label>
          <Input
            id="cuisine_type"
            value={form.cuisine_type}
            onChange={(e) => update("cuisine_type", e.target.value)}
            placeholder="フィリピン料理 / 食材店"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="is_active">掲載状態</Label>
          <div className="flex items-center h-9">
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) => update("is_active", v)}
            />
            <span className="ml-2 text-sm text-muted-foreground">
              {form.is_active ? "掲載中" : "非掲載"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="prefecture_code">都道府県 *</Label>
          <Select
            value={form.prefecture_code}
            onValueChange={(v) => update("prefecture_code", v)}
          >
            <SelectTrigger id="prefecture_code">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_PREFECTURE}>選択してください</SelectItem>
              {PREFECTURES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.ja}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="city_name">市区町村 *</Label>
          <Input
            id="city_name"
            value={form.city_name}
            onChange={(e) => update("city_name", e.target.value)}
            placeholder="例: 港区"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="hours">営業時間（任意）</Label>
          <Input
            id="hours"
            value={form.hours}
            onChange={(e) => update("hours", e.target.value)}
            placeholder="11:00-22:00 / 火曜定休"
          />
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-8 space-y-1.5">
          <Label htmlFor="address">住所（任意）</Label>
          <Input
            id="address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="東京都港区六本木1-2-3"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="photo_url">写真 URL（https:// 必須・任意）</Label>
          <Input
            id="photo_url"
            value={form.photo_url}
            onChange={(e) => update("photo_url", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">紹介文（3言語、任意）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="description_ja">日本語</Label>
            <Textarea
              id="description_ja"
              rows={8}
              value={form.description_ja}
              onChange={(e) => update("description_ja", e.target.value)}
              placeholder="本場フィリピン料理を提供。ハロハロやシシグが人気。"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description_en">English</Label>
            <Textarea
              id="description_en"
              rows={8}
              value={form.description_en}
              onChange={(e) => update("description_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description_tl">Tagalog</Label>
            <Textarea
              id="description_tl"
              rows={8}
              value={form.description_tl}
              onChange={(e) => update("description_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/admin/restaurants")}>
          一覧へ戻る
        </Button>
        <Button onClick={submit} disabled={pending}>
          {mode === "edit" ? "更新" : "作成"}
        </Button>
      </div>
    </div>
  );
}
