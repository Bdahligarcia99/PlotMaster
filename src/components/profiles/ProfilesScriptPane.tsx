import { useMemo, useState } from "react";
import { useCharacterProfilesStore } from "../../store/characterProfilesStore";
import type { CharacterEntity } from "../../store/characterProfilesStore";
import { getOrderedSections } from "../../store/characterProfilesStore";

function generateProfilesScript(
  characters: CharacterEntity[],
  options: { compact?: boolean }
): string {
  if (characters.length === 0) {
    return `@profiles
  (No characters yet. Add characters in the Entities panel.)`;
  }

  const lines: string[] = ["@profiles"];

  for (const char of characters) {
    const name = char.name.trim() || "Unnamed";
    lines.push(`  [${name}] {`);

    const sections = getOrderedSections(char.sections ?? []);
    if (sections.length === 0) {
      lines.push("    —");
    } else {
      for (const sec of sections) {
        const secName = sec.label?.trim() || "Section";
        const baseIndent = sec.parentId ? "      " : "    ";
        const blockIndent = sec.parentId ? "        " : "      ";

        if (options.compact) {
          const parts: string[] = [];
          for (const block of sec.contentBlocks ?? []) {
            if (block.type === "note" && block.content.trim()) {
              parts.push(block.content.trim().replace(/\n/g, " "));
            }
            if (block.type === "attributes" && Object.keys(block.keyValuePairs ?? {}).length > 0) {
              const attrStr = (block.attributeOrder ?? Object.keys(block.keyValuePairs ?? {}))
                .filter((k) => k in (block.keyValuePairs ?? {}))
                .map((k) => `${k}: ${(block.keyValuePairs ?? {})[k]}`)
                .join(", ");
              parts.push(attrStr);
            }
            if (block.type === "image" && (block.label || block.imageUrl)) {
              parts.push(block.label ? `[Image: ${block.label}]` : "[Image]");
            }
          }
          lines.push(`${baseIndent}${secName}: ${parts.join(" | ") || "—"}`);
        } else {
          lines.push(`${baseIndent}${secName}:`);
          for (const block of sec.contentBlocks ?? []) {
            if (block.type === "note") {
              if (block.content.trim()) {
                block.content.split("\n").forEach((line) => {
                  lines.push(`${blockIndent}Note: ${line.trim() || "—"}`);
                });
              }
            }
            if (block.type === "attributes") {
              const pairs = block.keyValuePairs ?? {};
              const order = block.attributeOrder ?? Object.keys(pairs);
              const entries = order.filter((k) => k in pairs).map((k) => [k, pairs[k]]);
              if (entries.length === 0) {
                lines.push(`${blockIndent}—`);
              } else {
                for (const [key, value] of entries) {
                  lines.push(`${blockIndent}${key}: ${value}`);
                }
              }
            }
            if (block.type === "image") {
              const imgLabel = block.label ? ` (${block.label})` : "";
              const imgUrl = block.imageUrl ? `: ${block.imageUrl}` : "";
              lines.push(`${blockIndent}[Image${imgLabel}${imgUrl}]`);
            }
          }
          if ((sec.contentBlocks ?? []).length === 0) {
            lines.push(`${blockIndent}—`);
          }
        }
      }
    }
    lines.push("  }");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export default function ProfilesScriptPane() {
  const characters = useCharacterProfilesStore((s) => s.characters);
  const [scriptPanelLayout, setScriptPanelLayout] = useState<
    "split" | "codeOnly" | "viewOnly"
  >("viewOnly");
  const [copied, setCopied] = useState(false);
  const [compactDeclarations, setCompactDeclarations] = useState(false);

  const script = useMemo(
    () =>
      generateProfilesScript(characters, {
        compact: compactDeclarations,
      }),
    [characters, compactDeclarations]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  const showCode = scriptPanelLayout === "split" || scriptPanelLayout === "codeOnly";
  const showView = scriptPanelLayout === "split" || scriptPanelLayout === "viewOnly";

  const layoutBtn = (mode: "split" | "codeOnly" | "viewOnly", label: string) => (
    <button
      type="button"
      onClick={() => setScriptPanelLayout(mode)}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        scriptPanelLayout === mode
          ? "bg-dark-accent border-dark-accent text-dark-text"
          : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:border-dark-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">
            Script
          </span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs text-dark-muted">Layout:</span>
          {layoutBtn("split", "Split")}
          {layoutBtn("codeOnly", "Code")}
          {layoutBtn("viewOnly", "View")}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div
          className={`flex flex-col min-w-0 ${
            scriptPanelLayout === "split" ? "border-r border-dark-accent/50" : ""
          } ${showCode ? "flex-1" : "hidden"}`}
        >
          <div className="flex items-center px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">
              Code
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <textarea
              readOnly
              value={script}
              className="w-full h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              spellCheck={false}
            />
          </div>
        </div>

        {scriptPanelLayout === "split" && (
          <div className="w-px shrink-0 bg-dark-accent/50" aria-hidden />
        )}

        <div
          className={`flex flex-col min-w-0 ${showView ? "flex-1" : "hidden"}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-1.5 border-b border-dark-accent/30 shrink-0">
            <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">
              View
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-dark-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={compactDeclarations}
                  onChange={(e) => setCompactDeclarations(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Compact</span>
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50 hover:border-dark-accent transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <textarea
              value={script}
              readOnly
              className="w-full h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
