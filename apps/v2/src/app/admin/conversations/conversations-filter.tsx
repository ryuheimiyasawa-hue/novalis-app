"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  currentChannel: string | null;
  currentMode: string | null;
}

const ALL = "__all__";

export function ConversationsFilter({ currentChannel, currentMode }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(next: { channel?: string | null; mode?: string | null }) {
    const url = new URLSearchParams(sp);
    if ("channel" in next) {
      if (next.channel) url.set("channel", next.channel);
      else url.delete("channel");
    }
    if ("mode" in next) {
      if (next.mode) url.set("mode", next.mode);
      else url.delete("mode");
    }
    router.push(`/admin/conversations${url.size ? `?${url.toString()}` : ""}`);
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">チャネル</label>
        <Select
          value={currentChannel ?? ALL}
          onValueChange={(v) => navigate({ channel: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="messenger">Messenger</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">状態</label>
        <Select
          value={currentMode ?? ALL}
          onValueChange={(v) => navigate({ mode: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            <SelectItem value="auto">AI自動</SelectItem>
            <SelectItem value="operator">運営対応</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
