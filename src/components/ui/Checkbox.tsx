import { InputHTMLAttributes, forwardRef } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <label className="flex items-center gap-3 cursor-pointer group">
        <input
          ref={ref}
          type="checkbox"
          className={`w-4 h-4 rounded border-2 border-dark-accent bg-dark-bg
            text-blue-600 focus:ring-blue-500 focus:ring-offset-0 focus:ring-2
            disabled:opacity-50 ${className}`}
          {...props}
        />
        <span className="text-dark-text group-hover:text-dark-text/90">{label}</span>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
