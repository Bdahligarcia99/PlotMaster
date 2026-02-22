import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import { useAppStore } from "../store/appStore";
import { MODULE_TYPES } from "../constants";

interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewWorkspaceModal({ isOpen, onClose }: NewWorkspaceModalProps) {
  const navigate = useNavigate();
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const projects = useAppStore((s) => s.projects);

  const [name, setName] = useState("");
  const [moduleType, setModuleType] = useState("Timeline");
  const [attachment, setAttachment] = useState<"standalone" | "project">("standalone");
  const [attachedProjectId, setAttachedProjectId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const id = createWorkspace(
      trimmedName,
      moduleType,
      attachment === "project" && attachedProjectId ? attachedProjectId : undefined
    );
    onClose();
    navigate(`/workspaces/${id}`);
  };

  const handleClose = () => {
    setName("");
    setModuleType("Timeline");
    setAttachment("standalone");
    setAttachedProjectId("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Project">
      <form onSubmit={handleSubmit}>
        <Input
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My project..."
          required
        />
        <Select
          label="Module Type"
          value={moduleType}
          onChange={(e) => setModuleType(e.target.value)}
          options={MODULE_TYPES.map((m) => ({ value: m, label: m }))}
        />

        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">Attachment</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="attachment"
                checked={attachment === "standalone"}
                onChange={() => setAttachment("standalone")}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-dark-text">Standalone (default)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="attachment"
                checked={attachment === "project"}
                onChange={() => setAttachment("project")}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-dark-text">Attach to Modular Project</span>
            </label>
          </div>
          {attachment === "project" && projects.length > 0 && (
            <div className="mt-2 ml-7">
              <Select
                value={attachedProjectId}
                onChange={(e) => setAttachedProjectId(e.target.value)}
                options={[
                  { value: "", label: "Select modular project..." },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
          )}
          {attachment === "project" && projects.length === 0 && (
            <p className="text-dark-muted text-xs mt-2 ml-7">
              No modular projects exist. Create a modular project first.
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button type="button" variant="ghost" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={!name.trim()}
          >
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
