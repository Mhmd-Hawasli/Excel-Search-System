// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileAccessSelector } from "./file-access-selector";
import type { FilePermissionRow } from "@/lib/users/file-permissions";

const groups = [
  { id: "g1", name: "المالية", files: [{ id: "f1", name: "مالية جدد" }, { id: "f2", name: "مالية قدامى" }] },
  { id: "g2", name: "الأساسية", files: [{ id: "f3", name: "العقود" }] },
  { id: "g3", name: "فارغة", files: [] },
];
function Harness({ initial = [] }: { initial?: FilePermissionRow[] }) {
  const [rows, setRows] = useState(initial);
  return <><FileAccessSelector idPrefix="test" groups={groups} assignments={rows} onChange={setRows} />
    <output data-testid="saved">{JSON.stringify(rows)}</output></>;
}
const checkbox = (name: string | RegExp) => screen.getByRole("checkbox", { name });
const saved = (): FilePermissionRow[] => JSON.parse(screen.getByTestId("saved").textContent ?? "[]");

describe("file-based permissions editor", () => {
  it("selects all files through their group and emits only file grants", () => {
    render(<Harness />);
    fireEvent.click(checkbox(/المالية/));
    expect(checkbox("مالية جدد")).toBeChecked();
    expect(checkbox("مالية قدامى")).toBeChecked();
    expect(checkbox("العقود")).not.toBeChecked();
    expect(saved()).toEqual([
      { permission: "groups.viewScoped", groupId: null, fileId: "f1" },
      { permission: "groups.viewScoped", groupId: null, fileId: "f2" },
    ]);
  });

  it("checks parents of selected files without selecting siblings", () => {
    render(<Harness />);
    fireEvent.click(checkbox("مالية جدد"));
    fireEvent.click(checkbox("العقود"));
    expect(checkbox(/المالية/)).toBeChecked();
    expect(checkbox(/الأساسية/)).toBeChecked();
    expect(checkbox("مالية قدامى")).not.toBeChecked();
    expect(saved().map((row) => row.fileId)).toEqual(["f1", "f3"]);
    fireEvent.click(checkbox("مالية جدد"));
    expect(checkbox(/المالية/)).not.toBeChecked();
    expect(checkbox(/الأساسية/)).toBeChecked();
  });

  it("clears only the unchecked group's files even when it was partially selected", () => {
    render(<Harness />);
    fireEvent.click(checkbox("مالية جدد"));
    fireEvent.click(checkbox("العقود"));
    fireEvent.click(checkbox(/المالية/));
    expect(checkbox("مالية جدد")).not.toBeChecked();
    expect(checkbox("مالية قدامى")).not.toBeChecked();
    expect(checkbox("العقود")).toBeChecked();
    expect(saved().map((row) => row.fileId)).toEqual(["f3"]);
  });

  it("supports select/clear all while keeping unrelated permissions", () => {
    const other = { permission: "users.view", groupId: null, fileId: null };
    render(<Harness initial={[other]} />);
    fireEvent.click(checkbox(/جميع الملفات الحالية/));
    expect(checkbox(/المالية/)).toBeChecked();
    expect(checkbox(/الأساسية/)).toBeChecked();
    expect(checkbox(/فارغة/)).not.toBeChecked();
    expect(checkbox(/فارغة/)).toBeDisabled();
    expect(saved().filter((row) => row.fileId)).toHaveLength(3);
    fireEvent.click(checkbox(/جميع الملفات الحالية/));
    expect(saved()).toEqual([other]);
  });

  it("expands an existing global grant and removes it when a file is unchecked", () => {
    render(<Harness initial={[{ permission: "groups.view", groupId: null, fileId: null }]} />);
    expect(checkbox("مالية جدد")).toBeChecked();
    fireEvent.click(checkbox("مالية قدامى"));
    expect(checkbox(/المالية/)).toBeChecked();
    expect(checkbox("مالية قدامى")).not.toBeChecked();
    expect(saved().map((row) => row.fileId)).toEqual(["f1", "f3"]);
    expect(saved().some((row) => row.permission === "groups.view")).toBe(false);
  });

  it("shows a legacy group grant as all its files selected", () => {
    render(<Harness initial={[{ permission: "groups.viewScoped", groupId: "g1", fileId: null }]} />);
    expect(checkbox("مالية جدد")).toBeChecked();
    expect(checkbox("مالية قدامى")).toBeChecked();
    fireEvent.click(checkbox("مالية جدد"));
    expect(saved()).toEqual([{ permission: "groups.viewScoped", groupId: null, fileId: "f2" }]);
  });
});
