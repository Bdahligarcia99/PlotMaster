import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { useCharacterProfilesStore } from "../../store/characterProfilesStore";
import Button from "../ui/Button";

export default function ProfilesEntitiesPanel() {
  const { id: projectId } = useParams<{ id: string }>();
  const characters = useCharacterProfilesStore((s) => s.characters);
  const selectedCharacterId = useCharacterProfilesStore((s) => s.selectedCharacterId);
  const setSelectedCharacter = useCharacterProfilesStore((s) => s.setSelectedCharacter);
  const removeCharacter = useCharacterProfilesStore((s) => s.removeCharacter);
  const updateCharacterName = useCharacterProfilesStore((s) => s.updateCharacterName);
  const chartLayoutMode = useCharacterProfilesStore((s) => s.chartLayoutMode);
  const editLayoutDirty = useCharacterProfilesStore((s) => s.editLayoutDirty);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null);

  const isCreatingLayout = chartLayoutMode === "createLayout";

  const needsDirtyConfirm =
    chartLayoutMode === "edit" &&
    editLayoutDirty &&
    pendingCharacterId != null &&
    pendingCharacterId !== selectedCharacterId;

  const startEditing = (e: React.MouseEvent, characterId: string, currentName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCharacterId(characterId);
    setDraftName(currentName || "New Character");
  };

  const saveEdit = (characterId: string) => {
    if (!projectId) return;
    const trimmed = draftName.trim() || "New Character";
    updateCharacterName(projectId, characterId, trimmed);
    setEditingCharacterId(null);
  };

  const cancelEdit = () => {
    setEditingCharacterId(null);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingCharacterId != null) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!projectId || !selectedCharacterId) return;
      const target = e.target as HTMLElement;
      if (!panelRef.current?.contains(target)) return;
      if (target.closest("input, textarea, [contenteditable]")) return;
      removeCharacter(projectId, selectedCharacterId);
    },
    [editingCharacterId, projectId, selectedCharacterId, removeCharacter]
  );

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      className="w-[260px] flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden outline-none focus:ring-1 focus:ring-inset focus:ring-dark-accent/50"
    >
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Character profiles</p>
      </div>
      <div className="p-3 border-b border-dark-accent/50">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          readOnly
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {characters.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-1">
            {characters.map((char) =>
              editingCharacterId === char.id ? (
                <div
                  key={char.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-accent/30 bg-dark-accent/30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => saveEdit(char.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(char.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <svg
                    className="w-4 h-4 text-dark-muted flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ) : (
                <div
                  key={char.id}
                  role="button"
                  tabIndex={isCreatingLayout ? -1 : 0}
                  onClick={() => {
                    if (isCreatingLayout) return;
                    if (char.id === selectedCharacterId) return;
                    if (chartLayoutMode === "edit" && editLayoutDirty) {
                      setPendingCharacterId(char.id);
                    } else {
                      setSelectedCharacter(char.id);
                    }
                  }}
                  onDoubleClick={(e) => {
                    if (isCreatingLayout) return;
                    startEditing(e, char.id, char.name);
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                    isCreatingLayout
                      ? "cursor-not-allowed opacity-60 pointer-events-none"
                      : "cursor-pointer hover:bg-dark-accent/30"
                  } ${
                    selectedCharacterId === char.id
                      ? "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500/50"
                      : "border-dark-accent/30"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                  <span className="text-dark-text text-sm flex-1 truncate">{char.name}</span>
                  <svg
                    className="w-4 h-4 text-dark-muted flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {needsDirtyConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                You have unsaved layout changes. Discard and switch character?
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingCharacterId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (pendingCharacterId != null) {
                      setSelectedCharacter(pendingCharacterId);
                      setPendingCharacterId(null);
                    }
                  }}
                >
                  Discard & switch
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
