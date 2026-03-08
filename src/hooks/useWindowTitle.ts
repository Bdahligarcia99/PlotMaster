import { useEffect } from "react";
import { isTauri } from "../tauri/openProjectInNewWindow";

/**
 * Sets the window title when running in Tauri.
 * Used so the tabs bar shows meaningful project names.
 */
export function useWindowTitle(title: string) {
  useEffect(() => {
    if (!isTauri() || !title) return;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => {});
  }, [title]);
}
