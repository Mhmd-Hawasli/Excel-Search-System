# Mapping select search + unlink — implementation evidence (docs/16–18, both phases)

Date: 2026-09-09. V1 untouched (verified clean). Backend untouched (one
regression re-run as proof). Frontend-only change + docs.

## Changed files (V2 frontend)

- `src/features/fields/field-mapping-select.tsx` (new): shared searchable
  combobox. Contract: `value: string` (`""` = unmapped), verbatim option
  values, `onChange(value)`, `disabled` row lock. Unlink `X` button
  (`aria-label/title="إلغاء الارتباط"`, DOM-after control = visually left in
  RTL, disabled when unmapped/locked) calls `onChange("")`. Popover: autofocus
  search input, `matchesNormalizedText` filter (`lib/normalization.ts`),
  `لا نتائج مطابقة` empty row, arrows/Enter/Escape, focus return, outside-click
  close, `max-h-64` scroll, existing tokens only (`bg-card`, no new styles).
  Fixes during build: `bg-popover` → `bg-card` (no such token), `ref` →
  `autoFocus` (Input has no ref forwarding), removed one unused local.
- `src/features/upload/upload-wizard.tsx` (S1): rows 506-530 select →
  component; options 1:1 (`غير مربوط` first, `— مقترح`/`— مرتبط بـ …`
  suffixes, taken-disabled, `String(columnIndex)` values); `selectClass` kept
  (still used by sheet selects).
- `src/features/files/file-update-wizard.tsx` (S2): per-column select →
  component (14 field options, same taken-key rule, `v || null` conversion
  preserved, key-column lock preserved); now-unused `selectClass` removed.
- `src/features/files/edit-mapping-wizard.tsx` (S3): step-0 select →
  component (id-valued options, suffix rule preserved); unused `selectClass`
  removed. Steps 1–2 untouched.

## Rules preserved (no backend/validation drift)

Uniqueness locks, suggestion/taken suffixes, locked rows, `""` = unmapped,
row aria-labels, table notes, wizard step validation — reducers
(`linkStandardField`, `updateColumn`) and value strings byte-identical;
`merge-interface.tsx` (`mapping-form.tsx`) untouched per plan non-goal. New
strings limited to the three recorded in doc 16.

## Verification (minimal, per request)

- `npm run lint` — 0 errors. `npm run typecheck` — clean (1 error found and
  fixed above). `npm run build` — 19/19 green.
- Backend suite untouched code: `dotnet test` **433/433 PASS** (regression).
- Manual matrix (browser proof) left for the operator: search narrows
  (normalized), unlink resets, duplicate 409 inline, locked rows inert,
  keyboard-only run, scoped-user absence + direct-POST 404, dark/mobile.
