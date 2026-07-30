import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import type { FamilyNamePrompt } from "../../store/familyTreeStore";

interface FamilyTreeFamilyNamePromptModalProps {
  prompt: FamilyNamePrompt | null;
  onResolve: (names: string[] | null) => void;
}

export default function FamilyTreeFamilyNamePromptModal({
  prompt,
  onResolve,
}: FamilyTreeFamilyNamePromptModalProps) {
  const [draftNames, setDraftNames] = useState<string[]>([]);

  useEffect(() => {
    if (prompt) {
      setDraftNames(prompt.candidates.map((c) => c.suggestedName));
    } else {
      setDraftNames([]);
    }
  }, [prompt]);

  if (!prompt) return null;

  const title =
    prompt.kind === "merge"
      ? "Name merged family"
      : "Name split families";

  const description =
    prompt.kind === "merge"
      ? "Two or more custom-named families merged. Enter a name for the resulting family, or dismiss to use auto-numbering."
      : "A custom-named family split into multiple groups. Name each resulting family, or dismiss to use auto-numbering.";

  return (
    <Modal
      isOpen
      onClose={() => onResolve(null)}
      title={title}
      contentClassName="max-w-md"
    >
      <p className="text-dark-muted text-sm mb-4">{description}</p>
      <div className="space-y-3 mb-4">
        {prompt.candidates.map((candidate, idx) => (
          <div key={candidate.unionIds.join(",")}>
            <label className="block text-xs text-dark-muted uppercase tracking-wide mb-1">
              {prompt.candidates.length > 1 ? `Family ${idx + 1}` : "Family name"}
            </label>
            <input
              type="text"
              value={draftNames[idx] ?? ""}
              onChange={(e) => {
                const next = [...draftNames];
                next[idx] = e.target.value;
                setDraftNames(next);
              }}
              placeholder={`Family ${idx + 1}`}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={() => onResolve(null)}>
          Use auto-names
        </Button>
        <Button
          onClick={() => onResolve(draftNames)}
        >
          Save names
        </Button>
      </div>
    </Modal>
  );
}
