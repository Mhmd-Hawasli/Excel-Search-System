import type ExcelJS from "exceljs";

/**
 * Cell formatting preserved by the system, per individual cell:
 * - `fills`: fill color per 0-based column index (as string) → 8-char ARGB.
 * - `fonts`: font color per 0-based column index (as string) → 8-char ARGB.
 * Font size, family, row heights and column widths are intentionally NOT
 * preserved — only colors matter.
 */
export type RowFormats = {
  fills: Record<string, string>;
  fonts: Record<string, string>;
};

/** Thin gray grid border applied to every exported cell ("all borders"). */
export const THIN_CELL_BORDER: ExcelJS.Borders = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
  diagonal: {},
};

type ColorLike = {
  argb?: unknown;
  theme?: unknown;
  tint?: unknown;
} | null
  | undefined;

/** Default Office theme palette (theme1.xml order): lt1, dk1, lt2, dk2, accent1-6, hlink, folHlink. */
const THEME_PALETTE = [
  "FFFFFF",
  "000000",
  "E7E6E6",
  "44546A",
  "5B9BD5",
  "ED7D31",
  "A5A5A5",
  "FFC000",
  "4472C4",
  "70AD47",
  "0563C1",
  "954F72",
];

/** Normalizes any RGB/ARGB input to 8-char uppercase ARGB, or null. */
export function normalizeArgb(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  return null;
}

/** Resolves a theme color + tint to ARGB (simplified ECMA-376 tint over sRGB). */
export function resolveThemeColor(theme: unknown, tint: unknown): string | null {
  if (typeof theme !== "number" || !Number.isInteger(theme)) return null;
  const base = THEME_PALETTE[theme];
  if (!base) return null;
  const amount = typeof tint === "number" && Number.isFinite(tint) ? Math.max(-1, Math.min(1, tint)) : 0;
  const channels = [base.slice(0, 2), base.slice(2, 4), base.slice(4, 6)].map((part) => {
    const value = parseInt(part, 16);
    const adjusted =
      amount < 0 ? value * (1 + amount) : value * (1 - amount) + 255 * amount;
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  });
  return `FF${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Resolves an ExcelJS cell color to ARGB. Explicit RGB wins; theme colors are
 * resolved against the default Office palette. Indexed/unknown colors return
 * null (legacy palettes are not resolved).
 */
export function resolveExcelColor(color: ColorLike): string | null {
  if (!color || typeof color !== "object") return null;
  if (typeof color.argb === "string") {
    const direct = normalizeArgb(color.argb);
    if (direct) return direct;
  }
  if (typeof color.theme === "number") return resolveThemeColor(color.theme, color.tint);
  return null;
}

function cellFill(cell: { fill?: unknown }): string | null {
  const fill = cell.fill as
    | { type?: unknown; pattern?: unknown; fgColor?: unknown; bgColor?: unknown }
    | undefined;
  if (!fill || typeof fill !== "object") return null;
  if (fill.type === "gradient" || fill.pattern === "none") return null;
  return (
    resolveExcelColor(fill.fgColor as ColorLike) ?? resolveExcelColor(fill.bgColor as ColorLike)
  );
}

function cellFontColor(cell: { font?: unknown }): string | null {
  const font = cell.font as { color?: unknown } | undefined;
  if (!font || typeof font !== "object") return null;
  const color = font.color as
    | { argb?: unknown; theme?: unknown; tint?: unknown }
    | null
    | undefined;
  // Excel materializes the default font (including the automatic theme:1
  // color) on every styled cell when a file is parsed, so an un-tinted
  // theme:1 is indistinguishable from "no explicit color" — and renders
  // identically. Skipping it keeps stored fonts to genuinely chosen colors
  // (explicit rgb black and tinted grays are still preserved).
  if (
    !!color &&
    typeof color === "object" &&
    color.theme === 1 &&
    color.argb === undefined &&
    (color.tint === undefined || color.tint === null || color.tint === 0)
  ) {
    return null;
  }
  return resolveExcelColor(color);
}

/**
 * Extracts the row formats of the first `columnCount` cells: one fill color
 * and one font color per cell. Never throws on exotic style objects —
 * unresolvable entries are skipped.
 */
export function extractRowFormats(
  row: { getCell(index: number): { fill?: unknown; font?: unknown } },
  columnCount: number,
  firstCol = 1,
): RowFormats {
  const fills: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  for (let index = 0; index < columnCount; index += 1) {
    const cell = row.getCell(firstCol + index);
    const fill = cellFill(cell);
    if (fill) fills[String(index)] = fill;
    const font = cellFontColor(cell);
    if (font) fonts[String(index)] = font;
  }
  return { fills, fonts };
}

/**
 * Applies stored formats to an exported row: each fill and font color lands
 * on its original column (shifted by `columnOffset`). Existing cell fonts
 * are preserved (only the color is replaced).
 */
export function applyRowFormats(
  sheet: ExcelJS.Worksheet,
  excelRowNumber: number,
  formats: RowFormats | null | undefined,
  columnCount: number,
  columnOffset = 0,
): void {
  if (!formats) return;
  const row = sheet.getRow(excelRowNumber);
  for (let index = 0; index < columnCount; index += 1) {
    const fill = formats.fills[String(index)];
    const font = formats.fonts[String(index)];
    if (!fill && !font) continue;
    const cell = row.getCell(index + 1 + columnOffset);
    if (fill) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    }
    if (font) {
      const current = (cell.font ?? {}) as Record<string, unknown>;
      cell.font = { ...current, color: { argb: font } };
    }
  }
}
