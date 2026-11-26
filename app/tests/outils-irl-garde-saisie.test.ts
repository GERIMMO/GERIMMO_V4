/**
 * Q72, partie retenue : l'outil public de l'IRL reprend le garde-fou de saisie de l'application. `reviser_loyer` refuse
 * une révision quand le rapport entre le nouvel indice et l'indice de référence sort de la plage de 0,8 à 1,25, bornes
 * comprises (migration 20261124150000, « Révision refusée : vérifiez les indices saisis »). Ce n'est pas une règle de
 * droit (Q71) : il n'arrête que les fautes de frappe. L'outil public, lui, imprimait une lettre avec un indice de 14,68 au
 * lieu de 146,68 (loyer décuplé). Le garde-fou ne vaut que pour des indices tapés : ceux que l'outil lit chez l'Insee n'en
 * sont pas.
 * Les autres règles de l'application (révision sur un an après une année perdue, premier terme après la demande, délai
 * d'un an) ne sont PAS reprises : elles attendent le juriste (JURISTE.md, partie 7, points 1, 2 et 4).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
vi.mock("next/font/local", () => ({ default: () => ({ className: "police-document" }) }));

import { CalculateurIrl } from "../src/app/outils/calcul-irl/calculateur-irl";
import { Alerte, Champ, Choix, Segments } from "../src/components/outils/champs";
import { ChampAdresse } from "../src/components/outils/champ-adresse";
import { ChiffreHero, Pastille } from "../src/components/outils/resultats";
import { RAPPORT_INDICES_MAX, RAPPORT_INDICES_MIN, calculerRevisionIrl, type EntreeIrl } from "../src/lib/outils/irl";
import type { ObservationIrl } from "../src/lib/outils/irl-insee";
import { monter, type Instance } from "./aide/hooks-sans-dom";

const ENTREE: EntreeIrl = {
  loyer: 850,
  indiceReference: 146.68,
  trimestreReference: { trimestre: 2, annee: 2025 },
  indiceNouveau: 148.37,
  trimestreNouveau: { trimestre: 2, annee: 2026 },
  indicesSaisis: true,
};

describe("garde-fou de saisie : la plage de l'application (0,8 à 1,25, bornes comprises)", () => {
  it("reprend les bornes de `reviser_loyer` (migration 20261124150000)", () => {
    expect([RAPPORT_INDICES_MIN, RAPPORT_INDICES_MAX]).toEqual([0.8, 1.25]);
    const migration = readFileSync(
      path.resolve(__dirname, "../supabase/migrations/20261124150000_revision_loyer_seconde_reprise_d2.sql"),
      "utf8"
    );
    expect(migration).toContain("between 0.8 and 1.25");
  });

  it("une faute de frappe (14,68 au lieu de 146,68) ne donne ni loyer ni lettre, et l'alerte dit quoi vérifier", () => {
    const r = calculerRevisionIrl({ ...ENTREE, indiceReference: 14.68 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.manque).toEqual([]);
    const alerte = r.alertes.find((a) => a.code === "indices-invraisemblables");
    expect(alerte?.gravite).toBe("erreur");
    expect(alerte?.message).toBe(
      "Révision refusée : vérifiez les indices saisis. Le nouvel indice (148,37) et l'indice de référence (14,68) doivent être deux nombres positifs proches l'un de l'autre."
    );
  });

  it("les bornes sont comprises ; juste au-delà, refus", () => {
    expect(calculerRevisionIrl({ ...ENTREE, indiceReference: 100, indiceNouveau: 125 }).ok).toBe(true);
    expect(calculerRevisionIrl({ ...ENTREE, indiceReference: 100, indiceNouveau: 80 }).ok).toBe(true);
    expect(calculerRevisionIrl({ ...ENTREE, indiceReference: 100, indiceNouveau: 125.01 }).ok).toBe(false);
    expect(calculerRevisionIrl({ ...ENTREE, indiceReference: 100, indiceNouveau: 79.99 }).ok).toBe(false);
  });

  it("une révision normale passe, et des indices lus chez l'Insee (non tapés) ne passent pas par le garde-fou", () => {
    const r = calculerRevisionIrl(ENTREE);
    expect(r.ok && r.nouveauLoyer).toBe(859.79);
    expect(calculerRevisionIrl({ ...ENTREE, indiceReference: 14.68, indicesSaisis: false }).ok).toBe(true);
  });
});

// ── L'écran : saisie manuelle (série de l'Insee non lue) ──
type El = ReactElement<Record<string, unknown>>;
type Calculateur = Instance<{ serie: ObservationIrl[] | null }, unknown>;

function elements(n: unknown, acc: El[] = []): El[] {
  if (Array.isArray(n)) {
    for (const x of n) elements(x, acc);
    return acc;
  }
  if (!isValidElement(n)) return acc;
  const el = n as El;
  acc.push(el);
  for (const v of Object.values(el.props)) if (v && typeof v === "object") elements(v, acc);
  return acc;
}
function texte(n: unknown): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(texte).join("");
  if (isValidElement(n)) return texte((n as El).props.children);
  return "";
}
const tous = (i: Calculateur) => elements(i.rendu);
const champ = (i: Calculateur, id: string) =>
  tous(i).find((e) => (e.type === Champ || e.type === Choix || e.type === ChampAdresse) && e.props.id === id);
const segments = (i: Calculateur, nom: string) => tous(i).find((e) => e.type === Segments && e.props.nom === nom);
const pastille = (i: Calculateur) => texte(tous(i).find((e) => e.type === Pastille)?.props.children);
const nouveauLoyer = (i: Calculateur) =>
  tous(i).find((e) => e.type === ChiffreHero && e.props.testId === "irl-nouveau-loyer")?.props.valeur as string | undefined;
const alertes = (i: Calculateur) => tous(i).filter((e) => e.type === Alerte).map((e) => texte(e.props.children));
const boutonImprimer = (i: Calculateur) => tous(i).find((e) => e.type === "button" && texte(e.props.children).includes("Imprimer la lettre"));

async function saisir(i: Calculateur, id: string, valeur: string) {
  (champ(i, id)!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}
async function cocher(i: Calculateur, nom: string, valeur: string) {
  (segments(i, nom)!.props.onChange as (v: string) => void)(valeur);
  await i.vider();
}

describe("outil public IRL, saisie manuelle : le garde-fou refuse le loyer et la lettre", () => {
  it("indice de référence tapé 14,68 : « À corriger », aucun nouveau loyer, lettre impossible ; corrigé, le calcul revient", async () => {
    const i = monter(CalculateurIrl, { serie: null }) as Calculateur;
    i.stabiliser();
    await i.vider();
    await saisir(i, "irl-loyer", "850");
    await cocher(i, "irl-trim-ref", "T2");
    await saisir(i, "irl-annee-ref", "2025");
    await saisir(i, "irl-indice-ref", "14,68");
    await cocher(i, "irl-trim-nouv", "T2");
    await saisir(i, "irl-annee-nouv", "2026");
    await saisir(i, "irl-indice-nouv", "148,37");
    expect(nouveauLoyer(i)).toBeUndefined();
    expect(pastille(i)).toBe("À corriger");
    expect(alertes(i).some((a) => a.startsWith("Révision refusée : vérifiez les indices saisis."))).toBe(true);
    expect(tous(i).some((e) => e.type === "p" && texte(e.props.children) === "Aucun nouveau loyer n'est calculé avec ces indices.")).toBe(true);
    expect(boutonImprimer(i)?.props.disabled).toBe(true);
    await saisir(i, "irl-indice-ref", "146,68");
    expect(nouveauLoyer(i)).toMatch(/^859,79\s€$/);
    expect(pastille(i)).toBe("Indices cohérents");
    i.demonter();
  });
});
