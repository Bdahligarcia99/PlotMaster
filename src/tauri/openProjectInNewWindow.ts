/**
 * Opens a project in a new Tauri window.
 * Only works when running in the Tauri desktop app.
 */

const PROJECT_WINDOW_SIZE = { width: 1280, height: 800 };
const INTRO_WINDOW_LABEL = "synapse-iwe-intro";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

interface OpenProjectOptions {
  /** When true, close the current window after opening the project. Default false to keep intro/project open. */
  closeCurrent?: boolean;
}

/**
 * Opens the given path (e.g. /project/123 or /family-tree/abc) in a new window.
 * By default does not close the current window (allows opening multiple projects).
 */
export async function openProjectInNewWindow(
  path: string,
  options: OpenProjectOptions = {}
): Promise<void> {
  if (!isTauri()) return;

  const { closeCurrent = false } = options;

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  const url = `${window.location.origin}${path}`;
  const label = `project-${path.replace(/\//g, "-")}-${Date.now()}`;

  const webview = new WebviewWindow(label, {
    url,
    title: "Synapse IWE",
    width: PROJECT_WINDOW_SIZE.width,
    height: PROJECT_WINDOW_SIZE.height,
    resizable: true,
    tabbingIdentifier: "synapse-iwe",
  });

  webview.once("tauri://error", () => {});

  if (closeCurrent) {
    webview.once("tauri://created", () => {
      getCurrentWindow().close().catch(() => {});
    });
  }
}

/**
 * Opens the intro (Create/Recents) window, or focuses it if already open.
 * Use when clicking "Projects" from a module window.
 */
export async function openOrFocusIntroWindow(): Promise<void> {
  if (!isTauri()) return;

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  try {
    const existing = await WebviewWindow.getByLabel(INTRO_WINDOW_LABEL);
    if (existing) {
      await existing.setFocus();
      return;
    }
  } catch {
    // Window not found, create new
  }

  // Try main window (initial app window)
  try {
    const main = await WebviewWindow.getByLabel("main");
    if (main) {
      await main.setFocus();
      return;
    }
  } catch {
    // Main not found
  }

  // Create new intro window (use saved size if available)
  const url = `${window.location.origin}/`;
  let width = 480;
  let height = 580;
  try {
    const raw = localStorage.getItem("synapse-iwe:intro-window-size");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.width === "number" && typeof parsed.height === "number") {
        width = Math.max(400, Math.min(1920, parsed.width));
        height = Math.max(400, Math.min(1200, parsed.height));
      }
    }
  } catch {}
  const webview = new WebviewWindow(INTRO_WINDOW_LABEL, {
    url,
    title: "Synapse IWE",
    width,
    height,
    resizable: true,
    tabbingIdentifier: "synapse-iwe",
  });
  webview.once("tauri://error", () => {});
}
