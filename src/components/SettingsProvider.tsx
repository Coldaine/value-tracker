"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, overrideSettings, parseSettings, updateSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  setOverride: (planId: string, value: number | null) => void;
  reset: () => void;
  isCustomised: boolean;
}

const SettingsContext = createContext<Ctx | null>(null);
const KEY = "value-tracker:settings:v1";

// Tiny external store over localStorage. useSyncExternalStore renders the
// default on the server and during hydration, then switches to the saved value.
const listeners = new Set<() => void>();
let cache: string | null | undefined;

function read(): string | null {
  if (cache === undefined) {
    try {
      cache = localStorage.getItem(KEY);
    } catch {
      cache = null;
    }
  }
  return cache;
}

function write(value: string | null) {
  cache = value;
  try {
    if (value == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable: keep the in-memory value for this tab */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = undefined;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parseSettings(raw), [raw]);

  const update = useCallback((patch: Partial<Settings>) => {
    write(JSON.stringify(updateSettings(parseSettings(read()), patch)));
  }, []);
  const setOverride = useCallback((planId: string, value: number | null) => {
    write(JSON.stringify(overrideSettings(parseSettings(read()), planId, value)));
  }, []);
  const reset = useCallback(() => write(null), []);
  const isCustomised = raw != null && JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);

  const value = useMemo(
    () => ({ settings, update, setOverride, reset, isCustomised }),
    [settings, update, setOverride, reset, isCustomised],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
