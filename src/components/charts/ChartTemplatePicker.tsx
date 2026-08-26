import Button from "../ui/Button";
import { useChartsStore, type ChartLayoutTemplate } from "../../store/chartsStore";

interface ChartTemplatePickerProps {
  projectId: string;
  characterId: string;
  characterName: string;
}

function countH1Sections(template: ChartLayoutTemplate): number {
  return (template.sections ?? []).filter((s) => (s.parentId ?? null) === null).length;
}

export default function ChartTemplatePicker({
  projectId,
  characterId,
  characterName,
}: ChartTemplatePickerProps) {
  const templates = useChartsStore((s) => s.listTemplates(projectId));
  const loadTemplateForEditing = useChartsStore((s) => s.loadTemplateForEditing);
  const applyTemplateToCharacter = useChartsStore((s) => s.applyTemplateToCharacter);
  const setChartLayoutMode = useChartsStore((s) => s.setChartLayoutMode);

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-dark-muted text-sm max-w-md">
          No layout templates yet. Create a layout to define the structure for this chart.
        </p>
        <Button
          variant="primary"
          size="sm"
          className="mt-4"
          onClick={() => setChartLayoutMode("createLayout")}
        >
          Create first layout
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4">
      <p className="text-dark-muted text-sm mb-4">
        Choose a layout template for <span className="text-dark-text font-medium">{characterName}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((template) => {
          const h1Count = countH1Sections(template);
          const dateLabel = template.createdAt
            ? new Date(template.createdAt).toLocaleDateString()
            : null;
          return (
            <div
              key={template.id}
              className="group relative rounded-xl border border-dark-accent/50 bg-dark-bg/40 p-4 min-h-[120px] hover:border-blue-500/50 transition-colors"
            >
              <div className="pr-2">
                <h3 className="text-sm font-medium text-dark-text truncate">{template.name}</h3>
                {dateLabel && (
                  <p className="text-xs text-dark-muted mt-1">{dateLabel}</p>
                )}
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
                  Apply to &quot;{characterName}&quot;
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
        })}
      </div>
    </div>
  );
}
