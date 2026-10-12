"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useChatConversationActions } from "./conversation-actions";

export function NewConversationLink({ locale, className, children }: {
  locale: "ja" | "en" | "tl";
  className?: string;
  children: ReactNode;
}) {
  const actions = useChatConversationActions();
  return (
    <Link
      href={`/${locale}/chat`}
      className={className}
      onNavigate={(event) => {
        // Link navigation to the current URL retains client state. Clear the
        // mounted shell explicitly, including its pending request. Modified
        // clicks still use Link's normal new-tab behavior (no onNavigate).
        if (actions?.reset()) event.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}
