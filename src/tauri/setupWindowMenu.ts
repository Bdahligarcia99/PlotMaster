/**
 * Adds "Consolidate Windows" to the macOS Window menu.
 * Call when app loads in Tauri.
 */
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";

function isMac() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
}

function isTauri() {
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

async function submenuText(item: unknown): Promise<string | null> {
  if (!item || typeof item !== "object" || !("text" in item)) return null;
  const textFn = (item as { text: () => Promise<string> }).text;
  if (typeof textFn !== "function") return null;
  return textFn();
}

/** Rebuild the Edit submenu with native predefined items so Cmd+C/V/X/A reach the webview. */
async function ensureEditMenuAccelerators(menu: Menu): Promise<void> {
  const undo = await PredefinedMenuItem.new({ item: "Undo" });
  const redo = await PredefinedMenuItem.new({ item: "Redo" });
  const separator1 = await PredefinedMenuItem.new({ item: "Separator" });
  const cut = await PredefinedMenuItem.new({ item: "Cut" });
  const copy = await PredefinedMenuItem.new({ item: "Copy" });
  const paste = await PredefinedMenuItem.new({ item: "Paste" });
  const separator2 = await PredefinedMenuItem.new({ item: "Separator" });
  const selectAll = await PredefinedMenuItem.new({ item: "SelectAll" });

  const editSubmenu = await Submenu.new({
    text: "Edit",
    items: [undo, redo, separator1, cut, copy, paste, separator2, selectAll],
  });

  const items = await menu.items();
  const editIndex = (
    await Promise.all(items.map(async (item, index) => ((await submenuText(item)) === "Edit" ? index : -1)))
  ).find((index) => index >= 0);

  if (editIndex != null && editIndex >= 0) {
    await menu.removeAt(editIndex);
    await menu.insert([editSubmenu], editIndex);
  } else {
    await menu.append(editSubmenu);
  }
}

export async function setupWindowMenu() {
  if (!isTauri() || !isMac()) return;

  try {
    const menu = await Menu.default();
    await ensureEditMenuAccelerators(menu);

    const consolidateItem = await MenuItem.new({
      id: "synapse-iwe-consolidate-windows",
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
        const text = await submenuText(item);
        if (text === "Window" && "append" in item) {
          await (item as { append: (i: unknown) => Promise<void> }).append(consolidateItem);
          break;
        }
      }
    }

    await menu.setAsAppMenu();
  } catch (e) {
    console.warn("Failed to setup Window menu:", e);
  }
}
