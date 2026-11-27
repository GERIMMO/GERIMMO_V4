/**
 * Relecture du lot L4 (26/11/2026), fiche bien de l'espace agence. La phrase « La mise en location vérifie une dernière
 * fois qu'il ne manque rien au lot. » s'affichait sous la liste des lots dès qu'un lot était en brouillon, y compris
 * quand chacun de ces lots était bloqué : leur « Mettre en location » est alors désactivé, avec sa raison (E049, E160),
 * et aucune vérification n'aura lieu. Elle ne s'affiche plus que si au moins un lot en brouillon n'a aucun blocage.
 *
 * La fiche est un composant serveur : on l'appelle comme Next le fait, sur une base fictive, puis on lit l'arbre obtenu
 * sans rendre les composants enfants (incidents, consommations, boutons), qui ont leurs propres tests.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type LotFictif = { id: string; nom: string; etat: string; surface_m2: number | null; tantieme: number | null; pieces: number | null; meuble: boolean };

const banc = vi.hoisted(() => ({
  lots: [] as LotFictif[],
  blocages: [] as { lot_id: string; blocages: string[] | null }[],
  erreurBlocages: false,
  estProprietaire: false,
  traverseeLectureSeule: false,
}));

const ORG = "7f0a3b8e-6d1c-4e2f-9a5b-0c1d2e3f4a5b";
const BIEN = "2b9c4d1e-8f7a-4b6c-9d0e-1f2a3b4c5d6e";
const LOT_A = "a1111111-1111-4111-8111-111111111111";
const LOT_B = "b2222222-2222-4222-8222-222222222222";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("notFound"); },
  redirect: (vers: string) => { throw new Error(`redirect:${vers}`); },
  usePathname: () => "/",
  useRouter: () => ({ push() {}, refresh() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Une requête PostgREST fictive : chaque filtre rend la même requête, la lecture rend les lignes de la table. */
function requete(table: string) {
  const bien = { id: BIEN, nom: "Résidence du Port", type: "immeuble", address_line1: "1 quai du Port", address_line2: null, postal_code: "44000", city: "Nantes", archived_at: null };
  const lignes = (): unknown[] => (table === "biens" ? [bien] : table === "lots" ? banc.lots : []);
  const soi: object = new Proxy({}, {
    get(_cible, cle) {
      if (cle === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok, ko);
      if (cle === "maybeSingle" || cle === "single") return async () => ({ data: lignes()[0] ?? null, error: null });
      return () => soi;
    },
  });
  return soi;
}
const client = {
  from: (table: string) => requete(table),
  rpc: async (nom: string) =>
    nom === "lots_blocages_location"
      ? banc.erreurBlocages ? { data: null, error: { message: "lecture impossible" } } : { data: banc.blocages, error: null }
      : { data: null, error: null },
};
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: client, role: "gerant", estProprietaire: banc.estProprietaire, traverseeLectureSeule: banc.traverseeLectureSeule }),
}));
vi.mock("@/lib/lecture-consommations", () => ({ lireLiensConsommations: async () => ({ data: [], error: null }) }));

import { FicheBien } from "@/app/agence/[orgId]/parc/[bienId]/fiche-bien";
import { BoutonsEtatLot } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/boutons-etat-lot";

const RAPPEL = "La mise en location vérifie une dernière fois qu’il ne manque rien au lot.";

/** Les textes écrits par la fiche elle-même (les composants enfants ne sont pas appelés). */
function textes(noeud: ReactNode, acc: string[] = []): string[] {
  if (typeof noeud === "string" || typeof noeud === "number") acc.push(String(noeud));
  else if (Array.isArray(noeud)) noeud.forEach((n) => textes(n, acc));
  else if (isValidElement(noeud)) textes((noeud.props as { children?: ReactNode }).children, acc);
  return acc;
}
/** Les boutons d'état des lots posés par la fiche, avec ce qu'elle leur passe. */
function boutons(noeud: ReactNode, acc: { etat: string; bloque?: boolean }[] = []): { etat: string; bloque?: boolean }[] {
  if (Array.isArray(noeud)) noeud.forEach((n) => boutons(n, acc));
  else if (isValidElement(noeud)) {
    const element = noeud as ReactElement<{ children?: ReactNode; etat: string; bloque?: boolean }>;
    if (element.type === BoutonsEtatLot) acc.push({ etat: element.props.etat, bloque: element.props.bloque });
    boutons(element.props.children, acc);
  }
  return acc;
}
const lot = (id: string, nom: string, etat = "brouillon"): LotFictif => ({ id, nom, etat, surface_m2: 40, tantieme: 500, pieces: 2, meuble: false });
const fiche = async () => {
  const arbre = await FicheBien({ orgId: ORG, bienId: BIEN });
  return { phrase: textes(arbre).some((t) => t.includes(RAPPEL)), boutons: boutons(arbre) };
};

beforeEach(() => {
  banc.lots = [lot(LOT_A, "Lot A"), lot(LOT_B, "Lot B")];
  banc.blocages = [];
  banc.erreurBlocages = false;
  banc.estProprietaire = false;
  banc.traverseeLectureSeule = false;
});

describe("fiche bien : « La mise en location vérifie une dernière fois… » seulement si une mise en location est possible", () => {
  it("tous les lots en brouillon sont bloqués : leurs boutons sont désactivés, la phrase n'est plus affichée", async () => {
    banc.blocages = [{ lot_id: LOT_A, blocages: ["dpe_manquant"] }, { lot_id: LOT_B, blocages: ["surface_manquante"] }];
    const { phrase, boutons: poses } = await fiche();
    expect(poses).toEqual([{ etat: "brouillon", bloque: true }, { etat: "brouillon", bloque: true }]);
    expect(phrase).toBe(false);
  });

  it("un lot bloqué en brouillon, l'autre loué : la phrase n'est pas affichée", async () => {
    banc.lots = [lot(LOT_A, "Lot A"), lot(LOT_B, "Lot B", "loue")];
    banc.blocages = [{ lot_id: LOT_A, blocages: ["dpe_manquant"] }, { lot_id: LOT_B, blocages: [] }];
    expect((await fiche()).phrase).toBe(false);
  });

  it("témoin (passait déjà) : un lot en brouillon sans blocage à côté d'un lot bloqué : la phrase reste", async () => {
    banc.blocages = [{ lot_id: LOT_A, blocages: ["dpe_manquant"] }, { lot_id: LOT_B, blocages: [] }];
    const { phrase, boutons: poses } = await fiche();
    expect(poses).toEqual([{ etat: "brouillon", bloque: true }, { etat: "brouillon", bloque: false }]);
    expect(phrase).toBe(true);
  });

  it("témoin (passait déjà) : lecture des blocages en échec : les boutons restent cliquables, la phrase aussi", async () => {
    banc.erreurBlocages = true;
    const { phrase, boutons: poses } = await fiche();
    expect(poses.every((b) => b.bloque === false)).toBe(true);
    expect(phrase).toBe(true);
  });

  it("témoin (passait déjà) : aucun lot en brouillon, ou espace du propriétaire direct : pas de phrase", async () => {
    banc.lots = [lot(LOT_A, "Lot A", "disponible"), lot(LOT_B, "Lot B", "loue")];
    expect((await fiche()).phrase).toBe(false);
    banc.lots = [lot(LOT_A, "Lot A")];
    banc.estProprietaire = true;
    expect((await fiche()).phrase).toBe(false);
  });

  it("traversée en lecture seule : aucun bouton d'état n'est posé, la phrase n'est pas affichée non plus", async () => {
    banc.traverseeLectureSeule = true;
    const { phrase, boutons: poses } = await fiche();
    expect(poses).toEqual([]);
    expect(phrase).toBe(false);
  });
});
