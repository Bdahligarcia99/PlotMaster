import packageJson from "../../package.json";

/** Semantic version from package.json (single source of truth). */
export const APP_VERSION = packageJson.version;

/** Release channel shown in the UI (pre-1.0). */
export const APP_RELEASE_CHANNEL = "alpha" as const;
