import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { logEvent } from "./actionLog";

function resolveClickLabel(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el =
    target.closest("button") ??
    target.closest('[role="tab"]') ??
    target.closest("a") ??
    target.closest("select") ??
    target.closest('input[type="checkbox"]') ??
    target.closest('input[type="radio"]');
  if (!el) return null;

  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return truncate(aria.trim());

  const title = el.getAttribute("title");
  if (title?.trim()) return truncate(title.trim());

  if (el instanceof HTMLSelectElement) {
    const opt = el.options[el.selectedIndex];
    return truncate(`select: ${opt?.text ?? el.name ?? "?"}`);
  }

  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text) return truncate(text);

  return truncate(el.tagName.toLowerCase());
}

function truncate(s: string, max = 60): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function resolveModuleFromPath(pathname: string): string {
  if (pathname.startsWith("/family-tree")) return "familyTree";
  if (pathname.startsWith("/timeline")) return "timeline";
  if (pathname.startsWith("/charts")) return "charts";
  if (pathname.startsWith("/neuron")) return "neuron";
  if (pathname.startsWith("/project")) return "ideas";
  return "app";
}

function onDocumentClick(e: MouseEvent) {
  const label = resolveClickLabel(e.target);
  if (!label) return;
  logEvent({
    tier: "action",
    category: "ui",
    module: resolveModuleFromPath(window.location.pathname),
    label: `click: ${label}`,
  });
}

function onDocumentChange(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const opt = target.options[target.selectedIndex];
  const value = opt?.value ?? target.value;
  const text = opt?.text ?? value;
  logEvent({
    tier: "action",
    category: "ui",
    module: resolveModuleFromPath(window.location.pathname),
    label: `change: ${truncate(target.name || target.id || "select")}`,
    detail: `${text} (${value})`,
    payload: { value, text },
  });
}

function onWindowError(message: string | Event, source?: string, lineno?: number) {
  const msg = typeof message === "string" ? message : "Script error";
  logEvent({
    tier: "error",
    category: "error",
    module: "app",
    label: "window.onerror",
    detail: `${msg}${source ? ` @ ${source}:${lineno ?? "?"}` : ""}`,
  });
}

function onUnhandledRejection(e: PromiseRejectionEvent) {
  const reason = e.reason;
  const detail =
    reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled rejection";
  logEvent({
    tier: "error",
    category: "error",
    module: "app",
    label: "unhandledrejection",
    detail,
  });
}

let installed = false;

export function installGlobalUiLogging() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("change", onDocumentChange, true);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
}

export function NavigationLogWatcher() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    const prev = prevPathRef.current;
    if (prev != null && prev !== path) {
      logEvent({
        tier: "action",
        category: "navigation",
        module: resolveModuleFromPath(path),
        label: "route.change",
        detail: `${prev} -> ${path}`,
        payload: { from: prev, to: path },
      });
    }
    prevPathRef.current = path;
  }, [location.pathname]);

  return null;
}

export { resolveModuleFromPath };
