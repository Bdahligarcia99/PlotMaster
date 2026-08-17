import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "../timeline/beatEditor/BeatDocumentEditorView";
import {
  getDocumentsForFamily,
  getUnassignedDocuments,
} from "../../store/familyTreeDocumentHelpers";
import { useFamilyTreeStore } from "../../store/familyTreeStore";
import type { TextEditorDrafts } from "./FamilyTreeTextEditorWorkspace";

/** Escape string for use in RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

interface FamilyTreeScriptPaneProps {
  drafts: TextEditorDrafts;
  onDraftsChange: (drafts: TextEditorDrafts) => void;
}

export default function FamilyTreeScriptPane({ drafts, onDraftsChange }: FamilyTreeScriptPaneProps) {
  const documents = useFamilyTreeStore((s) => s.documents);
  const families = useFamilyTreeStore((s) => s.families);
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const activeFamilyTabId = useFamilyTreeStore((s) => s.activeFamilyTabId);
  const selectedNodeIds = useFamilyTreeStore((s) => s.selectedNodeIds);
  const getDocumentDisplayContent = useFamilyTreeStore((s) => s.getDocumentDisplayContent);
  const applyFamilyDocumentEdits = useFamilyTreeStore((s) => s.applyFamilyDocumentEdits);

  const [commitError, setCommitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const familyScopedDocs = useMemo(() => {
    if (documents.length === 0) return [];
    if (activeFamilyTabId == null) return documents;
    return getDocumentsForFamily(documents, activeFamilyTabId, families, nodes, edges);
  }, [documents, activeFamilyTabId, families, nodes, edges]);

  const showUnassigned =
    activeFamilyTabId == null &&
    getUnassignedDocuments(documents, families, nodes, edges).length > 0;

  const visibleDocs = useMemo(() => {
    if (activeFamilyTabId != null) return familyScopedDocs;
    if (showUnassigned) return documents;
    return documents.filter(
      (d) => getUnassignedDocuments([d], families, nodes, edges).length === 0 || documents.length === 1
    );
  }, [activeFamilyTabId, familyScopedDocs, showUnassigned, documents, families, nodes, edges]);

  const getDocContent = useCallback(
    (docId: string): string => {
      const draft = drafts[docId];
      if (draft?.dirty) return draft.content;
      return getDocumentDisplayContent(docId);
    },
    [drafts, getDocumentDisplayContent]
  );

  const commitAllDirtyDrafts = useCallback((): { ok: boolean } => {
    const dirtyEdits = Object.entries(drafts)
      .filter(([, d]) => d.dirty)
      .map(([docId, draft]) => ({ docId, content: draft.content }));
    if (dirtyEdits.length === 0) {
      setCommitError(null);
      return { ok: true };
    }
    const result = applyFamilyDocumentEdits(dirtyEdits);
    if (!result.ok) {
      setCommitError(result.errors.join("; "));
      return { ok: false };
    }
    const nextDrafts = { ...drafts };
    for (const { docId } of dirtyEdits) delete nextDrafts[docId];
    onDraftsChange(nextDrafts);
    setCommitError(null);
    return { ok: true };
  }, [drafts, onDraftsChange, applyFamilyDocumentEdits]);

  const commitRef = useRef(commitAllDirtyDrafts);
  commitRef.current = commitAllDirtyDrafts;

  const hasDraftChanges = Object.values(drafts).some((d) => d.dirty);

  useEffect(() => {
    if (!hasDraftChanges) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitRef.current();
    }, 800);
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, [drafts, hasDraftChanges]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitRef.current();
    };
  }, []);

  const highlightNodeIds = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  useEffect(() => {
    for (const doc of visibleDocs) {
      const handle = editorRefs.current.get(doc.id);
      if (!handle) continue;
      const content = getDocContent(doc.id);
      handle.setHighlightLines(computeHighlightLines(content, highlightNodeIds));
    }
  }, [highlightNodeIds, visibleDocs, drafts, getDocContent]);

  const handleCopy = async () => {
    try {
      const combined = visibleDocs.map((d) => getDocContent(d.id)).join("\n\n");
      await navigator.clipboard.writeText(combined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignored */
    }
  };

  const setContent = (docId: string, content: string) => {
    onDraftsChange({
      ...drafts,
      [docId]: { content, dirty: true },
    });
    setCommitError(null);
  };

  if (documents.length === 0) {
    return (
      <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-accent/50 shrink-0">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
          No script files yet. Add nodes on the canvas to seed family files.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
          <span className="text-dark-accent/50">|</span>
          <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Code</span>
          {hasDraftChanges ? (
            <span className="text-xs text-amber-400/90">· Unsaved</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-dark-muted hover:text-dark-text px-2 py-1 rounded border border-dark-accent/50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {commitError && (
        <div className="px-3 py-2 text-xs text-red-400 border-b border-red-500/30 bg-red-500/10 shrink-0">
          {commitError}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        {visibleDocs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-muted text-sm px-4 text-center">
            No files for this family yet.
          </div>
        ) : (
          visibleDocs.map((doc) => {
            const content = getDocContent(doc.id);
            const dirty = drafts[doc.id]?.dirty ?? false;
            return (
              <div key={doc.id} className="border-b border-dark-accent/40">
                <div className="px-3 py-1.5 text-xs font-medium text-dark-muted uppercase tracking-wide border-b border-dark-accent/30 sticky top-0 bg-dark-surface z-10 flex items-center gap-2">
                  <span className="flex-1 truncate">
                    {doc.name}
                    {dirty ? " · Unsaved" : ""}
                  </span>
                </div>
                <div className="min-h-[240px] h-[36vh] px-3 pb-3 pt-2 flex flex-col">
                  <BeatDocumentEditorView
                    ref={(handle) => {
                      editorRefs.current.set(doc.id, handle);
                    }}
                    content={content}
                    onChange={(text) => setContent(doc.id, text)}
                    separatorsCommitted={true}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
