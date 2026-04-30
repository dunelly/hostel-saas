import { describe, expect, it } from "vitest";
import { parseSheetRows } from "../src/lib/sheet-sync/parser";

function sheetBaseRows() {
  return [
    [],
    [],
    ["", "29-Apr", "", "", "", "", "30-Apr"],
    [],
  ];
}

describe("sheet parser layout handling", () => {
  it("parses 4B when guest lanes start immediately after the room label", () => {
    const rows = [
      ...sheetBaseRows(),
      ["ROOM 4B"],
      ["", "Alice", "Bea", "", "", "", "Alice", "", "Cara"],
      ["", "", "", "Dana", "", "", "", "Eve"],
    ];

    const parsed = parseSheetRows("923324031", rows);

    expect(parsed).toContainEqual({
      sheet: "april",
      roomId: "4B",
      bedId: "4B-01",
      date: "2026-04-29",
      name: "Alice",
    });
    expect(parsed).toContainEqual({
      sheet: "april",
      roomId: "4B",
      bedId: "4B-07",
      date: "2026-04-29",
      name: "Dana",
    });
    expect(parsed).toContainEqual({
      sheet: "april",
      roomId: "4B",
      bedId: "4B-06",
      date: "2026-04-30",
      name: "Eve",
    });
    expect(parsed.every((row) => row.roomId === "4B" && row.bedId.startsWith("4B-"))).toBe(true);
    expect(parsed.some((row) => /^ROOM\b/i.test(row.name))).toBe(false);
  });

  it("parses spacer-row rooms without shifting lane bed mapping", () => {
    const rows = [
      ...sheetBaseRows(),
      ["ROOM 2A"],
      ["", "", "", "", "", "", ""],
      ["", "Nina", "", "Omar", "", "", "", "Pia"],
      ["", "", "Quinn", "", "", "", "Rae"],
    ];

    const parsed = parseSheetRows("1888445989", rows);

    expect(parsed).toEqual(expect.arrayContaining([
      { sheet: "may", roomId: "2A", bedId: "2A-01", date: "2026-04-29", name: "Nina" },
      { sheet: "may", roomId: "2A", bedId: "2A-03", date: "2026-04-29", name: "Omar" },
      { sheet: "may", roomId: "2A", bedId: "2A-06", date: "2026-04-29", name: "Quinn" },
      { sheet: "may", roomId: "2A", bedId: "2A-02", date: "2026-04-30", name: "Pia" },
      { sheet: "may", roomId: "2A", bedId: "2A-05", date: "2026-04-30", name: "Rae" },
    ]));
    expect(parsed).toHaveLength(5);
  });
});
