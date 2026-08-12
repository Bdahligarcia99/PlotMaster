import { useEffect, useMemo, useRef, useState } from "react";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "./beatEditor/BeatDocumentEditorView";
import { getSelectedBeatIds, lineReferencesTimelineEntity, useTimelineStore } from "../../store/timelineStore";
import type { TextEditorDrafts } from "./TimelineTextEditorWorkspace";

interface TimelineScriptPaneProps {
  drafts: TextEditorDrafts;
  onDraftsChange: (drafts: TextEditorDrafts) => void;
}

/** Given a document's text and a set of entity IDs (beats/lanes), returns the 0-based line
 * indices that should be highlighted. A match on a header line that opens a `{ ... }` block also
 * highlights the rest of that block, matching the old View pane's behavior. */
function computeHighlightLines(content: string, entityIds: Set<string>): number[] {
  if (entityIds.size === 0) return [];
  const lines = content.split("\n");
  const result: number[] = [];
  let insideHighlightedBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (insideHighlightedBlock) {
      result.push(i);
      if (trimmed === "}") insideHighlightedBlock = false;
      continue;
    }
    const matches = [...entityIds].some((id) => lineReferencesTimelineEntity(line, id));
    if (matches) {
      result.push(i);
      if (trimmed.endsWith("{")) insideHighlightedBlock = true;
    }
  }
  return result;
}

export default function TimelineScriptPane({ drafts, onDraftsChange }: TimelineScriptPaneProps) {
  const documents = useTimelineStore((s) => s.documents);
  const folders = useTimelineStore((s) => s.folders);
  const activeFolderId = useTimelineStore((s) => s.activeFolderId);
  const selection = useTimelineStore((s) => s.selection);

  const [copied, setCopied] = useState(false);
  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());

  const folderScoped = folders.length > 0;
  const folderDocs = useMemo(
    () =>
      folderScoped
        ? documents.filter((d) => d.folderId === activeFolderId)
        : documents,
    [documents, folderScoped, activeFolderId]
  );

  const getDocContent = (docId: string): string => {
    const draft = drafts[docId];
    if (draft?.dirty) return draft.content;
    return documents.find((d) => d.id === docId)?.content ?? "";
  };

  const setContent = (docId: string, content: string) => {
    onDraftsChange({
      ...drafts,
      [docId]: { content, dirty: true },
    });
  };

  const highlightEntityIds = useMemo(
    () =>
      new Set([
        ...getSelectedBeatIds(selection),
        ...selection.filter((s) => s.type === "lane").map((s) => s.id),
      ]),
    [selection]
  );

  useEffect(() => {
    for (const doc of folderDocs) {
      const handle = editorRefs.current.get(doc.id);
      if (!handle) continue;
      const content = getDocContent(doc.id);
      const lines = computeHighlightLines(content, highlightEntityIds);
      handle.setHighlightLines(lines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightEntityIds, folderDocs, drafts, documents]);

  const handleCopy = async () => {
    try {
      const combined = folderDocs.map((d) => getDocContent(d.id)).join("\n\n");
      await navigator.clipboard.writeText(combined);
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
      <div className="flex-1 min-h-0 overflow-auto">
        {folderDocs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dark-muted text-sm px-4 text-center">
            No files in this outline yet.
          </div>
        ) : (
          folderDocs.map((doc) => {
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
