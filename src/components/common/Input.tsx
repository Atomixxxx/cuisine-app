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
          className="text-[15px] font-medium text-[#86868b] dark:text-[#f5f5f7]"
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
          "bg-[#e8e8ed] dark:bg-[#38383a] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b]",
          "focus:outline-none focus:ring-2 focus:ring-[#2997FF] dark:focus:ring-[#2997FF]",
          error
            ? "ring-2 ring-[#ff3b30] dark:ring-[#ff3b30]"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {error && (
        <p className="text-[13px] text-[#ff3b30]">{error}</p>
      )}
    </div>
  );
}
