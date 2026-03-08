/**
 * Adds "Consolidate Windows" to the macOS Window menu.
 * Call when app loads in Tauri.
 */
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";

function isMac() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
}

function isTauri() {
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

export async function setupWindowMenu() {
  if (!isTauri() || !isMac()) return;

  try {
    const menu = await Menu.default();
    const consolidateItem = await MenuItem.new({
      id: "plotmaster-consolidate-windows",
      text: "Consolidate Windows",
      action: async () => {
        try {
          await invoke("consolidate_windows");
        } catch (e) {
          console.warn("Consolidate windows failed:", e);
        }
      },
    });

    // Try get by id first (common Tauri default ids: window, help, etc.)
    let windowSubmenu = await menu.get("window");
    if (!windowSubmenu) {
      windowSubmenu = await menu.get("Window");
    }
    if (windowSubmenu && "append" in windowSubmenu) {
      await (windowSubmenu as { append: (item: unknown) => Promise<void> }).append(consolidateItem);
    } else {
      // Fallback: find Window submenu by text
      const items = await menu.items();
      for (const item of items) {
        if ("text" in item && typeof (item as { text: () => Promise<string> }).text === "function") {
          const text = await (item as { text: () => Promise<string> }).text();
          if (text === "Window" && "append" in item) {
            await (item as { append: (i: unknown) => Promise<void> }).append(consolidateItem);
            break;
          }
        }
      }
    }

    await menu.setAsAppMenu();
  } catch (e) {
    console.warn("Failed to setup Window menu:", e);
  }
}
