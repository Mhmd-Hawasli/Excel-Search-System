import { FileEditsPage } from "@/features/edits/file-edits-page";

export const dynamic = "force-dynamic";

export default async function FileEditsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams?: Promise<{ version?: string | string[] }>;
}) {
  const { fileId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const raw = Array.isArray(sp?.version) ? sp?.version[0] : sp?.version;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  const initialVersion = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  return <FileEditsPage fileId={fileId} initialVersion={initialVersion} />;
}
