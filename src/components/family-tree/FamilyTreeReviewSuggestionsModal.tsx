import { useState, useCallback, useEffect, useMemo } from "react";
import type { Node } from "reactflow";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import {
  type NameRoleSuggestion,
  type PersonNodeData,
  getPersonDisplayName,
} from "../../store/familyTreeStore";

interface FamilyTreeReviewSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: NameRoleSuggestion[];
  nodes: Node<{ kind: string; data?: PersonNodeData }>[];
  onApply: (items: { s: NameRoleSuggestion; idx: number }[], resolvedValues: Map<number, string>) => void;
  /** Called when modal opens – run analysis to refresh suggestions. */
  onOpen?: () => void;
}

export default function FamilyTreeReviewSuggestionsModal({
  isOpen,
  onClose,
  suggestions,
  nodes,
  onApply,
  onOpen,
}: FamilyTreeReviewSuggestionsModalProps) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [resolvedValues, setResolvedValues] = useState<Map<number, string>>(new Map());

  const actionableIndices = useMemo(
    () =>
      suggestions
        .map((s, i) =>
          s.field === "unionHealth" || s.field === "genConflict" || s.field === "unassigned" ? -1 : i
        )
        .filter((i) => i >= 0),
    [suggestions]
  );

  useEffect(() => {
    if (isOpen) {
      onOpen?.();
    }
  }, [isOpen, onOpen]);

  useEffect(() => {
    if (isOpen) {
      setChecked(new Set(actionableIndices));
      setResolvedValues(new Map());
    }
  }, [isOpen, suggestions, actionableIndices]);

  const getNodeName = useCallback(
    (nodeId: string) => {
      const n = nodes.find((x) => x.id === nodeId);
      const data = n?.data as PersonNodeData | undefined;
      return data ? getPersonDisplayName(data, nodeId, nodes) : nodeId;
    },
    [nodes]
  );

  const needsRoleChoice = (s: NameRoleSuggestion): boolean =>
    s.field === "firstName" && s.proposedValue === "Mr./Mrs.";
  const needsFatherMotherChoice = (s: NameRoleSuggestion): boolean =>
    s.field === "role" && s.proposedValue === "father/mother";
  const isInformational = (s: NameRoleSuggestion): boolean =>
    s.field === "unionHealth" || s.field === "genConflict" || s.field === "unassigned";

  const getEffectiveProposed = (s: NameRoleSuggestion, idx: number): string => {
    const r = resolvedValues.get(idx);
    if (r) return r;
    if (needsRoleChoice(s)) return "Mr.";
    if (needsFatherMotherChoice(s)) return "father";
    return s.proposedValue;
  };

  const setResolved = (idx: number, value: string) => {
    setResolvedValues((prev) => {
      const next = new Map(prev);
      next.set(idx, value);
      return next;
    });
  };

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => setChecked(new Set(actionableIndices));
  const deselectAll = () => setChecked(new Set());

  const handleApplySelected = () => {
    const items = suggestions
      .map((s, i) => ({ s, idx: i }))
      .filter(({ s, idx }) => checked.has(idx) && !isInformational(s));
    onApply(items, resolvedValues);
    onClose();
  };

  const handleApplyAll = () => {
    const items = suggestions
      .map((s, i) => ({ s, idx: i }))
      .filter(({ s }) => !isInformational(s));
    onApply(items, resolvedValues);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Suggested changes" contentClassName="max-w-3xl max-h-[80vh] flex flex-col">
      <div className="overflow-auto flex-1 min-h-0 mb-4">
        {suggestions.length === 0 ? (
          <p className="text-dark-muted py-4">No suggestions at this time.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-dark-accent/50 text-dark-muted text-xs uppercase tracking-wide">
                <th className="py-2 pr-2 w-8" />
                <th className="py-2 pr-4">Node</th>
                <th className="py-2 pr-4">Current</th>
                <th className="py-2 pr-4">Proposed</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-dark-accent/30 hover:bg-dark-accent/20 ${
                    isInformational(s) ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="py-2 pr-2 align-top">
                    {isInformational(s) ? (
                      <span className="text-dark-muted text-xs">—</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={checked.has(idx)}
                        onChange={() => toggle(idx)}
                        className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50 mt-0.5"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4 text-dark-text font-medium">
                    {isInformational(s) && s.unionId ? (
                      <>
                        Union
                        <span className="text-dark-muted font-normal ml-1">({s.unionId})</span>
                      </>
                    ) : (
                      <>
                        {getNodeName(s.nodeId)}
                        <span className="text-dark-muted font-normal ml-1">({s.nodeId})</span>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-dark-muted">
                    {s.currentValue || "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {needsRoleChoice(s) ? (
                      <select
                        value={resolvedValues.get(idx) ?? "Mr."}
                        onChange={(e) => setResolved(idx, e.target.value)}
                        className="px-2 py-1 text-sm bg-dark-bg border border-dark-accent/50 rounded text-dark-text focus:outline-none focus:border-blue-500"
                      >
                        <option value="Mr.">Mr.</option>
                        <option value="Mrs.">Mrs.</option>
                      </select>
                    ) : needsFatherMotherChoice(s) ? (
                      <select
                        value={resolvedValues.get(idx) ?? "father"}
                        onChange={(e) => setResolved(idx, e.target.value)}
                        className="px-2 py-1 text-sm bg-dark-bg border border-dark-accent/50 rounded text-dark-text focus:outline-none focus:border-blue-500"
                      >
                        <option value="father">Father</option>
                        <option value="mother">Mother</option>
                      </select>
                    ) : (
                      <span className="text-dark-text">{getEffectiveProposed(s, idx)}</span>
                    )}
                  </td>
                  <td className="py-2 text-dark-muted text-xs">{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {actionableIndices.length > 0 ? (
        <div className="flex items-center justify-between gap-4 flex-shrink-0 pt-2 border-t border-dark-accent/50">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Select all
            </button>
            <span className="text-dark-muted">|</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Deselect all
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplySelected}
              disabled={checked.size === 0}
            >
              Apply selected ({checked.size})
            </Button>
            <Button variant="primary" size="sm" onClick={handleApplyAll}>
              Apply all
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end flex-shrink-0 pt-2 border-t border-dark-accent/50">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      )}
    </Modal>
  );
}
