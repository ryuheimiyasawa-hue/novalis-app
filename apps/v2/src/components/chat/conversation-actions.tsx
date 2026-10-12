"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

interface ConversationActions {
  registerReset: (reset: () => void) => () => void;
  reset: () => boolean;
}

const ConversationActionsContext = createContext<ConversationActions | null>(null);

/** Share the mounted shell's reset with both copies of the server sidebar. */
export function ChatConversationActionsProvider({ children }: { children: ReactNode }) {
  const resetRef = useRef<(() => void) | null>(null);
  const actions = useMemo<ConversationActions>(() => ({
    registerReset(reset) {
      resetRef.current = reset;
      return () => {
        if (resetRef.current === reset) resetRef.current = null;
      };
    },
    reset() {
      if (!resetRef.current) return false;
      resetRef.current();
      return true;
    },
  }), []);

  return (
    <ConversationActionsContext.Provider value={actions}>
      {children}
    </ConversationActionsContext.Provider>
  );
}

export function useChatConversationActions() {
  return useContext(ConversationActionsContext);
}
