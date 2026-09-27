"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/cn";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  fileName?: string | null;
  buttonLabel?: string;
};

/** Consistent, keyboard-accessible file input with localized visible text. */
export function FilePicker({
  id, fileName, buttonLabel = "اختيار ملف", className, onChange, disabled, ...props
}: FilePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const displayedName = fileName === undefined ? selectedName : fileName;

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <input
        {...props}
        id={inputId}
        type="file"
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => {
          setSelectedName(event.target.files?.[0]?.name ?? null);
          onChange?.(event);
        }}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm",
          "hover:border-primary/60 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-primary">
          <FileUp className="size-4" aria-hidden="true" />{buttonLabel}
        </span>
        <span className="min-w-0 truncate text-muted-foreground" dir="auto">
          {displayedName || "لم يُحدَّد ملف"}
        </span>
      </label>
    </div>
  );
}
