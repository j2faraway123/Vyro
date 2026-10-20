import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: "sm" | "md" | "lg";
};

export function IconButton({ label, active, size = "md", className = "", children, ...rest }: IconButtonProps) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${dims} ${
        active ? "text-accent" : "text-fg-2 hover:text-fg"
      } hover:bg-fg/8 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
  loading?: boolean;
};

export function Button({ variant = "secondary", icon, loading, className = "", children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-on-accent hover:brightness-110 shadow-[0_6px_24px_-8px_var(--vy-accent)]",
    secondary: "bg-fg/8 text-fg hover:bg-fg/14 border border-line",
    ghost: "text-fg-2 hover:text-fg hover:bg-fg/8",
    danger: "bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 border border-red-500/30",
  }[variant];
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-fg/18"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onCommit,
  label,
  className = "",
  format,
  alwaysThumb,
  disabled,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  className?: string;
  format?: (v: number) => string;
  alwaysThumb?: boolean;
  disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={`vy-range ${alwaysThumb ? "always-thumb" : ""} ${className}`}
      style={{ ["--fill" as string]: `${pct}%` }}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={format ? format(value) : undefined}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-fg/5 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-all duration-150 ${
            size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm"
          } ${value === o.value ? "bg-fg text-bg shadow" : "text-fg-2 hover:text-fg"}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-fg-2 ${className}`} aria-label="Loading" />;
}

export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={`vy-eq inline-flex h-3.5 items-end gap-[2px] ${playing ? "" : "paused"}`} aria-hidden>
      <span className="h-full" />
      <span className="h-full" />
      <span className="h-full" />
    </span>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${
        active ? "bg-fg text-bg" : "bg-fg/8 text-fg hover:bg-fg/14"
      }`}
    >
      {children}
    </button>
  );
}
