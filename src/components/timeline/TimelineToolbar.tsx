import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import {
  canFormCrossing,
  connectionMatchesBeatSet,
  getSelectedBeat,
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
  const addLane = useTimelineStore((s) => s.addLane);
  const addBeat = useTimelineStore((s) => s.addBeat);
  const addAnchorBeat = useTimelineStore((s) => s.addAnchorBeat);
  const addStoryBeatBeforeFirstAnchor = useTimelineStore((s) => s.addStoryBeatBeforeFirstAnchor);
  const convertBeatToStory = useTimelineStore((s) => s.convertBeatToStory);
  const connections = useTimelineStore((s) => s.connections);
  const toggleConnection = useTimelineStore((s) => s.toggleConnection);
  const setZoomLaneCount = useTimelineStore((s) => s.setZoomLaneCount);
  const setBeatWidthPercent = useTimelineStore((s) => s.setBeatWidthPercent);
  const setBeatsExpanded = useTimelineStore((s) => s.setBeatsExpanded);
  const setExpandedBeatHeightPx = useTimelineStore((s) => s.setExpandedBeatHeightPx);
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

  const canAddBeat = lanes.length > 0;
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
    const selectedBeat = getSelectedBeat(beats, selection);
    if (selectedBeat && selectedBeat.kind === "empty") {
      const ok = convertBeatToStory(selectedBeat.id);
      setMessage(ok ? "Ghost beat promoted to a real beat." : "Could not convert that beat.");
      if (ok) onSelectForEdit?.();
      return;
    }
    const id = addStoryBeatBeforeFirstAnchor();
    if (!id) {
      setMessage("Create a lane first.");
      return;
    }
    setMessage("Beat added.");
    onSelectForEdit?.();
  };

  const handleAddBeatFromMenu = (kind: "story" | "empty") => {
    const id = addBeat(undefined, kind);
    if (!id) {
      setMessage("Create a lane first.");
      return;
    }
    setMessage(kind === "empty" ? "Empty beat added." : "Beat added.");
    setBeatMenuOpen(false);
    onSelectForEdit?.();
  };

  const handleAddAnchorBeat = () => {
    const id = addAnchorBeat();
    if (!id) {
      setMessage("Create a lane first.");
      return;
    }
    setMessage("Anchor beat added.");
    setBeatMenuOpen(false);
    onSelectForEdit?.();
  };

  const selectedBeat = getSelectedBeat(beats, selection);
  const primaryAddBeatTitle =
    selectedBeat?.kind === "empty"
      ? "Convert the selected ghost beat into a real beat"
      : canAddBeat
        ? "New beat (inserts before the lane's oldest anchor beat, if any)"
        : "Select a lane or create one first";

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
          title={primaryAddBeatTitle}
          className="rounded-none border-0 rounded-l-lg"
        >
          + Beat
        </Button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (canAddBeat) setBeatMenuOpen((o) => !o);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={!canAddBeat}
          className="px-1.5 rounded-r-lg border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-bg text-dark-text text-sm flex items-center justify-center disabled:opacity-50"
          title="Beat type options"
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
              className="fixed py-1 min-w-[160px] rounded-lg border border-dark-accent bg-dark-surface shadow-lg z-[9999]"
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
