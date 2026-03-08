import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import { useCharacterProfilesStore } from "../../store/characterProfilesStore";
import { useParams } from "react-router-dom";
import ProfileTemplatesModal, { type TemplateModalMode } from "./ProfileTemplatesModal";

export default function ProfilesToolbar() {
  const { id } = useParams<{ id: string }>();
  const {
    activeProjectId,
    selectedCharacterId,
    characters,
    addCharacter,
    addSection,
    setActiveProject,
  } = useCharacterProfilesStore();

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  const h1Sections = (selectedCharacter?.sections ?? []).filter((s) => !s.parentId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const templateButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      setActiveProject(id);
    } else {
      setActiveProject(null);
    }
    return () => setActiveProject(null);
  }, [id, setActiveProject]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [menuOpen]);

  const handleAddCharacter = () => {
    if (id) addCharacter(id);
  };

  const handleAddTopLevelSection = () => {
    if (id && selectedCharacterId) {
      addSection(id, selectedCharacterId, null);
      setMenuOpen(false);
    }
  };

  const handleAddSubsection = (parentId: string) => {
    if (id && selectedCharacterId) {
      addSection(id, selectedCharacterId, parentId);
      setMenuOpen(false);
    }
  };

  const canAddToCharacter = Boolean(id && selectedCharacterId);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50">
      <div ref={containerRef} className="relative flex rounded-lg overflow-hidden">
        <Button
          variant="primary"
          size="sm"
          onClick={handleAddCharacter}
          disabled={!activeProjectId}
          title={
            activeProjectId
              ? "Add a new character to the entity panel"
              : "No project loaded"
          }
          className="rounded-none border-0 rounded-l-lg"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Character
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="rounded-r-lg px-1.5 py-1.5 text-sm font-medium flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors border-l border-blue-500/50 active:bg-blue-800"
          title="Character options"
          aria-expanded={menuOpen}
          aria-haspopup="true"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {menuOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed py-1 min-w-[220px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: containerRef.current
                  ? containerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: containerRef.current
                  ? containerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  handleAddCharacter();
                  setMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                Add character
              </button>
              <button
                type="button"
                onClick={handleAddTopLevelSection}
                disabled={!canAddToCharacter}
                title={
                  canAddToCharacter
                    ? "Add top-level section (H1) to selected character"
                    : "Select a character first"
                }
                className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 ${
                  canAddToCharacter ? "text-dark-text" : "text-dark-muted cursor-not-allowed"
                }`}
              >
                Top-level section (H1)
              </button>
              {h1Sections.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs text-dark-muted uppercase tracking-wide border-t border-dark-accent/30 mt-1">
                    Subsection under H1
                  </div>
                  {h1Sections.map((h1) => (
                    <button
                      key={h1.id}
                      type="button"
                      onClick={() => handleAddSubsection(h1.id)}
                      disabled={!canAddToCharacter}
                      title={`Add subsection (H2) under "${h1.label}"`}
                      className={`w-full px-3 py-2 pl-5 text-left text-sm hover:bg-dark-accent/50 ${
                        canAddToCharacter ? "text-dark-text" : "text-dark-muted cursor-not-allowed"
                      }`}
                    >
                      Under "{h1.label}" (H2)
                    </button>
                  ))}
                </>
              )}
            </div>,
            document.body
          )}
      </div>

      <div ref={templateButtonRef} className="relative flex rounded-lg overflow-hidden border border-dark-accent/50">
        <Button
          variant="secondary"
          size="sm"
          disabled={!activeProjectId}
          onClick={() => setTemplateModalMode((m) => (m ? null : "save"))}
          title="Save layout as template"
          className="rounded-none border-0 rounded-l-lg"
        >
          Save layout
        </Button>
        <button
          type="button"
          onClick={() => setTemplateModalMode((m) => (m === "load" ? null : "load"))}
          disabled={!activeProjectId}
          className="px-2 py-1.5 text-sm border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-accent/80 text-dark-text disabled:opacity-50 transition-colors"
          title="Load template"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => setTemplateModalMode((m) => (m === "manage" ? null : "manage"))}
          disabled={!activeProjectId}
          className="rounded-r-lg px-2 py-1.5 text-sm border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-accent/80 text-dark-text disabled:opacity-50 transition-colors"
          title="Manage templates"
        >
          Templates
        </button>
      </div>

      <ProfileTemplatesModal
        projectId={id ?? null}
        selectedCharacterId={selectedCharacterId}
        mode={templateModalMode}
        onClose={() => setTemplateModalMode(null)}
        anchorRef={templateButtonRef}
      />
    </div>
  );
}
