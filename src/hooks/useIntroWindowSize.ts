import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const INTRO_SIZE = { width: 480, height: 580 };
const MAIN_SIZE = { width: 1280, height: 800 };
const INTRO_SIZE_MIN = { width: 400, height: 400 };
const INTRO_SIZE_MAX = { width: 1920, height: 1200 };
const INTRO_SIZE_STORAGE_KEY = "plotmaster:intro-window-size";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function loadSavedIntroSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(INTRO_SIZE_STORAGE_KEY);
    if (raw) {
      const { width, height } = JSON.parse(raw);
      if (
        typeof width === "number" &&
        typeof height === "number" &&
        width >= INTRO_SIZE_MIN.width &&
        height >= INTRO_SIZE_MIN.height &&
        width <= INTRO_SIZE_MAX.width &&
        height <= INTRO_SIZE_MAX.height
      ) {
        return { width, height };
      }
    }
  } catch {}
  return null;
}

function saveIntroSize(width: number, height: number) {
  try {
    localStorage.setItem(
      INTRO_SIZE_STORAGE_KEY,
      JSON.stringify({
        width: Math.round(width),
        height: Math.round(height),
      })
    );
  } catch {}
}

/**
 * When running in Tauri desktop app, resizes the window to fit the intro UI
 * when at "/" and to full size when viewing a project. Remembers intro window
 * dimensions when the user resizes.
 */
export function useIntroWindowSize() {
  const location = useLocation();

  useEffect(() => {
    if (!isTauri()) return;

    import("@tauri-apps/api/window").then(({ getCurrentWindow, LogicalSize }) => {
      const win = getCurrentWindow();
      const isIntro = location.pathname === "/";

      if (isIntro) {
        const saved = loadSavedIntroSize();
        const { width, height } = saved ?? INTRO_SIZE;
        win.setSize(new LogicalSize(width, height)).catch(() => {});
      } else {
        const { width, height } = MAIN_SIZE;
        win.setSize(new LogicalSize(width, height)).catch(() => {});
      }
    }).catch(() => {});
  }, [location.pathname]);

  // Listen for resize when on intro and persist dimensions
  useEffect(() => {
    if (!isTauri() || location.pathname !== "/") return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const w = Math.max(INTRO_SIZE_MIN.width, Math.min(INTRO_SIZE_MAX.width, window.innerWidth));
        const h = Math.max(INTRO_SIZE_MIN.height, Math.min(INTRO_SIZE_MAX.height, window.innerHeight));
        saveIntroSize(w, h);
      }, 300);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [location.pathname]);
}
