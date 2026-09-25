/**
 * Les sous-traitants que le code utilise sont ceux que les pages légales
 * déclarent (audit 25/09, C2). Le code envoyait des données à Yousign, OpenAI
 * et Meta sans les nommer — infraction RGPD dès le premier visiteur.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PRESTATAIRES } from "../src/lib/editeur";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("PRESTATAIRES", () => {
  it("nomme chaque prestataire auquel le code envoie des données", () => {
    const attendus: [string, string][] = [
      ["Supabase", "lib/supabase/service.ts"],
      ["Stripe", "lib/stripe.ts"],
      ["Resend", "lib/email.ts"],
      ["Yousign", "lib/youtrust.ts"],
      ["OpenAI", "lib/visuel-marketing.ts"],
      ["Meta", "lib/facebook.ts"],
    ];
    for (const [nom, fichier] of attendus) {
      expect(fs.existsSync(path.join(SRC, fichier))).toBe(true);
      expect(PRESTATAIRES.some((p) => p.nom.includes(nom))).toBe(true);
    }
  });

  it("dit pour chacun ce qui lui est transmis, en une phrase lisible", () => {
    for (const p of PRESTATAIRES) {
      expect(p.role.length).toBeGreaterThan(15);
      expect(p.role).not.toMatch(/undefined|null/);
    }
  });

  it("nomme les transferts hors UE au lieu de les taire", () => {
    const openai = PRESTATAIRES.find((p) => p.nom === "OpenAI")!;
    expect(openai.localisation).toMatch(/États-Unis/);
    // La page confidentialité ne prétend plus que TOUT est hébergé dans l'UE.
    expect(lire("app/confidentialite/page.tsx")).toMatch(/hors de\s+l&apos;Union/);
  });
});
