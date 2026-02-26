import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./ui/Modal";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import { useAppStore } from "../store/appStore";
import { MODULE_TYPES } from "../constants";

interface NewStandaloneProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultModuleType?: string;
}

export default function NewStandaloneProjectModal({
  isOpen,
  onClose,
  defaultModuleType = "Timeline",
}: NewStandaloneProjectModalProps) {
  const navigate = useNavigate();
  const createStandaloneProject = useAppStore((s) => s.createStandaloneProject);

  const [name, setName] = useState("");
  const [moduleType, setModuleType] = useState(defaultModuleType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const id = createStandaloneProject(trimmedName, moduleType);
    onClose();
    navigate(`/project/${id}`);
  };

  const handleClose = () => {
    setName("");
    setModuleType(defaultModuleType);
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
          options={MODULE_TYPES.filter((m) => m !== "Family Tree").map((m) => ({ value: m, label: m }))}
        />

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
