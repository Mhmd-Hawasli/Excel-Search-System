import { describe, expect, it } from "vitest";
import { parseVisitDetails } from "@/lib/activity";

describe("parseVisitDetails", () => {
  it("reads a full visit payload", () => {
    expect(
      parseVisitDetails({
        recordId: "rec-1",
        fileName: "ملف العقود",
        personName: "محمد أحمد",
        visitorUsername: "mhmd",
        visitorDisplayName: "مالك النظام",
      }),
    ).toEqual({
      recordId: "rec-1",
      fileName: "ملف العقود",
      personName: "محمد أحمد",
      visitorUsername: "mhmd",
      visitorDisplayName: "مالك النظام",
    });
  });

  it("falls back to the username when the display name is missing", () => {
    expect(parseVisitDetails({ visitorUsername: "admin" })).toMatchObject({
      visitorUsername: "admin",
      visitorDisplayName: "admin",
    });
  });

  it.each([null, undefined, "x", 42, [], {}])("rejects %p", (value) => {
    expect(parseVisitDetails(value)).toBeNull();
  });
});
