import { describe, expect, it } from "vitest";
import { stripDefiniteArticle } from "../normalization/arabic";
import { FUZZY_ERROR_DIVISOR, fuzzyErrorLimit, fuzzyNameDistance, fuzzyNameMatches, levenshtein } from "./fuzzy";

describe("stripDefiniteArticle", () => {
  it.each([
    ["العبد", "عبد"],
    ["العيد", "عيد"],
    ["الخالد", "خالد"],
    ["عيد", "عيد"],
    ["محمد", "محمد"],
    ["الله", "الله"],
  ])("strips %s to %s", (token, stripped) => {
    expect(stripDefiniteArticle(token)).toBe(stripped);
  });
});

describe("levenshtein", () => {
  it.each([
    ["محمد", "محمد", 0],
    ["خاله", "خالد", 1],
    ["سليمان", "سلمان", 1],
    ["عيد", "عبد", 1],
    ["", "", 0],
    ["", "ا", 1],
    ["احمد", "امحد", 2],
  ])("distance between %s and %s is %i", (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance);
  });
});

describe("fuzzyErrorLimit", () => {
  it.each([
    [20, 4],
    [16, 3],
    [8, 1],
    [4, 0],
    [0, 0],
  ])("allows %i errors for length %i", (length, limit) => {
    expect(fuzzyErrorLimit(length)).toBe(limit);
    expect(limit * FUZZY_ERROR_DIVISOR).toBeLessThanOrEqual(length);
  });
});

describe("fuzzyNameDistance", () => {
  it.each([
    ["عبد الكريم خالة العيد", "عبد الكريم خالد العبد", 2],
    ["محمد احمد سليمان", "محمد احمد سلمان", 1],
    ["محمد احمد", "محمد احمد سلمان", 0],
    ["عبد الكريم خالد العبد", "عبد الكريم خالد العبد", 0],
  ])("distance of query %s against stored name %s is %i", (query, stored, distance) => {
    expect(fuzzyNameDistance(query, stored)).toBe(distance);
  });

  it("returns null for an empty query", () => {
    expect(fuzzyNameDistance("   ", "محمد احمد سلمان")).toBeNull();
  });
});

describe("fuzzyNameMatches", () => {
  it.each([
    ["عبد الكريم خالة العيد", "عبد الكريم خالد العبد"],
    ["عبد الكريم خالد العبد", "عبد الكريم خالة العيد"],
    ["محمد احمد سليمان", "محمد احمد سلمان"],
    ["محمد احمد سلمان", "محمد احمد سليمان"],
    ["عبد الكريم خالد العبد", "عبد الكريم خالد العبد"],
  ])("matches query %s against stored name %s", (query, stored) => {
    expect(fuzzyNameMatches(query, stored)).toBe(true);
  });

  it.each([
    ["محمد احمد", "محمد احمد سلمان"],
    ["عبد الكريم", "عبد الكريم خالد العبد"],
  ])("matches partial query %s against stored name %s (omission is not an error)", (query, stored) => {
    expect(fuzzyNameMatches(query, stored)).toBe(true);
  });

  it("matches exactly at the 80% boundary (4 errors in 20 characters)", () => {
    expect(fuzzyNameMatches("a".repeat(20), `${"b".repeat(4)}${"a".repeat(16)}`)).toBe(true);
  });

  it("rejects below the 80% boundary (5 errors in 20 characters)", () => {
    expect(fuzzyNameMatches("a".repeat(20), `${"b".repeat(5)}${"a".repeat(15)}`)).toBe(false);
  });

  it("rejects a one-letter typo in a four-letter token (75% similarity)", () => {
    expect(fuzzyNameMatches("محمذ", "محمد احمد سلمان")).toBe(false);
  });

  it.each([
    ["عبد الكريم خالة العيد", "ليلى حسن إبراهيم"],
    ["محمد احمد سليمان", "خالد عبد الرحمن"],
    ["ليلى", "محمد احمد سلمان"],
    ["محمد احمد سلمان", "محمد احمد"],
  ])("rejects query %s against stored name %s", (query, stored) => {
    expect(fuzzyNameMatches(query, stored)).toBe(false);
  });

  it("rejects an empty query", () => {
    expect(fuzzyNameMatches("   ", "محمد احمد سلمان")).toBe(false);
  });
});
