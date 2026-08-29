import type { StateCreator } from "zustand";
import { logEvent } from "./actionLog";
import {
  consumeThrottleSlot,
  resolveCatalogEntry,
  shouldThrottleAction,
  summarizeAction,
} from "./logCatalog";

export function instrument<T extends object>(
  moduleId: string,
  init: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) => {
    const state = init(
      (partial, replace) => {
        loggingSet(moduleId, partial, replace, set, get);
      },
      get,
      api
    );
    return wrapActions(moduleId, state, get);
  };
}

function loggingSet<T extends object>(
  _moduleId: string,
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace: boolean | undefined,
  originalSet: (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => void,
  _get: () => T
) {
  originalSet(partial, replace);
}

function wrapActions<T extends object>(
  moduleId: string,
  state: T,
  get: () => T
): T {
  const out = { ...state } as Record<string, unknown>;
  for (const key of Object.keys(state)) {
    const val = (state as Record<string, unknown>)[key];
    if (typeof val === "function") {
      out[key] = wrapAction(moduleId, key, val as (...args: unknown[]) => unknown, get);
    }
  }
  return out as T;
}

function wrapAction(
  moduleId: string,
  actionName: string,
  fn: (...args: unknown[]) => unknown,
  get: () => unknown
) {
  return (...args: unknown[]) => {
    const entry = resolveCatalogEntry(actionName);
    const now = Date.now();

    if (shouldThrottleAction(actionName)) {
      const slot = consumeThrottleSlot(moduleId, actionName, now);
      if (!slot.emit) {
        return fn(...args);
      }
      const start = performance.now();
      let result: unknown;
      try {
        result = fn(...args);
      } catch (e) {
        logEvent({
          tier: "verbose",
          category: entry.category,
          module: moduleId,
          label: actionName,
          detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
          durationMs: Math.round(performance.now() - start),
          repeat: slot.repeat,
        });
        throw e;
      }
      const summary = summarizeAction(actionName, args, get);
      logEvent({
        tier: "verbose",
        category: entry.category,
        module: moduleId,
        label: actionName,
        detail: summary.detail,
        payload: summary.payload,
        durationMs: Math.round(performance.now() - start),
        repeat: slot.repeat,
      });
      return result;
    }

    const start = performance.now();
    let result: unknown;
    try {
      result = fn(...args);
    } catch (e) {
      logEvent({
        tier: entry.tier,
        category: entry.category,
        module: moduleId,
        label: actionName,
        detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
        durationMs: Math.round(performance.now() - start),
      });
      throw e;
    }

    const summary = summarizeAction(actionName, args, get);
    const tier = summary.tier ?? entry.tier;
    const category = summary.category ?? entry.category;

    logEvent({
      tier,
      category,
      module: moduleId,
      label: actionName,
      detail: summary.detail,
      payload: summary.payload,
      durationMs: Math.round(performance.now() - start),
    });

    return result;
  };
}

/** Log a manual UI/canvas event outside store actions. */
export function logManualEvent(
  moduleId: string,
  label: string,
  opts: {
    category?: import("./actionLog").LogCategory;
    tier?: import("./actionLog").LogTier;
    detail?: string;
    payload?: unknown;
    durationMs?: number;
  } = {}
) {
  logEvent({
    module: moduleId,
    label,
    category: opts.category ?? "ui",
    tier: opts.tier ?? "action",
    detail: opts.detail,
    payload: opts.payload,
    durationMs: opts.durationMs,
  });
}
