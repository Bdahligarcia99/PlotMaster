import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";
import { useAppStore } from "../store/appStore";
import { MODULE_TYPES } from "../constants";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const navigate = useNavigate();
  const createProject = useAppStore((s) => s.createProject);

  const [name, setName] = useState("");
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());

  const toggleModule = (module: string) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const id = createProject(trimmedName, Array.from(enabledModules));
    onClose();
    navigate(`/projects/${id}`);
  };

  const handleClose = () => {
    setName("");
    setEnabledModules(new Set());
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Modular Project">
      <form onSubmit={handleSubmit}>
        <Input
          label="Modular Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My modular project..."
          required
        />
        <div className="mb-4">
          <label className="block text-dark-muted text-sm mb-2">
            Select Modules (none pre-selected)
          </label>
          <div className="space-y-2">
            {MODULE_TYPES.map((m) => (
              <Checkbox
                key={m}
                label={m}
                checked={enabledModules.has(m)}
                onChange={() => toggleModule(m)}
              />
            ))}
          </div>
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
            Create Modular Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
