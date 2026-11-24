/**
 * DÉCISION DU DIRIGEANT DU 24/11/2026, LOT D4 — Q24 : « ouvre aussi la relance à la main ».
 *
 * L'écran du propriétaire propose l'envoi immédiat d'une relance par e-mail quand le superviseur a ouvert
 * l'interrupteur « relance de loyer » — et seulement alors. Avant le lot, il ne le proposait jamais (liste fermée du
 * pilote). Fermé ou illisible : seul le PDF reste proposé, avec la phrase « envoi suspendu ».
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RappelLoyer } from "@/lib/rappels-loyers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/app/actions/reception-loyer", () => ({ declarerReceptionLoyer: vi.fn(), envoyerRelanceReception: vi.fn() }));
vi.mock("@/components/bouton-generer-document", () => ({ BoutonGenererDocument: ({ libelle }: { libelle: string }) => createElement("button", null, libelle) }));

import { RappelsLoyersInteractifs } from "@/components/rappels-loyers-interactifs";

const ligne: RappelLoyer = { appel_id: "appel", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille", periode: "2026-10-01", date_echeance: "2026-10-05",
  montant_du: 800, montant_couvert: 200, non_recu_signale_le: "2026-10-26T09:00:00Z", relances_automatiques: { active: false, premierDelai: 5, secondDelai: 15 }, historique_relances_disponible: true };

describe("Q24 — l'écran propose la relance à la main quand l'interrupteur de la relance est ouvert", () => {
  const rendre = (envoiRelanceDisponible: boolean, relanceAutomatiqueOuverte = envoiRelanceDisponible, patch: Partial<RappelLoyer> = {}) => renderToStaticMarkup(createElement(RappelsLoyersInteractifs, {
    orgId: "org", aujourdHui: "2026-10-26", dus: [{ ...ligne, ...patch }], prochaine: null, totalEcheancesDues: 1, lectureSeule: false, envoiRelanceDisponible, relanceAutomatiqueOuverte }));

  it("ouvert : le formulaire d'envoi par e-mail est proposé, avec sa confirmation non cochée — sans que l'espace ait activé les relances automatiques", () => {
    const html = rendre(true);
    expect(ligne.relances_automatiques?.active).toBe(false);
    expect(html).toContain("Envoyer la première relance par e-mail");
    expect(html).toMatch(/<input type="checkbox"[^>]*name="confirmer"[^>]*>/);
    expect(html).not.toMatch(/<input type="checkbox"[^>]*name="confirmer"[^>]*checked/);
    expect(html).not.toContain("L’envoi de relances par e-mail est suspendu");
    // Le PDF reste proposé à côté.
    expect(html).toContain("Préparer la première relance en PDF");
  });

  it("fermé : aucun bouton d'envoi, la phrase « suspendu », et le PDF", () => {
    const html = rendre(false);
    expect(html).not.toContain("Envoyer la première relance par e-mail");
    expect(html).toContain("L’envoi de relances par e-mail est suspendu. Vous pouvez préparer le PDF pour le transmettre vous-même.");
    expect(html).toContain("Préparer la première relance en PDF");
    // L'ancienne phrase (« l'envoi immédiat à la main n'est pas proposé »), affichée à l'espace qui avait activé ses
    // relances automatiques, a disparu : la décision ouvre l'envoi à la main.
    const active = { relances_automatiques: { active: true, premierDelai: 5, secondDelai: 15 } };
    expect(rendre(false, true, active)).not.toContain("n’est pas proposé");
    expect(rendre(true, true, active)).toContain("Envoyer la première relance par e-mail");
  });
});
