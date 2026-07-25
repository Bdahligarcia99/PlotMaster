import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import { MODULE_REGISTRY } from "../../home/moduleRegistry";
import { getModuleRoute } from "../../home/moduleRoutes";

interface ModuleSwitcherNavbarProps {
  /** Current sub-project id (the route param for the active module). */
  currentProjectId: string;
}

const MODULE_TYPE_TO_REGISTRY_ID: Record<string, string> = {
  "Family Tree": "familyTree",
  Profiles: "characters",
  Timeline: "timeline",
  Ideas: "ideaPlayground",
};

export default function ModuleSwitcherNavbar({ currentProjectId }: ModuleSwitcherNavbarProps) {
  const navigate = useNavigate();
  const modularProjects = useAppStore((s) => s.modularProjects);

  const modularProject = modularProjects.find((p) =>
    Object.values(p.subProjects ?? {}).includes(currentProjectId)
  );

  if (!modularProject) return null;

  const entries = Object.entries(modularProject.subProjects ?? {});
  if (entries.length < 2) return null;

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Switch module"
    >
      {entries.map(([moduleType, subId]) => {
        const registryId = MODULE_TYPE_TO_REGISTRY_ID[moduleType];
        const moduleMeta = MODULE_REGISTRY.find((m) => m.id === registryId);
        const isActive = subId === currentProjectId;
        const label = moduleMeta?.label ?? moduleType;

        return (
          <button
            key={moduleType}
            type="button"
            onClick={() => {
              if (!isActive) navigate(getModuleRoute(moduleType, subId));
            }}
            disabled={isActive}
            title={label}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={`w-9 h-9 flex items-center justify-center rounded-lg border text-lg transition-colors ${
              isActive
                ? "bg-dark-accent border-dark-accent cursor-default"
                : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:bg-dark-accent/40 hover:border-dark-accent"
            }`}
          >
            {moduleMeta?.icon ?? "•"}
          </button>
        );
      })}
    </nav>
  );
}
