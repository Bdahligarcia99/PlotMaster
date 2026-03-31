/**
 * App version is read from package.json (also mirrored in src-tauri: tauri.conf.json, Cargo.toml).
 *
 * Versioning policy: shipping a **new module** bumps **major** (e.g. two modules ⇒ 2.x.x).
 * Minor/patch are for improvements within the current module set.
 */
import packageJson from "../../package.json";

/** Semantic version from package.json (single source of truth). */
export const APP_VERSION = packageJson.version;

/** Release channel shown in the UI (pre-1.0). */
export const APP_RELEASE_CHANNEL = "alpha" as const;
