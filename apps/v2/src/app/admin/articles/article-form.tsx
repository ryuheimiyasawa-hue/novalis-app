"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/i18n/prefectures";
import type { ArticleFull, ArticleStatus, CategoryOption } from "./types";

interface Props {
  mode: "create" | "edit";
  categories: CategoryOption[];
  initial?: ArticleFull;
}

interface FormState {
  slug: string;
  category_id: string;
  status: ArticleStatus;
  title_ja: string;
  title_en: string;
  title_tl: string;
  body_ja: string;
  body_en: string;
  body_tl: string;
  prefecture_code: string;
  city_name: string;
  // MVP-D: optional single video embed (provider + URL).
  video_provider: "" | "youtube" | "vimeo";
  video_url: string;
}

const NULL_PREFECTURE = "__none__";
const NULL_CATEGORY = "__none__";

function emptyForm(): FormState {
  return {
    slug: "",
    category_id: NULL_CATEGORY,
    status: "draft",
    title_ja: "",
    title_en: "",
    title_tl: "",
    body_ja: "",
    body_en: "",
    body_tl: "",
    prefecture_code: NULL_PREFECTURE,
    city_name: "",
    video_provider: "",
    video_url: "",
  };
}

function fromInitial(a: ArticleFull): FormState {
  return {
    slug: a.slug,
    category_id: a.category_id ?? NULL_CATEGORY,
    status: a.status,
    title_ja: a.title_ja,
    title_en: a.title_en ?? "",
    title_tl: a.title_tl ?? "",
    body_ja: a.body_ja,
    body_en: a.body_en ?? "",
    body_tl: a.body_tl ?? "",
    prefecture_code: a.prefecture_code ?? NULL_PREFECTURE,
    city_name: a.city_name ?? "",
    video_provider: a.video_provider ?? "",
    video_url: a.video_url ?? "",
  };
}

function buildPayload(form: FormState) {
  const videoUrlTrimmed = form.video_url.trim();
  return {
    slug: form.slug.trim(),
    category_id: form.category_id === NULL_CATEGORY ? null : form.category_id,
    status: form.status,
    title_ja: form.title_ja.trim(),
    title_en: form.title_en.trim() || null,
    title_tl: form.title_tl.trim() || null,
    body_ja: form.body_ja,
    body_en: form.body_en.trim() ? form.body_en : null,
    body_tl: form.body_tl.trim() ? form.body_tl : null,
    prefecture_code:
      form.prefecture_code === NULL_PREFECTURE ? null : form.prefecture_code,
    city_name: form.city_name.trim() || null,
    // Video pair is all-or-nothing: send both as null when either is
    // empty, so the API never has to handle "URL without provider".
    video_url:
      videoUrlTrimmed && form.video_provider ? videoUrlTrimmed : null,
    video_provider:
      videoUrlTrimmed && form.video_provider ? form.video_provider : null,
  };
}

export function ArticleForm({ mode, categories, initial }: Props) {
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
        ? `/api/admin/articles/${initial.id}`
        : `/api/admin/articles`;
    const method = mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      const code = json?.error?.code ?? "INTERNAL_ERROR";
      const msg =
        json?.error?.message ??
        (code === "CONFLICT"
          ? "slug が重複しています"
          : code === "INVALID_INPUT"
            ? "入力内容を確認してください"
            : "保存に失敗しました");
      toast.error(msg);
      return;
    }

    toast.success(mode === "edit" ? "更新しました" : "作成しました");
    if (mode === "create" && json.data?.id) {
      router.push(`/admin/articles/${json.data.id}/edit`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="slug">slug</Label>
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            placeholder="visa-update-2026"
            className="font-mono"
          />
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="category_id">カテゴリ</Label>
          <Select
            value={form.category_id}
            onValueChange={(v) => update("category_id", v)}
          >
            <SelectTrigger id="category_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_CATEGORY}>未設定</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name_ja}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="status">状態</Label>
          <Select
            value={form.status}
            onValueChange={(v) => update("status", v as ArticleStatus)}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">下書き</SelectItem>
              <SelectItem value="published">公開</SelectItem>
              <SelectItem value="archived">アーカイブ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">タイトル（3言語）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="title_ja">日本語 *</Label>
            <Input
              id="title_ja"
              value={form.title_ja}
              onChange={(e) => update("title_ja", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title_en">English</Label>
            <Input
              id="title_en"
              value={form.title_en}
              onChange={(e) => update("title_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title_tl">Tagalog</Label>
            <Input
              id="title_tl"
              value={form.title_tl}
              onChange={(e) => update("title_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">本文（Markdown / 3言語）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="body_ja">日本語 *</Label>
            <Textarea
              id="body_ja"
              value={form.body_ja}
              onChange={(e) => update("body_ja", e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body_en">English</Label>
            <Textarea
              id="body_en"
              value={form.body_en}
              onChange={(e) => update("body_en", e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body_tl">Tagalog</Label>
            <Textarea
              id="body_tl"
              value={form.body_tl}
              onChange={(e) => update("body_tl", e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor="prefecture_code">都道府県（任意）</Label>
          <Select
            value={form.prefecture_code}
            onValueChange={(v) => update("prefecture_code", v)}
          >
            <SelectTrigger id="prefecture_code">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_PREFECTURE}>全国</SelectItem>
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
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">動画埋め込み（任意）</h2>
        <p className="text-xs text-muted-foreground">
          YouTube / Vimeo のみ。記事冒頭に1本だけ表示されます。空欄で削除。
        </p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3 space-y-1.5">
            <Label htmlFor="video_provider">プロバイダ</Label>
            <Select
              value={form.video_provider || NULL_CATEGORY}
              onValueChange={(v) =>
                update(
                  "video_provider",
                  v === NULL_CATEGORY ? "" : (v as "youtube" | "vimeo"),
                )
              }
            >
              <SelectTrigger id="video_provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NULL_CATEGORY}>未設定</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="vimeo">Vimeo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-9 space-y-1.5">
            <Label htmlFor="video_url">URL</Label>
            <Input
              id="video_url"
              value={form.video_url}
              onChange={(e) => update("video_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="font-mono text-sm"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/admin/articles")}>
          一覧へ戻る
        </Button>
        <Button onClick={submit} disabled={pending}>
          {mode === "edit" ? "更新" : "作成"}
        </Button>
      </div>
    </div>
  );
}
