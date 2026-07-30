import { isTauri } from "../../tauri/openProjectInNewWindow";
import {
  parseSynprojFile,
  serializeSynprojFile,
  SYNPROJ_EXTENSION,
  SYNPROJ_MIME,
  type SynprojFile,
} from "./synprojFormat";
import {
  generateFileRefToken,
  getFileHandle,
  isWebFileRef,
  storeFileHandle,
} from "./fileHandleDb";

export interface SynprojFileIO {
  pickSaveLocation(suggestedName: string): Promise<string | null>;
  pickOpenLocation(): Promise<{ fileRef: string; contents: SynprojFile } | null>;
  write(fileRef: string, data: SynprojFile): Promise<void>;
  read(fileRef: string): Promise<SynprojFile>;
  ensureWritePermission(fileRef: string): Promise<boolean>;
}

function sanitizeSuggestedName(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "-") || "Untitled Project";
  return base.endsWith(SYNPROJ_EXTENSION) ? base : `${base}${SYNPROJ_EXTENSION}`;
}

async function ensureHandlePermission(handle: FileSystemFileHandle, mode: FileSystemPermissionMode): Promise<boolean> {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

class WebSynprojFileIO implements SynprojFileIO {
  async pickSaveLocation(suggestedName: string): Promise<string | null> {
    const showSave = window.showSaveFilePicker;
    if (!showSave) {
      throw new Error("File saving is not supported in this browser. Use Chrome or Edge, or the desktop app.");
    }
    const handle = await showSave({
      suggestedName: sanitizeSuggestedName(suggestedName),
      types: [
        {
          description: "Synapse Project",
          accept: { [SYNPROJ_MIME]: [SYNPROJ_EXTENSION] },
        },
      ],
    });
    const token = generateFileRefToken();
    await storeFileHandle(token, handle);
    return token;
  }

  async pickOpenLocation(): Promise<{ fileRef: string; contents: SynprojFile } | null> {
    const showOpen = window.showOpenFilePicker;
    if (!showOpen) {
      throw new Error("File opening is not supported in this browser. Use Chrome or Edge, or the desktop app.");
    }
    const [handle] = await showOpen({
      multiple: false,
      types: [
        {
          description: "Synapse Project",
          accept: { [SYNPROJ_MIME]: [SYNPROJ_EXTENSION] },
        },
      ],
    });
    if (!handle) return null;
    const ok = await ensureHandlePermission(handle, "read");
    if (!ok) throw new Error("Permission to read the project file was denied.");
    const file = await handle.getFile();
    const contents = parseSynprojFile(await file.text());
    const token = generateFileRefToken();
    await storeFileHandle(token, handle);
    return { fileRef: token, contents };
  }

  async ensureWritePermission(fileRef: string): Promise<boolean> {
    if (!isWebFileRef(fileRef)) return false;
    const handle = await getFileHandle(fileRef);
    if (!handle) return false;
    return ensureHandlePermission(handle, "readwrite");
  }

  async write(fileRef: string, data: SynprojFile): Promise<void> {
    const handle = await getFileHandle(fileRef);
    if (!handle) throw new Error("Project file handle not found. Re-open the project file.");
    const ok = await ensureHandlePermission(handle, "readwrite");
    if (!ok) throw new Error("Permission to write the project file was denied. Re-open the file to reconnect.");
    const writable = await handle.createWritable();
    await writable.write(serializeSynprojFile({ ...data, savedAt: Date.now() }));
    await writable.close();
  }

  async read(fileRef: string): Promise<SynprojFile> {
    const handle = await getFileHandle(fileRef);
    if (!handle) throw new Error("Project file handle not found. Re-open the project file.");
    const ok = await ensureHandlePermission(handle, "read");
    if (!ok) throw new Error("Permission to read the project file was denied. Re-open the file to reconnect.");
    const file = await handle.getFile();
    return parseSynprojFile(await file.text());
  }
}

class TauriSynprojFileIO implements SynprojFileIO {
  async pickSaveLocation(suggestedName: string): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: sanitizeSuggestedName(suggestedName),
      filters: [{ name: "Synapse Project", extensions: ["synproj"] }],
    });
    return path ?? null;
  }

  async pickOpenLocation(): Promise<{ fileRef: string; contents: SynprojFile } | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      multiple: false,
      filters: [{ name: "Synapse Project", extensions: ["synproj"] }],
    });
    if (!path || Array.isArray(path)) return null;
    const contents = parseSynprojFile(await readTextFile(path));
    return { fileRef: path, contents };
  }

  async ensureWritePermission(_fileRef: string): Promise<boolean> {
    return true;
  }

  async write(fileRef: string, data: SynprojFile): Promise<void> {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(fileRef, serializeSynprojFile({ ...data, savedAt: Date.now() }));
  }

  async read(fileRef: string): Promise<SynprojFile> {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return parseSynprojFile(await readTextFile(fileRef));
  }
}

let io: SynprojFileIO | null = null;

export function getSynprojFileIO(): SynprojFileIO {
  if (!io) io = isTauri() ? new TauriSynprojFileIO() : new WebSynprojFileIO();
  return io;
}
