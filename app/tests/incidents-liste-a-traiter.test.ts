/**
 * Audit du 13/10/2026, PRO2-13, décision D19 (option A) : la LISTE des incidents compte « À traiter » tout incident dont
 * un devis valable attend la décision, et le dit sur le rang (« Devis à décider »). `devis-a-decider-ecrans.test.ts`
 * garde la fonction pure `incidentsATraiter` ; ici, la page elle-même, rendue avec un client Supabase qui HONORE les
 * filtres (voir `faux-postgrest.ts`) : retirer le filtre d'agence, de statut ou de date de la requête des devis,
 * ne plus appeler `incidentsATraiter`, retirer la puce ou la mention d'échec de lecture fait tomber un test.
 *
 * L'horloge est fixée à 00 h 30 le 15 octobre à Paris, soit 22 h 30 le 14 en UTC : « aujourd'hui » est le 15, et un
 * devis valable « jusqu'au 14 » est expiré.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type BancFaux, type Ligne } from "./faux-postgrest";

const etat = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({
    supabase: etat.supabase,
    user: { id: "gerant-1" },
    role: "admin_agence",
    estProprietaire: false,
  }),
}));
// Le dossier ouvert à droite a ses propres lectures : il n'est pas l'objet de ce test.
vi.mock("../src/app/agence/[orgId]/incidents/pane-incident", () => ({ PaneIncident: () => null }));

import PageIncidents from "../src/app/agence/[orgId]/incidents/page";

const ORG = "org-a";
const AUTRE_ORG = "org-b";

const incident = (n: number, etatIncident: string): Ligne => ({
  id: `i${n}`,
  organization_id: ORG,
  lot_id: "lot-1",
  numero: `INC-${String(n).padStart(4, "0")}`,
  categorie: "plomberie_canalisation",
  urgence: "normale",
  etat: etatIncident,
  created_at: `2026-10-${String(n).padStart(2, "0")}T08:00:00Z`,
  responsable_account_id: null,
  lot: { nom: "Lot 1" },
  declarant: null,
});

const devis = (incidentId: string, statut: string, valideJusquAu: string, organisation = ORG): Ligne => ({
  id: `d-${incidentId}-${statut}-${valideJusquAu}`,
  organization_id: organisation,
  incident_id: incidentId,
  statut,
  valide_jusqu_au: valideJusquAu,
});

/**
 * Dix dossiers. Attendus « À traiter » : i1 (à qualifier), i9 (terminé), i2 et i7 (devis valable en attente).
 * Les autres portent chacun une raison de NE PAS l'être.
 */
function banc(): BancFaux {
  return {
    incidents: table("incidents", [
      incident(1, "declare"),
      incident(2, "qualifie"), // devis déposé, valable jusqu'au 20/10
      incident(3, "qualifie"), // devis déposé mais expiré hier (14/10)
      incident(4, "qualifie"), // devis déjà retenu
      incident(5, "affecte"), // un devis déposé, mais d'une AUTRE agence
      incident(6, "en_cours"), // aucun devis
      incident(7, "qualifie"), // devis déposé, valable jusqu'à aujourd'hui (15/10) inclus
      incident(8, "clos"), // clos, avec un devis valable qui traîne
      incident(9, "termine"),
      incident(10, "qualifie"), // devis annulé, valable encore
    ]),
    incident_devis: table("incident_devis", [
      devis("i2", "depose", "2026-10-20"),
      devis("i3", "depose", "2026-10-14"),
      devis("i4", "retenu", "2026-10-30"),
      devis("i5", "depose", "2026-10-30", AUTRE_ORG),
      devis("i7", "depose", "2026-10-15"),
      devis("i8", "depose", "2026-10-30"),
      devis("i10", "annule", "2026-10-30"),
    ]),
  };
}

let donnees: BancFaux;

beforeEach(() => {
  donnees = banc();
  etat.supabase = fauxClient(donnees, {
    org_membres_gerants: () => ({ data: [] }),
    interventions_a_evaluer: () => ({ data: [] }),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T22:30:00.000Z"));
});
afterEach(() => vi.useRealTimers());

async function afficher(vue: string): Promise<string> {
  const page = await PageIncidents({
    params: Promise.resolve({ orgId: ORG }),
    searchParams: Promise.resolve({ vue }),
  } as never);
  return renderToStaticMarkup(page as never);
}

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Le chiffre affiché dans l'onglet d'une vue (« — » quand la lecture a échoué). */
function compte(html: string, vue: string): string | undefined {
  return html.match(new RegExp(`data-vue="${vue}"[^>]*>(?:(?!</a>)[\\s\\S])*?<strong>([^<]*)</strong>`))?.[1];
}

/** Les rangs de la liste, dans l'ordre : numéro du dossier → texte du rang. */
function rangs(html: string): [string, string][] {
  return [...html.matchAll(/<a [^>]*class="rang[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const t = texte(m[1]);
    return [t.match(/INC-\d+/)![0], t];
  });
}

describe("la vue « À traiter » de la liste des incidents (D19)", () => {
  it("compte les états qui attendent l'agence ET les devis valables en attente, et liste ces dossiers", async () => {
    const html = await afficher("a-traiter");
    expect(compte(html, "a-traiter")).toBe("4");
    // Tri de la page : à qualifier, puis terminé, puis qualifié (le plus récent d'abord).
    expect(rangs(html).map(([numero]) => numero)).toEqual(["INC-0001", "INC-0009", "INC-0007", "INC-0002"]);
  });

  it("ne change pas les autres onglets : en cours, clos, tous", async () => {
    const html = await afficher("a-traiter");
    expect(compte(html, "en-cours")).toBe("9");
    expect(compte(html, "clos")).toBe("1");
    expect(compte(html, "tous")).toBe("10");
  });

  it("n'y met pas un dossier dont le devis a expiré la veille (jour de Paris, pas d'UTC)", async () => {
    const numeros = rangs(await afficher("a-traiter")).map(([numero]) => numero);
    expect(numeros).not.toContain("INC-0003");
  });

  it("y met un dossier dont le devis est valable jusqu'à aujourd'hui inclus", async () => {
    const numeros = rangs(await afficher("a-traiter")).map(([numero]) => numero);
    expect(numeros).toContain("INC-0007");
  });

  it("n'y met pas un dossier dont le devis est déjà retenu ou annulé", async () => {
    const numeros = rangs(await afficher("a-traiter")).map(([numero]) => numero);
    expect(numeros).not.toContain("INC-0004");
    expect(numeros).not.toContain("INC-0010");
  });

  it("n'y met pas un dossier dont le seul devis appartient à une autre agence", async () => {
    const html = await afficher("a-traiter");
    expect(rangs(html).map(([numero]) => numero)).not.toContain("INC-0005");
    expect(compte(html, "a-traiter")).toBe("4");
  });

  it("n'y met jamais un dossier clos, même avec un devis valable", async () => {
    expect(rangs(await afficher("a-traiter")).map(([numero]) => numero)).not.toContain("INC-0008");
  });
});

describe("la puce « Devis à décider » sur le rang", () => {
  it("s'affiche sur les dossiers dont un devis valable attend, et sur eux seuls", async () => {
    const lignes = rangs(await afficher("tous"));
    expect(lignes).toHaveLength(10);
    const avecPuce = lignes.filter(([, t]) => t.includes("Devis à décider")).map(([numero]) => numero);
    expect(avecPuce.sort()).toEqual(["INC-0002", "INC-0007"]);
  });

  it("garde l'état du dossier à côté de la puce", async () => {
    const rang = rangs(await afficher("tous")).find(([numero]) => numero === "INC-0002")![1];
    expect(rang).toContain("Devis à décider");
    expect(rang).toContain("Qualifié");
  });

  it("ne s'affiche pas sur un dossier clos", async () => {
    const rang = rangs(await afficher("tous")).find(([numero]) => numero === "INC-0008")![1];
    expect(rang).not.toContain("Devis à décider");
  });
});

describe("quand la lecture des devis échoue", () => {
  beforeEach(() => {
    donnees.incident_devis = table("incident_devis", [], "permission refusée");
  });

  it("l'onglet « À traiter » n'affiche pas un chiffre faux : il affiche « — »", async () => {
    const html = await afficher("en-cours");
    expect(compte(html, "a-traiter")).toBe("—");
    // Les onglets que cette lecture ne touche pas restent chiffrés.
    expect(compte(html, "en-cours")).toBe("9");
    expect(compte(html, "clos")).toBe("1");
  });

  it("l'écran dit ce qui n'a pas pu être lu", async () => {
    const html = await afficher("en-cours");
    expect(texte(html)).toContain("les devis reçus à décider");
    expect(html).toContain('role="alert"');
  });

  it("aucune puce n'est inventée", async () => {
    expect(texte(await afficher("tous"))).not.toContain("Devis à décider");
  });

  it("une vue « À traiter » vide ne dit pas « Rien dans cette vue » : c'est la lecture qui a échoué", async () => {
    donnees.incidents = table("incidents", [incident(2, "qualifie"), incident(6, "en_cours")]);
    const t = texte(await afficher("a-traiter"));
    expect(t).toContain("les incidents de la vue « À traiter »");
    expect(t).not.toContain("Rien dans cette vue");
  });
});

describe("sans échec de lecture", () => {
  it("une vue « À traiter » vide dit « Rien dans cette vue », sans encart d'échec", async () => {
    donnees.incidents = table("incidents", [incident(2, "qualifie"), incident(6, "en_cours")]);
    donnees.incident_devis = table("incident_devis", []);
    const html = await afficher("a-traiter");
    expect(compte(html, "a-traiter")).toBe("0");
    expect(texte(html)).toContain("Rien dans cette vue");
    expect(html).not.toContain('role="alert"');
  });
});
