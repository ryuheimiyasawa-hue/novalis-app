"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
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
      <div className="mx-1 flex flex-col items-center gap-2 rounded-lg border border-dashed border-input px-4 py-6 text-center">
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary"
        >
          <MessagesSquareIcon className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-11 pl-9 text-sm lg:h-9"
          aria-label={labels.searchPlaceholder}
        />
      </div>
      {filtered.length === 0 ? (
        <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
          {labels.searchNoResults}
        </p>
      ) : (
        <ul className="space-y-0.5">
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
                      className="h-11 text-sm lg:h-9"
                      aria-label={labels.rename}
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(row.id)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover lg:min-h-9"
                    >
                      {labels.renameSave}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent lg:min-h-9"
                    >
                      {labels.renameCancel}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`relative flex items-start rounded-md transition-colors ${
                      isActive
                        ? "bg-primary-soft text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <Link
                      href={`/${locale}/chat?conversation_id=${row.id}`}
                      className="block min-h-11 min-w-0 flex-1 rounded-md px-3 py-2 text-sm leading-snug"
                      aria-current={isActive ? "page" : undefined}
                    >
                      <div className={`line-clamp-2 ${isActive ? "font-bold" : "font-medium"}`}>
                        {row.displayTitle}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.relativeDate}
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={busyId === row.id}
                        aria-label={labels.actionsLabel}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground reveal-on-hover disabled:opacity-40 lg:mt-1 lg:mr-1 lg:size-8"
                      >
                        <MoreHorizontalIcon className="size-4" strokeWidth={1.75} aria-hidden />
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
