import { useState } from "react";
import Button from "../ui/Button";
import { convertProjectToFile, isFileBackedProject } from "../../storage/synproj/synprojProjectService";

interface SaveAsSynprojButtonProps {
  projectId: string | null | undefined;
  projectName: string;
  className?: string;
}

export default function SaveAsSynprojButton({
  projectId,
  projectName,
  className,
}: SaveAsSynprojButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!projectId) return null;

  const handleClick = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const alreadyFile = await isFileBackedProject(projectId);
      if (alreadyFile) {
        setMessage("Already saved as file");
        return;
      }
      const fileRef = await convertProjectToFile(projectId, projectName);
      if (fileRef) {
        setMessage("Saved as .synproj file");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save as file failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleClick()}
        disabled={busy}
        title="Convert this project to a .synproj file on disk"
      >
        {busy ? "Saving…" : "Save as file"}
      </Button>
      {message && <span className="text-xs text-dark-muted">{message}</span>}
    </div>
  );
}
