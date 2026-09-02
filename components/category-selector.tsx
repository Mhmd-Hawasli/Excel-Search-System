"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type CategoryOption = { id: string; name: string };

export function CategorySelector({ categories, value, onChange, label }: { categories: CategoryOption[]; value: string | null; onChange: (categoryId: string | null) => void; label: string }) {
  const options: Array<{ id: string | null; name: string }> = [{ id: null, name: "أخرى" }, ...categories];

  return <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2 xl:flex">
    {options.map((option) => {
      const selected = value === option.id;
      return <Button key={option.id ?? "other"} type="button" size="sm" variant={selected ? "default" : "outline"} role="radio" aria-checked={selected} title={option.name} className="min-w-0 px-2 xl:flex-1" onClick={() => onChange(option.id)}><span className="truncate">{option.name}</span></Button>;
    })}
  </div>;
}
