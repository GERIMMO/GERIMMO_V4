import { expect, it } from "vitest";
import { situerDetention } from "../src/lib/dates-detention";

it("conserve les parts jusqu’au jour de fin inclus et ouvre la succession le lendemain", () => {
  const ancienne = { date_debut: "2026-01-01", date_fin: "2026-11-13" };
  const nouvelle = { date_debut: "2026-11-14", date_fin: null };
  expect(situerDetention(ancienne, "2026-11-13")).toBe("actuelle");
  expect(situerDetention(nouvelle, "2026-11-13")).toBe("future");
  expect(situerDetention(ancienne, "2026-11-14")).toBe("terminee");
  expect(situerDetention(nouvelle, "2026-11-14")).toBe("actuelle");
});
