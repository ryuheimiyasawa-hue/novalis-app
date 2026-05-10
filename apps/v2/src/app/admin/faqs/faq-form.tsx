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
import type { CategoryOption, FaqFull } from "./types";

interface Props {
  mode: "create" | "edit";
  categories: CategoryOption[];
  initial?: FaqFull;
}

interface FormState {
  category_id: string;
  question_ja: string;
  question_en: string;
  question_tl: string;
  answer_ja: string;
  answer_en: string;
  answer_tl: string;
  prefecture_code: string;
  is_published: boolean;
  sort_order: string;
}

const NULL_PREFECTURE = "__none__";
const NULL_CATEGORY = "__none__";

function emptyForm(): FormState {
  return {
    category_id: NULL_CATEGORY,
    question_ja: "",
    question_en: "",
    question_tl: "",
    answer_ja: "",
    answer_en: "",
    answer_tl: "",
    prefecture_code: NULL_PREFECTURE,
    is_published: false,
    sort_order: "0",
  };
}

function fromInitial(f: FaqFull): FormState {
  return {
    category_id: f.category_id ?? NULL_CATEGORY,
    question_ja: f.question_ja,
    question_en: f.question_en ?? "",
    question_tl: f.question_tl ?? "",
    answer_ja: f.answer_ja,
    answer_en: f.answer_en ?? "",
    answer_tl: f.answer_tl ?? "",
    prefecture_code: f.prefecture_code ?? NULL_PREFECTURE,
    is_published: f.is_published,
    sort_order: String(f.sort_order),
  };
}

function buildPayload(form: FormState) {
  return {
    category_id: form.category_id === NULL_CATEGORY ? null : form.category_id,
    question_ja: form.question_ja.trim(),
    question_en: form.question_en.trim() || null,
    question_tl: form.question_tl.trim() || null,
    answer_ja: form.answer_ja,
    answer_en: form.answer_en.trim() ? form.answer_en : null,
    answer_tl: form.answer_tl.trim() ? form.answer_tl : null,
    prefecture_code:
      form.prefecture_code === NULL_PREFECTURE ? null : form.prefecture_code,
    is_published: form.is_published,
    sort_order: Number(form.sort_order) || 0,
  };
}

export function FaqForm({ mode, categories, initial }: Props) {
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
        ? `/api/admin/faqs/${initial.id}`
        : `/api/admin/faqs`;
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
        (code === "INVALID_INPUT"
          ? "入力内容を確認してください"
          : "保存に失敗しました");
      toast.error(msg);
      return;
    }

    toast.success(mode === "edit" ? "更新しました" : "作成しました");
    if (mode === "create" && json.data?.id) {
      router.push(`/admin/faqs/${json.data.id}/edit`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-12 gap-4">
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
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="sort_order">並び順</Label>
          <Input
            id="sort_order"
            type="number"
            value={form.sort_order}
            onChange={(e) => update("sort_order", e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="is_published">公開</Label>
          <div className="flex items-center h-9">
            <Switch
              id="is_published"
              checked={form.is_published}
              onCheckedChange={(v) => update("is_published", v)}
            />
            <span className="ml-2 text-sm text-muted-foreground">
              {form.is_published ? "公開中" : "非公開"}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">質問（3言語）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="question_ja">日本語 *</Label>
            <Textarea
              id="question_ja"
              rows={3}
              value={form.question_ja}
              onChange={(e) => update("question_ja", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question_en">English</Label>
            <Textarea
              id="question_en"
              rows={3}
              value={form.question_en}
              onChange={(e) => update("question_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question_tl">Tagalog</Label>
            <Textarea
              id="question_tl"
              rows={3}
              value={form.question_tl}
              onChange={(e) => update("question_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">回答（3言語、改行はそのまま表示）</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="answer_ja">日本語 *</Label>
            <Textarea
              id="answer_ja"
              rows={14}
              value={form.answer_ja}
              onChange={(e) => update("answer_ja", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="answer_en">English</Label>
            <Textarea
              id="answer_en"
              rows={14}
              value={form.answer_en}
              onChange={(e) => update("answer_en", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="answer_tl">Tagalog</Label>
            <Textarea
              id="answer_tl"
              rows={14}
              value={form.answer_tl}
              onChange={(e) => update("answer_tl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/admin/faqs")}>
          一覧へ戻る
        </Button>
        <Button onClick={submit} disabled={pending}>
          {mode === "edit" ? "更新" : "作成"}
        </Button>
      </div>
    </div>
  );
}
