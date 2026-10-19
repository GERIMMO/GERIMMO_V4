/**
 * Audit du 19/10 (lot B5, point mineur) : la validité d'un devis d'artisan se juge au jour de PARIS, côté serveur comme en
 * base. Le serveur (Vercel) tourne en UTC : entre minuit et 2 h à Paris, `new Date().toISOString()` donne encore la veille,
 * et la validité par défaut (30 jours) partait de la veille. Sans base ; horloge figée.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { lireSaisieDevisArtisan } from "../src/lib/saisie-devis-artisan";

function saisie(valideJusquAu?: string) {
  const f = new FormData();
  Object.entries({
    diagnostic: "Joint usé", delai: "Sous cinq jours", duree: "Une heure",
    lignes_devis: JSON.stringify([{ code: "plomberie_heure", libelle: "Remplacement du joint", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000, montant_ttc_cents: 1 }]),
  }).forEach(([k, v]) => f.set(k, v));
  if (valideJusquAu) f.set("valide_jusqu_au", valideJusquAu);
  return f;
}

afterEach(() => vi.useRealTimers());

describe("validité d'un devis d'artisan : « aujourd'hui » est le jour de Paris", () => {
  it("à 0 h 30 à Paris le 20 octobre (encore le 19 en UTC), la validité par défaut court 30 jours depuis le 20 et le 20 est dépassé", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T22:30:00Z"));
    expect(lireSaisieDevisArtisan(saisie()).valideJusquAu).toBe("2026-11-19");
    expect(() => lireSaisieDevisArtisan(saisie("2026-10-20"))).toThrow("dépassée");
    expect(lireSaisieDevisArtisan(saisie("2026-10-21")).valideJusquAu).toBe("2026-10-21");
  });
  it("à 23 h 30 à Paris le 19 octobre, le 20 est encore une validité à venir et le défaut part du 19", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T21:30:00Z"));
    expect(lireSaisieDevisArtisan(saisie()).valideJusquAu).toBe("2026-11-18");
    expect(lireSaisieDevisArtisan(saisie("2026-10-20")).valideJusquAu).toBe("2026-10-20");
  });
});
