import { useNavigate } from "react-router-dom";
import { MODULE_REGISTRY } from "../../home/moduleRegistry";
import { useAppStore } from "../../store/appStore";
import { createNeuronProject } from "../../home/createProject";
import ComingSoonTooltip from "../home/ComingSoonTooltip";

interface CoreModuleNavbarProps {
  ownerProjectId: string;
  ownerType: "modular" | "standalone";
  neuronId?: string;
  projectName: string;
  activeCoreModule?: "neuron" | null;
}

export default function CoreModuleNavbar({
  ownerProjectId,
  ownerType,
  neuronId,
  projectName,
  activeCoreModule,
}: CoreModuleNavbarProps) {
  const navigate = useNavigate();
  const setNeuronId = useAppStore((s) => s.setNeuronId);

  const coreModules = MODULE_REGISTRY.filter((m) => m.tier === "primary");

  const handleNeuronClick = async () => {
    if (activeCoreModule === "neuron") return;
    let targetId = neuronId;
    if (!targetId) {
      targetId = await createNeuronProject(projectName, ownerProjectId);
      setNeuronId(ownerProjectId, targetId, ownerType);
    }
    navigate(`/neuron/${targetId}`);
  };

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Core modules">
      {coreModules.map((module) => {
        if (module.id === "neuron") {
          const isActive = activeCoreModule === "neuron";
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => void handleNeuronClick()}
              disabled={isActive}
              title={module.label}
              aria-label={module.label}
              aria-current={isActive ? "page" : undefined}
              className={`w-9 h-9 flex items-center justify-center rounded-lg border text-lg transition-colors ${
                isActive
                  ? "bg-dark-accent border-dark-accent cursor-default"
                  : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:bg-dark-accent/40 hover:border-dark-accent"
              }`}
            >
              {module.icon}
            </button>
          );
        }

        return (
          <div
            key={module.id}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-accent/40 bg-dark-accent/20 opacity-60 cursor-not-allowed text-lg"
            title={`${module.label} — coming soon`}
            aria-label={`${module.label} — coming soon`}
          >
            <span>{module.icon}</span>
            <span className="sr-only">
              <ComingSoonTooltip />
            </span>
          </div>
        );
      })}
    </nav>
  );
}
