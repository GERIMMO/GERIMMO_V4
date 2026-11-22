/**
 * LA DÉCLARATION D'INCIDENT DEPUIS LA FICHE DU BIEN DEMANDE LA CATÉGORIE ET L'URGENCE — audit palier 1 du 22/11/2026,
 * P1-19. Côté application : l'action refuse une catégorie absente ou inconnue et une urgence hors liste AVANT d'appeler
 * la base, transmet les deux choix, et dit « urgent » quand le dossier l'est. La base est tenue par
 * `tests/incident-bien-categorie-base.test.ts`, l'écran par `e2e/incident-bien-categorie.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), revalider: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ user: { id: "gerant-test" }, supabase: { rpc: banc.rpc } }) }));

import { declarerIncidentBien } from "@/app/actions/incident-bien-simple";
import { aujourdhuiParis } from "@/lib/ged";
import { CATEGORIES_INCIDENT } from "@/lib/incidents";

const ORG = "11111111-1111-4111-8111-111111111111";
const BIEN = "22222222-2222-4222-8222-222222222222";
const LOT = "33333333-3333-4333-8333-333333333333";
const COMMANDE = "44444444-4444-4444-8444-444444444444";

function saisie(champs: Record<string, string | null> = {}) {
  const f = new FormData();
  const valeurs: Record<string, string | null> = { commande: COMMANDE, lot: LOT, titre: "Fuite sous l’évier", date: aujourdhuiParis(), note: "", categorie: "plomberie_joint", urgence: "normale", ...champs };
  for (const [nom, valeur] of Object.entries(valeurs)) if (valeur !== null) f.set(nom, valeur);
  return f;
}

beforeEach(() => {
  banc.rpc.mockReset().mockResolvedValue({ data: "55555555-5555-4555-8555-555555555555", error: null });
  banc.revalider.mockReset();
});

describe("déclaration d'incident depuis la fiche du bien : catégorie et urgence", () => {
  it("transmet à la base la catégorie et l'urgence choisies, et dit « urgent » quand le dossier l'est", async () => {
    expect(await declarerIncidentBien(ORG, BIEN, {}, saisie({ categorie: "humidite_infiltration", urgence: "urgente", note: "Plafond du séjour" }))).toEqual({ succes: "Incident urgent déclaré." });
    expect(banc.rpc).toHaveBeenCalledTimes(1);
    expect(banc.rpc).toHaveBeenCalledWith("declarer_incident_bien_simple", {
      p_org: ORG, p_bien: BIEN, p_lot: LOT, p_titre: "Fuite sous l’évier", p_date: aujourdhuiParis(), p_note: "Plafond du séjour",
      p_commande: COMMANDE, p_categorie: "humidite_infiltration", p_urgence: "urgente",
    });
    expect(banc.revalider).toHaveBeenCalled();
  });

  it("sans urgence dans le formulaire, le dossier est « normal » ; les parties communes passent sans logement", async () => {
    expect(await declarerIncidentBien(ORG, BIEN, {}, saisie({ urgence: null, lot: "" }))).toEqual({ succes: "Incident déclaré." });
    expect(banc.rpc.mock.calls[0][1]).toMatchObject({ p_lot: null, p_categorie: "plomberie_joint", p_urgence: "normale" });
  });

  it.each(CATEGORIES_INCIDENT.map((c) => c.slug))("la catégorie « %s » de l'écran est acceptée", async (slug) => {
    expect(await declarerIncidentBien(ORG, BIEN, {}, saisie({ categorie: slug }))).toEqual({ succes: "Incident déclaré." });
    expect(banc.rpc.mock.calls[0][1]).toMatchObject({ p_categorie: slug });
  });

  it.each([null, "", "   ", "categorie_bidon", "Autre", "toString"])("catégorie %j : refus avant tout appel à la base", async (categorie) => {
    expect(await declarerIncidentBien(ORG, BIEN, {}, saisie({ categorie }))).toEqual({ erreur: "Choisissez la catégorie la plus proche du problème." });
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.revalider).not.toHaveBeenCalled();
  });

  it.each(["", "tres_urgente", "Urgente", "toString", "constructor"])("urgence %j : refus avant tout appel à la base", async (urgence) => {
    expect(await declarerIncidentBien(ORG, BIEN, {}, saisie({ urgence }))).toEqual({ erreur: "Urgence invalide." });
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("les contrôles d'avant restent : titre, date, logement ; le refus de la base est rendu sans jargon", async () => {
    expect((await declarerIncidentBien(ORG, BIEN, {}, saisie({ titre: "   " }))).erreur).toMatch(/titre de 150 caractères/);
    expect((await declarerIncidentBien(ORG, BIEN, {}, saisie({ date: "2999-01-01" }))).erreur).toBe("Choisissez une date passée ou aujourd’hui.");
    expect((await declarerIncidentBien(ORG, BIEN, {}, saisie({ lot: "pas-un-identifiant" }))).erreur).toBe("Choisissez le logement concerné.");
    expect(banc.rpc).not.toHaveBeenCalled();
    banc.rpc.mockResolvedValueOnce({ data: null, error: { message: "Choisissez le logement concerné" } });
    const refus = await declarerIncidentBien(ORG, BIEN, {}, saisie({ lot: "" }));
    expect(refus.succes).toBeUndefined();
    expect(refus.erreur).toBeTruthy();
    expect(banc.revalider).not.toHaveBeenCalled();
  });
});
