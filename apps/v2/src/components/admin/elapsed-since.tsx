"use client";

import { useSyncExternalStore } from "react";

// P2-B2. "How long has this been going on" for operator takeovers.
//
// The clock has to be read on the client: computing it during a server
// render both bakes in a stale value and trips the purity rule (Date.now
// is impure). useSyncExternalStore is the sanctioned way to subscribe to
// an outside-React source — the snapshot is rounded to the minute so it
// stays referentially stable between ticks (an unrounded Date.now would
// return a new value on every read and re-render forever).

function subscribe(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, 60_000);
  return () => clearInterval(id);
}

function getSnapshot(): number {
  return Math.floor(Date.now() / 60_000);
}

/** No clock on the server; render nothing until hydration. */
function getServerSnapshot(): number | null {
  return null;
}

function format(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間 ${minutes % 60} 分`;
  return `${Math.floor(hours / 24)} 日 ${hours % 24} 時間`;
}

export function ElapsedSince({ since }: { since: string }) {
  const minuteTick = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (minuteTick === null) return null;

  const startedAt = Date.parse(since);
  if (Number.isNaN(startedAt)) return null;

  const minutes = Math.max(0, minuteTick - Math.floor(startedAt / 60_000));
  return <>{format(minutes)}</>;
}
