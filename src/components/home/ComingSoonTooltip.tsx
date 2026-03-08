import { useState, useId } from "react";

interface ComingSoonTooltipProps {
  /** Optional label before the info icon, e.g. "Coming Soon" */
  label?: string;
  /** Whether to show the label (default: true shows "Coming Soon") */
  showLabel?: boolean;
  className?: string;
}

export default function ComingSoonTooltip({
  label = "Coming Soon",
  showLabel = true,
  className = "",
}: ComingSoonTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const id = useId();

  return (
    <span className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {showLabel && (
        <span className="text-xs text-dark-muted">{label}</span>
      )}
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-dark-muted hover:text-dark-text
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-surface
          cursor-help transition-colors"
        aria-label="More information"
        aria-describedby={isVisible ? id : undefined}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-3.5 h-3.5"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isVisible && (
        <span
          id={id}
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 mt-1 top-full px-3 py-2 text-sm
            bg-dark-accent border border-dark-accent rounded-lg text-dark-text shadow-lg
            max-w-[240px] whitespace-normal"
        >
          <span className="font-medium block">Coming soon</span>
          <span className="text-dark-muted text-xs block mt-0.5">
            This module isn&apos;t enabled in this build yet.
          </span>
        </span>
      )}
    </span>
  );
}
