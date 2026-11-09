import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canTransition, transitionPairs } from "@/domain/transitions";

describe("booking transitions", () => {
  it("matches the booking_transitions seed in the migration", () => {
    const sql = readFileSync("supabase/migrations/20261031000002_functions_triggers.sql", "utf8");
    const block = sql.slice(sql.indexOf("insert into booking_transitions"), sql.indexOf(";", sql.indexOf("insert into booking_transitions")));
    const seeded = [...block.matchAll(/\('(\w+)','(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const code = transitionPairs().map(([f, t]) => `${f}>${t}`).sort();
    expect(seeded).toEqual(code);
  });

  it("enforces actors", () => {
    expect(canTransition("awaiting_deposit", "confirmed", "system")).toBe(true);
    expect(canTransition("awaiting_deposit", "confirmed", "customer")).toBe(false);
    expect(canTransition("arrived", "no_show", "driver")).toBe(false);
    expect(canTransition("arrived", "no_show", "owner")).toBe(true);
    expect(canTransition("completed", "cancelled", "owner")).toBe(false);
  });
});
