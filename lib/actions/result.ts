export type MutationResult =
  | { ok: true; message: string; navigateTo?: string }
  | { ok: false; error: string };
