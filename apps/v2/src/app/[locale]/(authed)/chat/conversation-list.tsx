"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface SidebarConversation {
  id: string;
  displayTitle: string;
  relativeDate: string;
}

interface Labels {
  searchPlaceholder: string;
  searchNoResults: string;
  empty: string;
  actionsLabel: string;
  rename: string;
  renameSave: string;
  renameCancel: string;
  delete: string;
  deleteConfirm: string;
  renameFailed: string;
  deleteFailed: string;
}

interface Props {
  locale: "ja" | "en" | "tl";
  initialRows: SidebarConversation[];
  labels: Labels;
}

// Client-side sidebar list: search filter + per-row rename / delete.
// Seeded from the server-rendered rows (no fetch on mount). Mutations
// hit /api/chat/conversations/[id] and update local state optimistically
// enough to feel instant; a failed call rolls the row back and toasts.
export function ConversationList({ locale, initialRows, labels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("conversation_id");

  const [rows, setRows] = useState<SidebarConversation[]>(initialRows);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = query.trim()
    ? rows.filter((r) =>
        r.displayTitle.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : rows;

  async function handleDelete(id: string) {
    if (!window.confirm(labels.deleteConfirm)) return;
    setBusyId(id);
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      if (id === activeId) router.push(`/${locale}/chat`);
    } catch {
      setRows(prev);
      toast.error(labels.deleteFailed);
    } finally {
      setBusyId(null);
    }
  }

  function startRename(row: SidebarConversation) {
    setEditingId(row.id);
    setEditValue(row.displayTitle);
  }

  async function commitRename(id: string) {
    const title = editValue.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    setBusyId(id);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, displayTitle: title } : r)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setRows(prev);
      toast.error(labels.renameFailed);
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="px-2 py-4 text-xs text-muted-foreground">{labels.empty}</p>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.searchPlaceholder}
        className="h-8 text-xs"
        aria-label={labels.searchPlaceholder}
      />
      {filtered.length === 0 ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">
          {labels.searchNoResults}
        </p>
      ) : (
        <ul className="space-y-1">
          {filtered.map((row) => {
            const isActive = row.id === activeId;
            const isEditing = row.id === editingId;
            return (
              <li key={row.id} className="group relative">
                {isEditing ? (
                  <div className="flex items-center gap-1 px-1 py-1">
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(row.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-7 text-xs"
                      aria-label={labels.rename}
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(row.id)}
                      className="shrink-0 rounded px-1.5 py-1 text-[10px] hover:bg-accent/40"
                    >
                      {labels.renameSave}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="shrink-0 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent/40"
                    >
                      {labels.renameCancel}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex items-start rounded-md transition-colors ${
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Link
                      href={`/${locale}/chat?conversation_id=${row.id}`}
                      className="block min-w-0 flex-1 px-2 py-2 text-xs leading-tight"
                      aria-current={isActive ? "page" : undefined}
                    >
                      <div className="line-clamp-2 font-medium">
                        {row.displayTitle}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {row.relativeDate}
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={busyId === row.id}
                        aria-label={labels.actionsLabel}
                        className="mr-1 mt-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent/60 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <MoreHorizontalIcon className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => startRename(row)}>
                          <PencilIcon className="size-4" aria-hidden />
                          {labels.rename}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => handleDelete(row.id)}
                        >
                          <Trash2Icon className="size-4" aria-hidden />
                          {labels.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
