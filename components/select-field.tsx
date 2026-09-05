"use client";

import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

/**
 * Labeled native select with the shared chevron affordance. Used by the
 * search and conflicts filter panels; rendering a native `<select>` keeps it
 * simple, accessible and mobile-friendly.
 */
export function SelectField({
  id,
  label,
  labelClassName,
  value,
  onChange,
  children,
  className,
  disabled,
}: {
  id: string;
  label: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <div className="relative">
        <select
          id={id}
          aria-label={label}
          className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pe-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
