"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CategoryRow } from "./types";

interface Props {
  initial: CategoryRow[];
  canMutate: boolean;
}

interface FormState {
  slug: string;
  name_ja: string;
  name_en: string;
  name_tl: string;
  icon: string;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  slug: "",
  name_ja: "",
  name_en: "",
  name_tl: "",
  icon: "",
  sort_order: "0",
};

function rowToForm(row: CategoryRow): FormState {
  return {
    slug: row.slug,
    name_ja: row.name_ja,
    name_en: row.name_en,
    name_tl: row.name_tl,
    icon: row.icon ?? "",
    sort_order: String(row.sort_order),
  };
}

function buildPayload(form: FormState) {
  return {
    slug: form.slug.trim(),
    name_ja: form.name_ja.trim(),
    name_en: form.name_en.trim(),
    name_tl: form.name_tl.trim(),
    icon: form.icon.trim() || null,
    sort_order: Number(form.sort_order) || 0,
  };
}

export function CategoriesClient({ initial, canMutate }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  }
  function openEdit(row: CategoryRow) {
    setForm(rowToForm(row));
    setEditing(row);
    setCreating(false);
  }
  function closeDialog() {
    setCreating(false);
    setEditing(null);
  }

  async function submit() {
    const payload = buildPayload(form);
    const isEdit = editing !== null;
    const url = isEdit
      ? `/api/admin/categories/${editing.id}`
      : `/api/admin/categories`;
    const method = isEdit ? "PATCH" : "POST";

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

    toast.success(isEdit ? "更新しました" : "作成しました");
    closeDialog();
    startTransition(() => router.refresh());
  }

  async function remove(row: CategoryRow) {
    if (
      !window.confirm(
        `カテゴリ「${row.name_ja}」を削除します。よろしいですか？`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/categories/${row.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      toast.error(json?.error?.message ?? "削除に失敗しました");
      return;
    }
    toast.success("削除しました");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {canMutate && (
        <div className="flex justify-end">
          <Dialog
            open={creating || editing !== null}
            onOpenChange={(open) => (open ? null : closeDialog())}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>新規追加</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "カテゴリを編集" : "新規カテゴリ"}
                </DialogTitle>
                <DialogDescription>
                  slug は URL に使われます（半角英数とハイフン）。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slug">slug</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, slug: e.target.value }))
                    }
                    placeholder="visa"
                    disabled={editing?.is_system ?? false}
                  />
                  {editing?.is_system && (
                    <p className="text-xs text-muted-foreground">
                      システムカテゴリの slug は AI ルーティングと連動しているため変更できません。
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name_ja">名前 (日)</Label>
                    <Input
                      id="name_ja"
                      value={form.name_ja}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name_ja: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name_en">名前 (英)</Label>
                    <Input
                      id="name_en"
                      value={form.name_en}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name_en: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name_tl">名前 (Tagalog)</Label>
                    <Input
                      id="name_tl"
                      value={form.name_tl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name_tl: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="icon">アイコン名 (任意)</Label>
                    <Input
                      id="icon"
                      value={form.icon}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, icon: e.target.value }))
                      }
                      placeholder="passport"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sort_order">並び順</Label>
                    <Input
                      id="sort_order"
                      type="number"
                      value={form.sort_order}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sort_order: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog}>
                  キャンセル
                </Button>
                <Button onClick={submit} disabled={pending}>
                  {editing ? "更新" : "作成"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">順</TableHead>
              <TableHead>slug</TableHead>
              <TableHead>名前 (日)</TableHead>
              <TableHead>名前 (英)</TableHead>
              <TableHead>名前 (Tl)</TableHead>
              <TableHead className="w-32">アイコン</TableHead>
              <TableHead className="w-24">区分</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  カテゴリがありません
                </TableCell>
              </TableRow>
            )}
            {initial.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.sort_order}</TableCell>
                <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                <TableCell>{row.name_ja}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.name_en}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.name_tl}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {row.icon ?? "-"}
                </TableCell>
                <TableCell>
                  {row.is_system ? (
                    <Badge variant="secondary">システム</Badge>
                  ) : (
                    <Badge variant="outline">追加</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {canMutate ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(row)}
                      >
                        編集
                      </Button>
                      {!row.is_system && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(row)}
                        >
                          削除
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      編集不可
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
