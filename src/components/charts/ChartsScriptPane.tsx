import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  useChartsStore,
  generateChartsScript,
} from "../../store/chartsStore";
import { parseChartsScript } from "../../parseChartsScript";

const INDENT = "  ";

/** Compute smart indent for the next line based on current line */
function getSmartIndent(lines: string[], cursorLineIndex: number): string {
  if (cursorLineIndex < 0) return "";
  const currentLine = lines[cursorLineIndex] ?? "";
  const trimmed = currentLine.trim();
  const currentIndent = currentLine.match(/^\s*/)?.[0] ?? "";

  // After section (h1-h4 "..."): indent one level for children
  if (/^(h1|h2|h3|h4)\s+"/.test(trimmed)) {
    return currentIndent + INDENT;
  }
  // After attributes keyword: indent for key-value pairs
  if (/^\s*attributes\s*$/.test(currentLine)) {
    return currentIndent + INDENT;
  }
  // After note/image: same indent (sibling)
  if (/^\s*note\s+"/.test(currentLine) || /^\s*image\s+"/.test(currentLine)) {
    return currentIndent;
  }
  // After key: value in attributes block: same indent
  if (/^\s+\S+:\s*/.test(currentLine)) {
    return currentIndent;
  }
  // After opening brace or empty line: use previous non-empty line's indent
  if (trimmed === "" || trimmed === "{") {
    for (let i = cursorLineIndex - 1; i >= 0; i--) {
      const prev = lines[i] ?? "";
      const prevTrimmed = prev.trim();
      if (prevTrimmed && prevTrimmed !== "{") {
        const prevIndent = prev.match(/^\s*/)?.[0] ?? "";
        if (/^(h1|h2|h3|h4)\s+"/.test(prevTrimmed)) return prevIndent + INDENT;
        return prevIndent;
      }
    }
  }
  // Default: maintain current indent
  return currentIndent;
}

export default function ChartsScriptPane() {
  const { id: projectId } = useParams<{ id: string }>();
  const characters = useChartsStore((s) => s.characters);
  const selectedCharacterId = useChartsStore((s) => s.selectedCharacterId);
  const chartLayoutMode = useChartsStore((s) => s.chartLayoutMode);
  const createLayoutDraftSections = useChartsStore(
    (s) => s.createLayoutDraftSections
  );
  const createLayoutDraftDataTypes = useChartsStore(
    (s) => s.createLayoutDraftDataTypes
  );
  const applyProfilesFromScript = useChartsStore(
    (s) => s.applyProfilesFromScript
  );
  const getDocumentForCharacter = useChartsStore((s) => s.getDocumentForCharacter);
  const getDocumentDisplayContent = useChartsStore((s) => s.getDocumentDisplayContent);
  const applyChartsDocumentEdits = useChartsStore((s) => s.applyChartsDocumentEdits);
  const setCreateLayoutDraftSections = useChartsStore(
    (s) => s.setCreateLayoutDraftSections
  );
  const setCreateLayoutDraftDataTypes = useChartsStore(
    (s) => s.setCreateLayoutDraftDataTypes
  );
  const setCreateLayoutDraftBuiltinDataTypes = useChartsStore(
    (s) => s.setCreateLayoutDraftBuiltinDataTypes
  );
  const createLayoutDraftBuiltinDataTypes = useChartsStore(
    (s) => s.createLayoutDraftBuiltinDataTypes
  );
  const [copied, setCopied] = useState(false);
  const [compactDeclarations, setCompactDeclarations] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeChartDoc = selectedCharacterId
    ? getDocumentForCharacter(selectedCharacterId)
    : null;

  const generatedScript = useMemo(() => {
    if (chartLayoutMode === "createLayout") {
      return generateChartsScript(createLayoutDraftSections, {
        compact: compactDeclarations,
        characterName: "New Layout",
        source: "template",
        customDataTypes: createLayoutDraftDataTypes,
        builtinDataTypes: createLayoutDraftBuiltinDataTypes,
      });
    }
    if (activeChartDoc) {
      return getDocumentDisplayContent(activeChartDoc.id);
    }
    const selectedChar = selectedCharacterId
      ? characters.find((c) => c.id === selectedCharacterId)
      : null;
    return generateChartsScript(selectedChar ? [selectedChar] : [], {
      compact: compactDeclarations,
      source: "characters",
    });
  }, [
    chartLayoutMode,
    characters,
    selectedCharacterId,
    activeChartDoc,
    createLayoutDraftSections,
    createLayoutDraftDataTypes,
    createLayoutDraftBuiltinDataTypes,
    compactDeclarations,
    getDocumentDisplayContent,
  ]);

  // Sync editor from store when not dirty
  useEffect(() => {
    if (!editorDirty) {
      setEditorContent(generatedScript);
    }
  }, [generatedScript, editorDirty]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editorContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  const handleRun = useCallback(() => {
    setParseError(null);
    setRunSuccess(false);
    const result = parseChartsScript(editorContent);

    if (!result.ok) {
      setParseError(
        result.error.line != null
          ? `Line ${result.error.line}: ${result.error.message}`
          : result.error.message
      );
      return;
    }

    if (!projectId) {
      setParseError("No project loaded.");
      return;
    }

    if (chartLayoutMode === "createLayout") {
      const customDataTypes = result.customDataTypes ?? [];
      const builtinDataTypes = result.builtinDataTypes ?? [];
      setCreateLayoutDraftDataTypes(customDataTypes);
      setCreateLayoutDraftBuiltinDataTypes(builtinDataTypes);
      const first = result.characters[0];
      if (first) {
        setCreateLayoutDraftSections(first.sections ?? []);
        const normalized = generateChartsScript(first.sections ?? [], {
          compact: compactDeclarations,
          characterName: "New Layout",
          source: "template",
          customDataTypes,
          builtinDataTypes,
        });
        setEditorContent(normalized);
      } else {
        setCreateLayoutDraftSections([]);
        setEditorContent(
          generateChartsScript([], {
            compact: compactDeclarations,
            source: "template",
            customDataTypes,
            builtinDataTypes,
          })
        );
      }
    } else if (activeChartDoc) {
      const result = applyChartsDocumentEdits([
        { docId: activeChartDoc.id, content: editorContent },
      ]);
      if (!result.ok) {
        setParseError(result.errors.join("; "));
        return;
      }
      setEditorContent(getDocumentDisplayContent(activeChartDoc.id));
    } else {
      applyProfilesFromScript(projectId, result.characters);
      const normalized = generateChartsScript(result.characters, {
        compact: compactDeclarations,
        source: "characters",
      });
      setEditorContent(normalized);
    }

    setEditorDirty(false);
    setRunSuccess(true);
    setTimeout(() => setRunSuccess(false), 2000);
  }, [
    editorContent,
    projectId,
    chartLayoutMode,
    compactDeclarations,
    applyProfilesFromScript,
    applyChartsDocumentEdits,
    getDocumentDisplayContent,
    activeChartDoc,
    setCreateLayoutDraftSections,
    setCreateLayoutDraftDataTypes,
    setCreateLayoutDraftBuiltinDataTypes,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRun();
      return;
    }

    const ta = e.currentTarget;
    if (e.key === "Enter") {
      const start = ta.selectionStart;
      const text = ta.value;
      const before = text.slice(0, start);
      const after = text.slice(start);
      const lines = before.split("\n");
      const cursorLineIndex = lines.length - 1;
      const indent = getSmartIndent(lines, cursorLineIndex);
      e.preventDefault();
      const newText = before + "\n" + indent + after;
      const newCursor = start + 1 + indent.length;
      setEditorContent(newText);
      setEditorDirty(true);
      setParseError(null);
      requestAnimationFrame(() => {
        ta.setSelectionRange(newCursor, newCursor);
      });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      const before = text.slice(0, start);
      const after = text.slice(end);
      setEditorContent(before + INDENT + after);
      setEditorDirty(true);
      requestAnimationFrame(() => {
        ta.setSelectionRange(start + INDENT.length, start + INDENT.length);
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value);
    setEditorDirty(true);
    setParseError(null);
  };

  // Working mode: can edit/run when createLayout, or a character is selected, or no characters yet (bootstrap)
  const hasWorkingMode =
    chartLayoutMode === "createLayout" ||
    selectedCharacterId != null ||
    characters.length === 0;

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">
            Script
          </span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">
            Code
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasWorkingMode && (
            <button
              type="button"
              onClick={handleRun}
              className="px-2 py-1 text-xs rounded border border-green-500/50 bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
              title="Apply script (Ctrl/Cmd+Enter)"
            >
              {runSuccess ? "Applied!" : "Run"}
            </button>
          )}
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
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {parseError && (
          <div className="px-3 py-2 bg-red-500/15 border-b border-red-500/30 shrink-0" role="alert">
            <span className="text-xs text-red-400 block">{parseError}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden p-3">
          {hasWorkingMode ? (
            <textarea
              ref={textareaRef}
              value={editorContent}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="w-full h-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
              spellCheck={false}
              placeholder="@charts&#10;&#10;[CharacterName] {&#10;  h1 &quot;Section&quot;&#10;    note &quot;...&quot;&#10;}"
            />
          ) : (
            <div className="w-full h-full px-3 py-2 bg-dark-bg/50 border border-dark-accent/50 rounded-lg flex items-center justify-center text-center">
              <p className="text-sm text-dark-muted">
                Select a character from the Entities panel or create a new layout to use the script editor.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
