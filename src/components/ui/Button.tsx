import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon } from "./Icon";

type Variant = "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: string;
  children?: ReactNode;
}

export function Button({
  variant = "ghost",
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`kd-btn kd-btn--${variant}${className ? ` ${className}` : ""}`}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  label: string;
  size?: number;
  active?: boolean;
}

export function IconButton({
  name,
  label,
  size = 18,
  active = false,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`kd-iconbtn${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
    >
      <Icon name={name} size={size} fill={active} />
    </button>
  );
}
