import { FileEditsPage } from "@/features/edits/file-edits-page";

export const dynamic = "force-dynamic";

export default async function FileEditsRoute({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return <FileEditsPage fileId={fileId} />;
}
