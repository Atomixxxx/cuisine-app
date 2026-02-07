import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "app-accent-bg active:opacity-70",
  secondary:
    "app-surface-2 app-text active:opacity-70",
  danger:
    "bg-[color:var(--app-danger)] text-white active:opacity-70",
  ghost:
    "bg-transparent text-[color:var(--app-accent)] active:opacity-70",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-[15px]",
  md: "px-5 py-2.5 text-[17px]",
  lg: "px-6 py-3.5 text-[17px]",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  children,
  onClick,
  className = "",
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-xl font-semibold transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-black",
        "min-h-[44px] min-w-[44px]",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
