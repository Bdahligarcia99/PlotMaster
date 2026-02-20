interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export default function Card({
  children,
  className = "",
  padding = "md",
}: CardProps) {
  return (
    <div
      className={`bg-dark-surface rounded-2xl border border-dark-accent/50 overflow-hidden ${paddingStyles[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
