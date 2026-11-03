import { describe, expect, it } from "vitest";
import { baht, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("adds BOM, quotes commas/quotes/newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["บรรทัด\nใหม่", null]])).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n"บรรทัด\nใหม่",\r\n');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv(["a"], [["=HYPERLINK(1)"], ["-5"]])).toBe("﻿a\r\n'=HYPERLINK(1)\r\n'-5\r\n");
  });
  it("formats satang as plain baht", () => {
    expect(baht(95000)).toBe("950.00");
    expect(baht("14250")).toBe("142.50");
    expect(baht(null)).toBe("");
  });
});
