import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import {
  canFormCrossing,
  connectionMatchesBeatSet,
  getSelectedBeat,
  resolveLaneIdFromSelection,
  useTimelineStore,
  ZOOM_LANE_COUNT_STEPS,
} from "../../store/timelineStore";
import {
  BEAT_WIDTH_PERCENT_MAX,
  BEAT_WIDTH_PERCENT_MIN,
  EXPANDED_BEAT_HEIGHT_MAX,
  EXPANDED_BEAT_HEIGHT_MIN,
} from "../../store/timelineTypes";

interface TimelineToolbarProps {
  onSelectForEdit?: () => void;
}

export default function TimelineToolbar({ onSelectForEdit }: TimelineToolbarProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const selection = useTimelineStore((s) => s.selection);
  const zoomLaneCount = useTimelineStore((s) => s.zoomLaneCount);
  const beatWidthPercent = useTimelineStore((s) => s.beatWidthPercent);
  const beatsExpanded = useTimelineStore((s) => s.beatsExpanded);
  const expandedBeatHeightPx = useTimelineStore((s) => s.expandedBeatHeightPx);
  const beatPlacementMode = useTimelineStore((s) => s.beatPlacementMode);
  const requireAnchorSelection = useTimelineStore((s) => s.requireAnchorSelection);
  const addLane = useTimelineStore((s) => s.addLane);
  const addBeat = useTimelineStore((s) => s.addBeat);
  const addAnchorBeat = useTimelineStore((s) => s.addAnchorBeat);
  const addStoryBeatBeforeFirstAnchor = useTimelineStore((s) => s.addStoryBeatBeforeFirstAnchor);
  const addStoryBeatBeforeAnchor = useTimelineStore((s) => s.addStoryBeatBeforeAnchor);
  const insertStoryBeatRelativeToBeat = useTimelineStore((s) => s.insertStoryBeatRelativeToBeat);
  const convertBeatToStory = useTimelineStore((s) => s.convertBeatToStory);
  const connections = useTimelineStore((s) => s.connections);
  const toggleConnection = useTimelineStore((s) => s.toggleConnection);
  const setZoomLaneCount = useTimelineStore((s) => s.setZoomLaneCount);
  const setBeatWidthPercent = useTimelineStore((s) => s.setBeatWidthPercent);
  const setBeatsExpanded = useTimelineStore((s) => s.setBeatsExpanded);
  const setExpandedBeatHeightPx = useTimelineStore((s) => s.setExpandedBeatHeightPx);
  const setBeatPlacementMode = useTimelineStore((s) => s.setBeatPlacementMode);
  const setRequireAnchorSelection = useTimelineStore((s) => s.setRequireAnchorSelection);
  const [message, setMessage] = useState<string | null>(null);
  const [beatMenuOpen, setBeatMenuOpen] = useState(false);
  const beatContainerRef = useRef<HTMLDivElement>(null);
  const beatDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  useEffect(() => {
    if (!beatMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = beatContainerRef.current?.contains(target);
      const inDropdown = beatDropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) setBeatMenuOpen(false);
    };
    const t = setTimeout(
      () => document.addEventListener("click", handleClickOutside, { once: true }),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [beatMenuOpen]);

  // Beat creation now requires an explicitly active lane or beat selection — no silent fallback
  // to "the first lane." The new beat always lands in that selection's corresponding lane.
  const primarySelection = selection[0] ?? null;
  const hasActiveTarget =
    primarySelection !== null && (primarySelection.type === "lane" || primarySelection.type === "beat");
  const targetLaneId = hasActiveTarget ? resolveLaneIdFromSelection(lanes, beats, selection) : null;
  const canCreateBeats = hasActiveTarget && targetLaneId !== null;

  const selectedBeat = getSelectedBeat(beats, selection);

  const laneAnchors = targetLaneId
    ? beats.filter((b) => b.laneId === targetLaneId && b.kind === "anchor")
    : [];
  const anchorSpecified = Boolean(
    selectedBeat && selectedBeat.kind === "anchor" && selectedBeat.laneId === targetLaneId
  );
  // Only the default "auto" smart placement is genuinely ambiguous when 2+ anchors exist in the
  // lane — explicit Above/Below placement and the Empty Beat/Anchor Beat dropdown items are never
  // gated by this checkbox (each already has an unambiguous target).
  const multiAnchorBlockActive =
    requireAnchorSelection &&
    beatPlacementMode === "auto" &&
    selectedBeat?.kind !== "empty" &&
    laneAnchors.length >= 2 &&
    !anchorSpecified;

  const canAddBeat = canCreateBeats && !multiAnchorBlockActive;

  const selectedBeats = selection.filter((s) => s.type === "beat");
  const selectedBeatIds = selectedBeats.map((s) => s.id);
  const crossingCheck = canFormCrossing(selectedBeatIds, beats);
  const canConnect = crossingCheck.ok;
  const setAlreadyConnected =
    canConnect && connections.some((c) => connectionMatchesBeatSet(c, selectedBeatIds));

  const getCrossingTooltip = (): string => {
    if (selectedBeats.length < 2) {
      return "Select two or more beats (shift-click) on different lanes to connect them";
    }
    if (crossingCheck.reason === "same-lane") {
      return "Each beat in a crossing must be on a different lane — you have two selected beats in the same lane";
    }
    if (crossingCheck.reason === "empty-beat") {
      return "Empty beats can't be part of a crossing — deselect them first";
    }
    if (canConnect && setAlreadyConnected) {
      return "Remove the crossing between the selected beats";
    }
    if (canConnect) {
      return "Connect the selected beats";
    }
    return "Select two or more beats (shift-click) on different lanes to connect them";
  };

  const handleAddBeat = () => {
    if (!canCreateBeats) {
      setMessage("Select a lane or beat first.");
      return;
    }

    // Promoting an already-selected ghost always wins, regardless of placement mode.
    if (selectedBeat && selectedBeat.kind === "empty") {
      const ok = convertBeatToStory(selectedBeat.id);
      setMessage(ok ? "Ghost beat promoted to a real beat." : "Could not convert that beat.");
      if (ok) onSelectForEdit?.();
      return;
    }

    if (beatPlacementMode !== "auto") {
      if (!selectedBeat) {
        setMessage(`Select a beat to place a new one ${beatPlacementMode} it.`);
        return;
      }
      const id = insertStoryBeatRelativeToBeat(selectedBeat.id, beatPlacementMode);
      if (!id) {
        setMessage("Could not place that beat.");
        return;
      }
      setMessage(`Beat placed ${beatPlacementMode} the selected beat.`);
      onSelectForEdit?.();
      return;
    }

    if (multiAnchorBlockActive) {
      setMessage("This lane has multiple anchors — select the anchor to insert before.");
      return;
    }

    if (anchorSpecified && selectedBeat) {
      const id = addStoryBeatBeforeAnchor(selectedBeat.id);
      if (!id) {
        setMessage("Could not add that beat.");
        return;
      }
      setMessage("Beat added.");
      onSelectForEdit?.();
      return;
    }

    const id = addStoryBeatBeforeFirstAnchor();
    if (!id) {
      setMessage("Select a lane or beat first.");
      return;
    }
    setMessage("Beat added.");
    onSelectForEdit?.();
  };

  const handleAddBeatFromMenu = (kind: "story" | "empty") => {
    if (!canCreateBeats) {
      setMessage("Select a lane or beat first.");
      return;
    }
    const id = addBeat(undefined, kind);
    if (!id) {
      setMessage("Select a lane or beat first.");
      return;
    }
    setMessage(kind === "empty" ? "Empty beat added." : "Beat added.");
    setBeatMenuOpen(false);
    onSelectForEdit?.();
  };

  const handleAddAnchorBeat = () => {
    if (!canCreateBeats) {
      setMessage("Select a lane or beat first.");
      return;
    }
    const id = addAnchorBeat();
    if (!id) {
      setMessage("Select a lane or beat first.");
      return;
    }
    setMessage("Anchor beat added.");
    setBeatMenuOpen(false);
    onSelectForEdit?.();
  };

  const primaryAddBeatTitle = (): string => {
    if (!canCreateBeats) return "Select a lane or beat first — the new beat goes in that lane";
    if (selectedBeat?.kind === "empty") return "Convert the selected ghost beat into a real beat";
    if (beatPlacementMode !== "auto") {
      return selectedBeat
        ? `New beat, placed directly ${beatPlacementMode} the selected beat`
        : `Select a beat to place a new beat ${beatPlacementMode} it`;
    }
    if (multiAnchorBlockActive) {
      return "This lane has multiple anchors — select the anchor to insert before";
    }
    if (anchorSpecified) return "New beat, inserted before the selected anchor";
    return "New beat (inserts before the lane's oldest anchor beat, if any)";
  };

  const handleConnect = () => {
    if (!canConnect) return;
    const result = toggleConnection(selectedBeatIds);
    if (!result.connectionId) {
      setMessage("Could not connect those beats.");
      return;
    }
    setMessage(result.created ? "Crossing connected." : "Crossing removed.");
  };

  const zoomIndex = ZOOM_LANE_COUNT_STEPS.indexOf(
    ZOOM_LANE_COUNT_STEPS.includes(zoomLaneCount as (typeof ZOOM_LANE_COUNT_STEPS)[number])
      ? (zoomLaneCount as (typeof ZOOM_LANE_COUNT_STEPS)[number])
      : ZOOM_LANE_COUNT_STEPS[0]
  );

  const decreaseLaneCount = () => {
    const next = ZOOM_LANE_COUNT_STEPS[Math.max(zoomIndex - 1, 0)];
    setZoomLaneCount(next);
  };
  const increaseLaneCount = () => {
    const next = ZOOM_LANE_COUNT_STEPS[Math.min(zoomIndex + 1, ZOOM_LANE_COUNT_STEPS.length - 1)];
    setZoomLaneCount(next);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50 flex-wrap">
      <Button variant="primary" size="sm" onClick={() => addLane()} title="New lane (parallel arc)">
        Lane
      </Button>

      <div ref={beatContainerRef} className="relative flex rounded-lg border border-dark-accent/50">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAddBeat}
          disabled={!canAddBeat}
          title={primaryAddBeatTitle()}
          className="rounded-none border-0 rounded-l-lg"
        >
          + Beat
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canCreateBeats) setBeatMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!canCreateBeats}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center disabled:opacity-50"
          title="Beat type and placement options"
          aria-expanded={beatMenuOpen}
          aria-haspopup="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {beatMenuOpen &&
          createPortal(
            <div
              ref={beatDropdownRef}
              className="fixed py-1 min-w-[220px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
              style={{
                top: beatContainerRef.current
                  ? beatContainerRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: beatContainerRef.current
                  ? beatContainerRef.current.getBoundingClientRect().left
                  : 0,
              }}
            >
              <button
                type="button"
                onClick={() => handleAddBeatFromMenu("story")}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                Beat
              </button>
              <button
                type="button"
                onClick={() => handleAddBeatFromMenu("empty")}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                Empty Beat
              </button>
              <button
                type="button"
                onClick={handleAddAnchorBeat}
                className="w-full px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
              >
                Anchor Beat
              </button>

              <div className="my-1 border-t border-dark-accent/40" />

              <button
                type="button"
                onClick={() => {
                  setBeatPlacementMode("auto");
                  setBeatMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                title="Default smart placement: promotes a selected ghost, inserts before the relevant anchor, or appends"
              >
                <span className="w-4">{beatPlacementMode === "auto" ? "✓" : ""}</span>
                Auto placement
              </button>
              <button
                type="button"
                onClick={() => {
                  setBeatPlacementMode("above");
                  setBeatMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                title="New beats go directly above the selected beat, pushing anything already there out of the way"
              >
                <span className="w-4">{beatPlacementMode === "above" ? "✓" : ""}</span>
                Place above selected beat
              </button>
              <button
                type="button"
                onClick={() => {
                  setBeatPlacementMode("below");
                  setBeatMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-dark-accent/50 text-dark-text"
                title="New beats go directly below the selected beat, pushing anything already there out of the way"
              >
                <span className="w-4">{beatPlacementMode === "below" ? "✓" : ""}</span>
                Place below selected beat
              </button>

              <div className="my-1 border-t border-dark-accent/40" />

              <label className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-accent/50">
                <input
                  type="checkbox"
                  checked={requireAnchorSelection}
                  onChange={(e) => setRequireAnchorSelection(e.target.checked)}
                  className="rounded border-dark-accent bg-dark-bg text-blue-500 focus:ring-blue-500/50"
                />
                <span>Require anchor pick when 2+ exist</span>
              </label>
            </div>,
            document.body
          )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleConnect}
        disabled={!canConnect}
        title={getCrossingTooltip()}
        className={!canConnect ? "opacity-50 cursor-not-allowed" : ""}
      >
        {canConnect && setAlreadyConnected ? "Uncross" : "Crossing"}
      </Button>

      <div className="h-4 w-px bg-dark-accent/60 mx-1" />

      <div className="flex items-center gap-1" title="Visible lane count (zoom)">
        <button
          type="button"
          onClick={decreaseLaneCount}
          className="w-6 h-6 flex items-center justify-center rounded bg-dark-accent/50 hover:bg-dark-accent text-dark-muted hover:text-dark-text text-sm"
          title="Fewer, wider lanes"
        >
          −
        </button>
        <span className="text-xs text-dark-muted min-w-[3.5rem] text-center">
          {zoomLaneCount} lanes
        </span>
        <button
          type="button"
          onClick={increaseLaneCount}
          className="w-6 h-6 flex items-center justify-center rounded bg-dark-accent/50 hover:bg-dark-accent text-dark-muted hover:text-dark-text text-sm"
          title="More, narrower lanes"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-2" title="Beat block width as percentage of lane column">
        <span className="text-xs text-dark-muted whitespace-nowrap">Beat width: {beatWidthPercent}%</span>
        <input
          type="range"
          min={BEAT_WIDTH_PERCENT_MIN}
          max={BEAT_WIDTH_PERCENT_MAX}
          step={5}
          value={beatWidthPercent}
          onChange={(e) => setBeatWidthPercent(Number(e.target.value))}
          className="w-20 h-1 accent-blue-500 cursor-pointer"
        />
      </div>

      <div className="h-4 w-px bg-dark-accent/60 mx-1" />

      <Button
        variant="secondary"
        size="sm"
        onClick={() => setBeatsExpanded(!beatsExpanded)}
        title={beatsExpanded ? "Collapse beat blocks to compact height" : "Expand beat blocks to show descriptions"}
      >
        {beatsExpanded ? "Collapse beats" : "Expand beats"}
      </Button>

      {beatsExpanded && (
        <div className="flex items-center gap-2" title="Expanded beat block height">
          <span className="text-xs text-dark-muted whitespace-nowrap">Height: {expandedBeatHeightPx}px</span>
          <input
            type="range"
            min={EXPANDED_BEAT_HEIGHT_MIN}
            max={EXPANDED_BEAT_HEIGHT_MAX}
            step={10}
            value={expandedBeatHeightPx}
            onChange={(e) => setExpandedBeatHeightPx(Number(e.target.value))}
            className="w-20 h-1 accent-blue-500 cursor-pointer"
          />
        </div>
      )}

      {message && <span className="text-xs text-dark-muted ml-2">{message}</span>}
    </div>
  );
}
