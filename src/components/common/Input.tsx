import React from "react";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
}

export default function Input({
  label,
  error,
  type = "text",
  value,
  onChange,
  placeholder,
  className = "",
  id,
  ...rest
}: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[15px] font-medium app-muted"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={[
          "min-h-[44px] w-full rounded-xl border-0 px-4 py-2.5 text-[17px] transition-all duration-150",
          "app-surface-2 app-text placeholder-[color:var(--app-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]",
          error
            ? "ring-2 ring-[color:var(--app-danger)]"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {error && (
        <p className="text-[13px] text-[color:var(--app-danger)]">{error}</p>
      )}
    </div>
  );
}
