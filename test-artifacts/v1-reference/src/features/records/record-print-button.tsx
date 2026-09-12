"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Prints the record page (save as PDF from the print dialog). Print CSS
 * hides the shell chrome and interactive controls, and reveals every tab
 * panel, so the output is the complete record sheet.
 */
export function RecordPrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="no-print"
      onClick={() => window.print()}
      title="طباعة الصفحة كاملة أو حفظها PDF"
    >
      <Printer className="size-4" />
      طباعة / PDF
    </Button>
  );
}
