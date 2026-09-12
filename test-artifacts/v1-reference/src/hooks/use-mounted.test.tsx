// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMounted } from "@/hooks/use-mounted";

function Probe() {
  return <span data-mounted={useMounted()} />;
}

describe("useMounted", () => {
  it("is false during server rendering (uses the server snapshot)", () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-mounted="false"');
  });

  it("is true on the client", () => {
    const { result } = renderHook(() => useMounted());
    expect(result.current).toBe(true);
  });
});
