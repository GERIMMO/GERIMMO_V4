/**
 * Reprise d'un visuel marketing bloqué (audit 25/09, R2).
 *
 * `reserver_visuel_marketing` refuse au-delà de deux essais et rien ne
 * remettait le compteur à zéro : l'article du 24/09 est resté bloqué sans geste
 * possible hors SQL. La route remet le compteur à zéro à la passe suivante si
 * le dernier essai date de plus d'une heure — jamais dans la même passe.
 */
import { describe, expect, it } from "vitest";
import { visuelReprenable } from "../src/app/api/cron/marketing/route";

const T0 = Date.parse("2026-09-25T08:00:00Z");
const article = (x: Partial<Parameters<typeof visuelReprenable>[0]> = {}) => ({
  image_empreinte: null, image_essais: 2, image_en_cours_le: null, updated_at: "2026-09-25T06:00:00Z", ...x,
});

describe("visuelReprenable", () => {
  it("reprend un article épuisé dont le dernier essai a plus d'une heure", () => {
    expect(visuelReprenable(article(), T0)).toBe(true);
  });
  it("ne reprend pas dans l'heure qui suit l'échec : pas de boucle dans la même passe", () => {
    expect(visuelReprenable(article({ updated_at: "2026-09-25T07:30:00Z" }), T0)).toBe(false);
    // Un essai encore marqué en cours compte comme le dernier geste.
    expect(visuelReprenable(article({ image_en_cours_le: "2026-09-25T07:20:00Z" }), T0)).toBe(false);
  });
  it("laisse tranquille un article qui a encore un essai, ou déjà son image", () => {
    expect(visuelReprenable(article({ image_essais: 1 }), T0)).toBe(false);
    expect(visuelReprenable(article({ image_empreinte: "a".repeat(64) }), T0)).toBe(false);
  });
});
