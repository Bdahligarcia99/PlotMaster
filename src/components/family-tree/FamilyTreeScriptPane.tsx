import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "../timeline/beatEditor/BeatDocumentEditorView";
import { useFamilyTreeStore, generateFamilyTreeScript } from "../../store/familyTreeStore";

/** Escape string for use in RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if line references the given node by its unique ID. */
function lineReferencesNode(line: string, nodeId: string): boolean {
  const idEscaped = escapeRegex(nodeId);
  const idRe = new RegExp(`(?:^|[^a-zA-Z0-9_])${idEscaped}(?:$|[^a-zA-Z0-9_])`);
  return idRe.test(line);
}

function computeHighlightLines(content: string, nodeIds: Set<string>): number[] {
  if (nodeIds.size === 0) return [];
  const lines = content.split("\n");
  const result: number[] = [];
  let insideBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (insideBlock) {
      result.push(i);
      if (trimmed === "}" || trimmed === "},") insideBlock = false;
      continue;
    }
    const matches = [...nodeIds].some((id) => lineReferencesNode(line, id));
    if (matches) {
      result.push(i);
      if (trimmed.endsWith("{")) insideBlock = true;
    }
  }
  return result;
}

export default function FamilyTreeScriptPane() {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const generationAnchors = useFamilyTreeStore((s) => s.generationAnchors);
  const genLabelMode = useFamilyTreeStore((s) => s.genLabelMode);
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const applyFamilyTreeScriptEdits = useFamilyTreeStore((s) => s.applyFamilyTreeScriptEdits);

  const [draft, setDraft] = useState<{ content: string; dirty: boolean } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<BeatDocumentEditorHandle | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generatedScript = useMemo(
    () =>
      generateFamilyTreeScript(nodes, edges, {
        compactDeclarations: false,
        showNodeInfo: false,
        generationAnchors,
        genLabelMode,
        connectionStyles,
      }),
    [nodes, edges, generationAnchors, genLabelMode, connectionStyles]
  );

  const editorContent = draft?.dirty ? draft.content : generatedScript;

  const commitDraft = useCallback((): { ok: boolean } => {
    if (!draft?.dirty) {
      setCommitError(null);
      return { ok: true };
    }
    const result = applyFamilyTreeScriptEdits(draft.content);
    if (!result.ok) {
      setCommitError(result.errors.join("; "));
      return { ok: false };
    }
    setDraft(null);
    setCommitError(null);
    return { ok: true };
  }, [draft, applyFamilyTreeScriptEdits]);

  const commitDraftRef = useRef(commitDraft);
  commitDraftRef.current = commitDraft;

  useEffect(() => {
    if (!draft?.dirty) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitDraftRef.current();
    }, 800);
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, [draft]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitDraftRef.current();
    };
  }, []);

  const highlightNodeIds = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  useEffect(() => {
    const handle = editorRef.current;
    if (!handle) return;
    const lines = computeHighlightLines(editorContent, highlightNodeIds);
    handle.setHighlightLines(lines);
  }, [highlightNodeIds, editorContent]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editorContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Code</span>
          {draft?.dirty ? (
            <span className="text-xs text-amber-400/90">· Unsaved</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {commitError && (
        <div className="px-3 py-2 text-xs text-red-400 border-b border-red-500/30 bg-red-500/10 shrink-0">
          {commitError}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3 pt-2 flex flex-col">
        <BeatDocumentEditorView
          ref={editorRef}
          content={editorContent}
          onChange={(text) => setDraft({ content: text, dirty: true })}
          separatorsCommitted={true}
        />
      </div>
    </div>
  );
}
