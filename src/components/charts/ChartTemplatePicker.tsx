import { useMemo } from "react";
import Button from "../ui/Button";
import { useChartsStore, type ChartLayoutTemplate } from "../../store/chartsStore";
import { sortByOrder } from "../../store/chartsDocumentHelpers";

interface ChartTemplatePickerProps {
  projectId: string;
  characterId: string;
  characterName: string;
}

function countH1Sections(template: ChartLayoutTemplate): number {
  return (template.sections ?? []).filter((s) => (s.parentId ?? null) === null).length;
}

function TemplateTile({
  template,
  projectId,
  characterId,
  characterName,
}: {
  template: ChartLayoutTemplate;
  projectId: string;
  characterId: string;
  characterName: string;
}) {
  const loadTemplateForEditing = useChartsStore((s) => s.loadTemplateForEditing);
  const applyTemplateToCharacter = useChartsStore((s) => s.applyTemplateToCharacter);

  const h1Count = countH1Sections(template);
  const dateLabel = template.createdAt
    ? new Date(template.createdAt).toLocaleDateString()
    : null;

  return (
    <div className="group relative rounded-xl border border-dark-accent/50 bg-dark-bg/40 p-4 min-h-[120px] hover:border-blue-500/50 transition-colors">
      <div className="pr-2">
        <h3 className="text-sm font-medium text-dark-text truncate">{template.name}</h3>
        {dateLabel && <p className="text-xs text-dark-muted mt-1">{dateLabel}</p>}
        <p className="text-xs text-dark-muted mt-2">
          {h1Count === 0 ? "No sections" : `${h1Count} top-level section${h1Count === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className="absolute inset-0 rounded-xl bg-dark-bg/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
        <Button
          variant="secondary"
          size="sm"
          className="w-full max-w-[200px]"
          onClick={() => loadTemplateForEditing(projectId, template.id)}
        >
          View
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="w-full max-w-[200px]"
          onClick={() =>
            applyTemplateToCharacter(projectId, characterId, template.id, "replace")
          }
        >
          Copy to &quot;{characterName}&quot;
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-full max-w-[200px]"
          onClick={() =>
            applyTemplateToCharacter(projectId, characterId, template.id, "link")
          }
        >
          Link to &quot;{characterName}&quot;
        </Button>
      </div>
    </div>
  );
}

function NewLayoutTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border-2 border-dashed border-dark-accent/50 bg-dark-bg/20 p-4 min-h-[120px] flex flex-col items-center justify-center gap-2 text-dark-muted hover:text-dark-text hover:border-blue-500/50 hover:bg-dark-accent/20 transition-colors"
    >
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-sm font-medium">New layout</span>
    </button>
  );
}

export default function ChartTemplatePicker({
  projectId,
  characterId,
  characterName,
}: ChartTemplatePickerProps) {
  const templates = useChartsStore((s) => s.listTemplates(projectId));
  const folders = useChartsStore((s) => s.folders);
  const documents = useChartsStore((s) => s.documents);
  const setChartLayoutMode = useChartsStore((s) => s.setChartLayoutMode);

  const layoutGroups = useMemo(() => {
    const layoutFolders = sortByOrder(folders.filter((f) => f.kind === "layout"));
    const fallbackFolderId = layoutFolders[0]?.id ?? null;
    const templateFolderById = new Map<string, string>();
    for (const doc of documents) {
      if (doc.kind === "layout" && doc.templateId) {
        templateFolderById.set(doc.templateId, doc.folderId);
      }
    }

    const byFolder = new Map<string, ChartLayoutTemplate[]>();
    for (const folder of layoutFolders) {
      byFolder.set(folder.id, []);
    }
    for (const template of templates) {
      const folderId =
        templateFolderById.get(template.id) ?? fallbackFolderId;
      if (!folderId) continue;
      if (!byFolder.has(folderId)) {
        byFolder.set(folderId, []);
      }
      byFolder.get(folderId)!.push(template);
    }

    return layoutFolders
      .map((folder) => ({
        folder,
        templates: byFolder.get(folder.id) ?? [],
      }))
      .filter((g) => g.templates.length > 0);
  }, [folders, documents, templates]);

  const showFolderDividers = layoutGroups.length > 1;
  const handleNewLayout = () => setChartLayoutMode("createLayout");

  return (
    <div className="py-4">
      <p className="text-dark-muted text-sm mb-4">
        Choose a layout template for{" "}
        <span className="text-dark-text font-medium">{characterName}</span>
      </p>

      {showFolderDividers ? (
        <div className="space-y-6">
          {layoutGroups.map((group, index) => (
            <div key={group.folder.id}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-medium text-dark-muted uppercase tracking-wide shrink-0">
                  {group.folder.name}
                </span>
                <div className="flex-1 border-t border-dark-accent/40" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {group.templates.map((template) => (
                  <TemplateTile
                    key={template.id}
                    template={template}
                    projectId={projectId}
                    characterId={characterId}
                    characterName={characterName}
                  />
                ))}
                {index === layoutGroups.length - 1 && (
                  <NewLayoutTile onClick={handleNewLayout} />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {(layoutGroups[0]?.templates ?? templates).map((template) => (
            <TemplateTile
              key={template.id}
              template={template}
              projectId={projectId}
              characterId={characterId}
              characterName={characterName}
            />
          ))}
          <NewLayoutTile onClick={handleNewLayout} />
        </div>
      )}
    </div>
  );
}
