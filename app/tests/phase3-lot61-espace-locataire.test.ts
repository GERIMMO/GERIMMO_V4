/**
 * Phase 3, lot 61 — défauts d'écran de l'espace du LOCATAIRE (et de /compte vu par un locataire), relevés sur les
 * captures de la passe 1.
 *
 * Trois sujets majeurs :
 *  1. « Mes paiements » et la FAQ promettaient « quittance établie et disponible ici — rien à demander » alors qu'un
 *     document du même historique attend que l'émetteur complète ses informations obligatoires (E013, E130) ;
 *  2. « Mes demandes » rendait la « Discussion de l'intervention » après TOUTES les demandes, sans dire laquelle elle
 *     concernait : elle se lisait sous la mauvaise (E014, E131) ;
 *  3. /compte dit au locataire d'écrire à son gestionnaire pour les données de sa location ; /compte/donnees, où mène
 *     le bouton, ne le disait pas et n'avait ni bandeau ni déconnexion (E019, E140, E021, E143).
 * Et les défauts mineurs : textes (E015, E016, E017, E018, E020, E022, E132, E136, E142), titres (E023), initiales
 * (E137), ancienne adresse des règles (E138).
 *
 * Sans base : la session et les lectures sont des doublures ; aucun appel réel.
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const banc = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown>,
  disponibilites: {} as Record<string, string>,
  type: "agence" as "agence" | "proprietaire_direct",
  adhesions: [] as { role: string; organization_id: string }[],
  demandesDonnees: [] as Record<string, unknown>[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/components/suivi-echeanciers-charges", () => ({ SuiviEcheanciersCharges: () => null }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/quittance-conforme", () => ({ disponibilitesQuittances: async () => banc.disponibilites }));
// La discussion est un composant serveur asynchrone : une doublure qui dit quelle intervention et quelle demande.
vi.mock("@/components/echanges-intervention", () => ({
  EchangesIntervention: ({ intervention, demande }: { intervention: string; demande?: string }) =>
    createElement("section", { "data-discussion": intervention }, `Discussion ${intervention} | ${demande ?? "sans demande"}`),
}));
vi.mock("@/app/compte/formulaire-mot-de-passe", () => ({ FormulaireMotDePasse: () => null }));
vi.mock("@/app/compte/second-facteur", () => ({ SecondFacteur: () => null }));
vi.mock("@/app/compte/conditions-acceptees", () => ({ ConditionsAcceptees: () => null }));
vi.mock("@/app/compte/donnees/archive", () => ({ ArchiveComplete: () => null }));
vi.mock("@/app/compte/donnees/formulaire", () => ({ FormulaireDonnees: () => createElement("form", null, "Formulaire de demande") }));

// Une base minimale : les RPC rendent ce que le test a posé ; les tables, des listes.
function client() {
  const table = (nom: string) => {
    const lignes = nom === "memberships" ? banc.adhesions : nom === "retours_utilisateurs" ? banc.demandesDonnees : [];
    const resultat = { data: lignes, error: null, count: lignes.length };
    const q: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "like", "in", "order", "limit", "range", "contains"]) q[op] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultat).then(ok, ko);
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "compte-1", email: "zoe@exemple.invalid", last_sign_in_at: null } } }) },
    from: table,
    rpc: (nom: string) => {
      const resultat = {
        data: nom === "attestation_emetteur_locataire" ? { type: banc.type, nom: "ESSAI espace", bailleurs: [{ prenom: "Claire", nom: "Moreau" }] } : (banc.donnees[nom] ?? []),
        error: null,
        count: ((banc.donnees[nom] as unknown[] | undefined) ?? []).length,
      };
      const q = { order: () => q, range: () => Promise.resolve(resultat), then: (ok: (r: typeof resultat) => unknown) => Promise.resolve(resultat).then(ok) };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async (orgId: string) => ({
    supabase: client(),
    user: { id: "compte-1" },
    organisation: { id: orgId, name: "ESSAI espace" },
    personne: { id: "personne-1", nom: "Martin", prenom: "Zoé" },
    adhesionActive: true,
  }),
}));

import PageLoyers from "@/app/locataire/[orgId]/loyers/page";
import PageFaq from "@/app/locataire/[orgId]/faq/page";
import PageDemandes from "@/app/locataire/[orgId]/demandes/page";
import PageReleves from "@/app/locataire/[orgId]/releves/page";
import PageCompte from "@/app/compte/page";
import PageDonnees from "@/app/compte/donnees/page";
import PageVeille from "@/app/veille/page";
import { IncidentsLocataire, type IncidentLocataire } from "@/app/locataire/[orgId]/incidents-locataire";
import { nomDemande } from "@/lib/incidents";

const texteDe = (html: string) =>
  html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** Le code sans ses commentaires (ils citent l'ancien texte pour dire pourquoi il a changé). */
const sansCommentaires = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const props = { params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}) } as never;
const rendre = async (page: (p: never) => Promise<unknown>) => renderToStaticMarkup((await page(props)) as never);
const bail = { bail_id: "bail", etat: "actif", type: "nu", date_debut: "2026-10-01", loyer_hc: 650, charges: 50, document_signe: null, lot_nom: "Lot 1" };
const novembre = { periode: "2026-11-01", montant_du: 700, montant_couvert: 300, statut: "partiel", quittance_id: "q-nov" };

beforeEach(() => {
  banc.donnees = {};
  banc.disponibilites = {};
  banc.type = "agence";
  banc.adhesions = [{ role: "locataire", organization_id: ORG }];
  banc.demandesDonnees = [];
});

// ─── 1. La quittance promise (E013, E130) ────────────────────────────────────────────────────────────────────────────
describe("Mes paiements : la promesse de quittance suit l'état réel du document", () => {
  it("un document « en préparation » : la phrase dit ce qui manque et mène à l'interlocuteur, plus « rien à demander »", async () => {
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [bail] };
    banc.disponibilites = { "q-nov": "en_preparation" };
    const html = await rendre(PageLoyers);
    const texte = texteDe(html);
    expect(texte).toContain("Document en préparation");
    expect(texte).toContain(
      "Après paiement intégral, votre quittance sera disponible ici dès que votre gestionnaire aura complété les informations obligatoires du document. Vous pouvez le lui demander : écrire à mon gestionnaire",
    );
    expect(texte).not.toContain("rien à demander");
    expect(html).toContain(`href="/locataire/${ORG}/contact"`);
  });

  it("chez un propriétaire qui gère lui-même : « votre bailleur » (Q42), jamais « gestionnaire »", async () => {
    banc.type = "proprietaire_direct";
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [bail] };
    banc.disponibilites = { "q-nov": "en_preparation" };
    const texte = texteDe(await rendre(PageLoyers));
    expect(texte).toContain("dès que votre bailleur aura complété les informations obligatoires du document");
    expect(texte).toContain("écrire à mon bailleur");
  });

  it("témoin : document disponible, la phrase d'origine reste", async () => {
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [bail] };
    banc.disponibilites = { "q-nov": "disponible" };
    const texte = texteDe(await rendre(PageLoyers));
    expect(texte).toContain("Après paiement intégral, votre quittance est établie et disponible ici — rien à demander.");
    expect(texte).not.toContain("aura complété les informations obligatoires");
  });

  it("la FAQ ne promet plus « Rien à demander » sans réserve", async () => {
    const texte = texteDe(await rendre(PageFaq));
    expect(texte).not.toContain("Mes documents. Rien à demander.");
    expect(texte).toContain(
      "En principe, rien à demander. Si le document reste marqué « en préparation », votre gestionnaire doit encore compléter des informations obligatoires : vous pouvez le lui demander depuis Mon gestionnaire.",
    );
  });
});

// ─── E016, E134, E136 : l'historique et la dette ─────────────────────────────────────────────────────────────────────
describe("Mes paiements : historique et dette", () => {
  it("le bail commence avant le premier mois de l'historique : l'écran le dit", async () => {
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [bail] };
    const texte = texteDe(await rendre(PageLoyers));
    expect(texte).toContain(
      "Cet historique commence en novembre 2026 : les mois antérieurs de votre bail (depuis le 01/10/2026) n'y figurent pas. Pour un mois plus ancien, écrivez à votre gestionnaire.",
    );
  });
  it("témoin : l'historique commence le mois du bail, aucune mention", async () => {
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [{ ...bail, date_debut: "2026-11-15" }] };
    expect(texteDe(await rendre(PageLoyers))).not.toContain("Cet historique commence");
  });
  it("la dette d'un seul mois ne se dit plus « Des loyers restent dus »", async () => {
    banc.donnees = { mon_echeancier_locataire: [novembre], mon_bail_locataire: [bail] };
    const texte = texteDe(await rendre(PageLoyers));
    expect(texte).not.toContain("Des loyers restent dus");
    expect(texte).toMatch(/Il reste 400,00 € à régler sur vos loyers échus\./);
  });
});

// ─── 2. La discussion de l'intervention (E014, E131) ─────────────────────────────────────────────────────────────────
describe("Mes demandes : la discussion suit SA demande et la nomme", () => {
  const incident = (id: string, description: string): IncidentLocataire => ({
    id, numero: `INC-${id}`, categorie: "plomberie_fuite", piece: "Cuisine", description, urgence: "normale", etat: "en_cours",
    imputation: "proprietaire", imputation_justification: null, imputation_contestee_le: null, clos_le: null,
    declare_le: "2026-11-20T10:00:00Z", nb_photos: 0, est_declarant: true,
  });
  const suivi = (incident_id: string, etape: string, intervention_id: string | null) => ({
    incident_id, etape, intervention_id, artisan: intervention_id ? "ESSAI Plomberie" : null, nb_artisans_consultes: 1, nb_devis_recus: 1,
    rdv_debut: null, rdv_fin: null, terminee_le: null, creneaux_a_choisir: 0, mes_creneaux_en_attente: 0, creneaux_refuses: 0,
    arbitrage: false, travaux_realises: null, nouvelle_intervention_necessaire: false, photos_apres: [], deja_notee: false,
  });

  it("le nom d'une demande : sa catégorie puis les premiers mots du locataire", () => {
    const titre = nomDemande({ categorie: "plomberie_fuite" });
    expect(nomDemande({ categorie: "plomberie_fuite", description: "Fuite sous l'évier\nDepuis hier" })).toBe(`${titre} — Fuite sous l'évier`);
    expect(nomDemande({ categorie: "plomberie_fuite", description: "x".repeat(200) })).toBe(`${titre} — ${"x".repeat(77)}…`);
    expect(nomDemande({ categorie: "plomberie_fuite", description: "  " })).toBe(titre);
  });

  it("deux demandes, une seule intervention : la discussion est rendue sous la PREMIÈRE, avant la seconde, et la nomme", async () => {
    // L'ordre de la capture : la demande avec artisan d'abord, la demande « devis encore ouverte » ensuite.
    banc.donnees = {
      mes_incidents_locataire: [incident("a", "Fuite sous l'évier"), incident("b", "Demande de devis encore ouverte")],
      mon_suivi_intervention: [suivi("a", "artisan_retenu", "mission-a"), suivi("b", "recherche_artisan", null)],
      mon_bail_locataire: [bail],
    };
    const html = await rendre(PageDemandes);
    const carteA = html.indexOf('id="demande-a"'), carteB = html.indexOf('id="demande-b"'), discussion = html.indexOf('data-discussion="mission-a"');
    expect(carteA).toBeGreaterThan(-1);
    expect(discussion).toBeGreaterThan(carteA);
    // Avant le correctif : la discussion venait APRÈS la carte de la demande « b » (elle se lisait comme la sienne).
    expect(discussion).toBeLessThan(carteB);
    expect(html.match(/data-discussion=/g)).toHaveLength(1);
    expect(texteDe(html)).toContain(`Discussion mission-a | ${nomDemande({ categorie: "plomberie_fuite", description: "Fuite sous l'évier" })}`);
    // La carte et sa discussion sont dans un même bloc.
    expect(html).toMatch(/<div class="space-y-1.5" data-demande-et-discussion="a">/);
  });

  it("chaque demande a sa discussion quand les deux ont une intervention", async () => {
    banc.donnees = {
      mes_incidents_locataire: [incident("a", "Fuite sous l'évier"), incident("b", "Chasse d'eau")],
      mon_suivi_intervention: [suivi("a", "artisan_retenu", "mission-a"), suivi("b", "artisan_retenu", "mission-b")],
      mon_bail_locataire: [bail],
    };
    const html = await rendre(PageDemandes);
    const ordre = ['id="demande-a"', 'data-discussion="mission-a"', 'id="demande-b"', 'data-discussion="mission-b"'].map((m) => html.indexOf(m));
    expect(ordre.every((p) => p > -1)).toBe(true);
    expect([...ordre].sort((x, y) => x - y)).toEqual(ordre);
    expect(texteDe(html)).toContain("Discussion mission-b | " + nomDemande({ categorie: "plomberie_fuite", description: "Chasse d'eau" }));
  });

  it("la liste pose la discussion reçue juste sous la carte de sa demande (composant seul)", () => {
    const html = renderToStaticMarkup(createElement(IncidentsLocataire, {
      orgId: ORG, incidents: [incident("a", "Un"), incident("b", "Deux")], interlocuteur: "gestionnaire",
      discussions: { b: createElement("p", { "data-essai": "b" }, "discussion de b") },
    }));
    expect(html.indexOf('data-essai="b"')).toBeGreaterThan(html.indexOf('id="demande-b"'));
    expect(html).not.toContain('data-demande-et-discussion="a"');
  });

  it("le vrai composant de discussion affiche la demande concernée et la porte dans son nom accessible", () => {
    const source = readFileSync("src/components/echanges-intervention.tsx", "utf8");
    expect(source).toContain("{demande&&<p data-demande-concernee className=\"text-sm\">Pour votre demande : <strong className=\"font-medium\">{demande}</strong></p>}");
    expect(source).toContain("aria-label={demande?`Discussion de l’intervention — ${demande}`:\"Discussion de l’intervention\"}");
  });
});

// ─── 3. Les données personnelles : /compte et /compte/donnees disent la même chose (E019, E140…) ─────────────────────
describe("/compte/donnees : même renvoi, même bandeau que /compte", () => {
  const donnees = async (recherche: Record<string, string> = {}) =>
    renderToStaticMarkup((await PageDonnees({ searchParams: Promise.resolve(recherche) })) as never);
  for (const cas of [
    { type: "agence" as const, phrase: "Pour tout ce qui concerne votre location, écrivez à votre gestionnaire depuis Mon gestionnaire : c'est lui qui y répond, sous un mois." },
    { type: "proprietaire_direct" as const, phrase: "Pour tout ce qui concerne votre location, écrivez à votre bailleur depuis Mon bailleur : c'est lui qui y répond, sous un mois." },
  ]) {
    it(`locataire (${cas.type}) : la phrase de /compte est reprise mot pour mot, AVANT le formulaire, avec le lien`, async () => {
      banc.type = cas.type;
      const compte = texteDe(renderToStaticMarkup((await PageCompte()) as never));
      const html = await donnees();
      const texte = texteDe(html);
      expect(compte).toContain(cas.phrase);
      expect(texte).toContain(cas.phrase);
      expect(texte.indexOf(cas.phrase)).toBeLessThan(texte.indexOf("Formulaire de demande"));
      expect(html).toContain(`href="/locataire/${ORG}/contact"`);
      expect(texte).toContain("Le formulaire ci-dessous ne lui est pas transmis");
      expect(texte).toContain("Faire une demande sur mon compte");
    });
  }

  it("locataire de plusieurs espaces : la tournure de /compte, sans choisir un interlocuteur", async () => {
    banc.adhesions = [{ role: "locataire", organization_id: ORG }, { role: "locataire", organization_id: "22222222-2222-4222-8222-222222222222" }];
    const texte = texteDe(await donnees());
    expect(texte).toContain("Pour les données d'une location, adressez-vous à son bailleur ou à son gestionnaire, depuis la messagerie de l'espace concerné.");
  });

  it("témoin : un compte sans adhésion de locataire ne reçoit pas le renvoi et garde « Faire une demande »", async () => {
    banc.adhesions = [{ role: "proprietaire_direct", organization_id: ORG }];
    const html = await donnees();
    expect(html).not.toContain("data-renvoi-location");
    expect(texteDe(html)).toContain("Faire une demande");
    expect(texteDe(html)).not.toContain("Faire une demande sur mon compte");
  });

  it("le bandeau de /compte : retour à « Mon espace » et « Se déconnecter » (E021, E143)", async () => {
    const html = await donnees();
    expect(html).toContain('class="bandeau-appli"');
    expect(html).toMatch(new RegExp(`<a[^>]*href="/locataire/${ORG}"[^>]*>← Mon espace</a>`));
    expect(texteDe(html)).toContain("Se déconnecter");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("la liste dit de quelles demandes il s'agit, et qu'il n'y en a aucune (E020, E142)", async () => {
    const texte = texteDe(await donnees());
    expect(texte).toContain("Mes demandes sur mes données");
    expect(texte).toContain("Vous n’avez fait aucune demande sur vos données.");
    expect(texte).not.toContain("Aucune demande sur cette page.");
    // Sur une page suivante vide, la formule d'origine reste juste.
    expect(texteDe(await donnees({ page: "2" }))).toContain("Aucune demande sur cette page.");
  });

  it("le titre d'une demande est un h3 sous le h2 de la liste (E023)", async () => {
    banc.demandesDonnees = [{ id: "abcdef12-0000-4000-8000-000000000000", titre: "Recevoir une copie de mes données", description: "Ma demande", etat: "nouveau", reponse: null, cree_le: "2026-11-20T10:00:00Z" }];
    const html = await donnees();
    expect(html).toMatch(/<h3 class="titre-carte" data-titre-demande-donnees="true">[^<]*Recevoir une copie de mes données<\/h3>/);
    expect(html).not.toMatch(/<h2[^>]*>[^<]*Recevoir une copie de mes données<\/h2>/);
  });

  it("le lien vers la confidentialité porte le même nom et le même dessin sur les deux écrans (E022, E144, E139)", async () => {
    const lien = /<a class="lien-texte inline-flex min-h-6 items-center text-sm" href="\/confidentialite">Lire la politique de confidentialité<\/a>/;
    expect(await donnees()).toMatch(lien);
    expect(renderToStaticMarkup((await PageCompte()) as never)).toMatch(lien);
    expect(await donnees()).not.toContain("règles de confidentialité");
  });

  it("l'adresse de connexion ne se coupe plus au milieu d'un mot (E135)", async () => {
    const html = renderToStaticMarkup((await PageCompte()) as never);
    expect(html).not.toContain("break-all");
    expect(html).toContain('<dd class="font-medium [overflow-wrap:anywhere]">zoe@exemple.invalid</dd>');
  });
});

// ─── Les autres textes ───────────────────────────────────────────────────────────────────────────────────────────────
describe("textes de l'espace", () => {
  it("attestation refusée : « sera disponible », pas « redeviendra » (E015, E136)", async () => {
    const source = sansCommentaires(readFileSync("src/app/attestation-loyer/[orgId]/page.tsx", "utf8"));
    expect(source).not.toContain("redeviendra");
    expect(source.replace(/\s+/g, " ")).toContain("L&apos;attestation sera disponible dès que votre compte sera soldé.");
  });

  it("Mes relevés : la consigne ne s'affiche que s'il y a un relevé à transmettre, et ne promet plus de préremplissage (E017, E133)", async () => {
    const vide = texteDe(await rendre(PageReleves));
    expect(vide).toContain("Aucun relevé à transmettre pour le moment");
    expect(vide).not.toContain("Renseignez l’index");
    expect(vide).not.toContain("Recopiez l’index affiché sur le compteur. Vous pouvez joindre");
    banc.donnees = { mes_releves_consommation: [{ demande_id: "d1", peut_repondre: true, echeance: "2026-12-01", libelle: "Eau froide", unite: "m3", lot_nom: "Lot 1", numero: null, emplacement: null, index_precedent: 10, date_precedente: "2026-06-01", index_releve: null, date_releve: null, statut: "ouverte" }] };
    const avec = texteDe(await rendre(PageReleves));
    expect(avec).toContain("Recopiez l’index affiché sur le compteur. Vous pouvez joindre une photo du compteur (facultatif).");
    expect(avec).not.toContain("peut vous aider à le préremplir");
  });

  it("Signaler un problème : l'encart ne promet plus « immédiatement… Aucune surprise à la sortie » (E132)", () => {
    const source = sansCommentaires(readFileSync("src/app/locataire/[orgId]/incident/formulaire-incident-locataire.tsx", "utf8"));
    expect(source).not.toContain("Aucune surprise à la sortie");
    expect(source).not.toContain("nous vous indiquons immédiatement");
    expect(source.replace(/\s+/g, " ")).toContain("Ce repère est indicatif : la décision revient à votre {interlocuteur}, après examen de votre demande.");
  });

  it("le titre du reçu ne met plus de majuscule au mois (E018)", () => {
    const source = readFileSync("src/app/quittance/[quittanceId]/page.tsx", "utf8");
    expect(source).not.toContain('className="capitalize"');
    expect(source).toContain("const titre = `${nature} — ${mois}`;");
  });

  it("les initiales de l'avatar suivent le nom affiché : nom puis prénom (E137)", () => {
    const source = readFileSync("src/app/locataire/[orgId]/layout.tsx", "utf8");
    expect(source).toContain('`${(personne.nom?.[0] ?? "").toUpperCase()}${(personne.prenom?.[0] ?? "").toUpperCase()}`');
    expect(source).not.toContain('`${(personne.prenom?.[0] ?? "").toUpperCase()}${(personne.nom?.[0] ?? "").toUpperCase()}`');
  });
});

// ─── E138 : l'ancienne adresse des règles ────────────────────────────────────────────────────────────────────────────
describe("/veille?public=locataire renvoie dans l'espace du locataire", () => {
  const veille = async (recherche: Record<string, string>) => {
    try {
      await PageVeille({ searchParams: Promise.resolve(recherche) });
      return null;
    } catch (e) {
      return (e as { url?: string }).url ?? null;
    }
  };
  it("un seul espace de locataire : ses règles, avec son menu", async () => {
    expect(await veille({ public: "locataire" })).toBe(`/locataire/${ORG}/regles`);
  });
  it("le paramètre « retour » désigne l'espace", async () => {
    banc.adhesions = [];
    expect(await veille({ public: "locataire", retour: `/locataire/${ORG}` })).toBe(`/locataire/${ORG}/regles`);
  });
  it("témoins : un compte d'agence, ou un autre public, restent sur la page", async () => {
    banc.adhesions = [{ role: "admin_agence", organization_id: ORG }];
    expect(await veille({ public: "locataire" })).toBeNull();
    banc.adhesions = [{ role: "locataire", organization_id: ORG }];
    expect(await veille({ public: "bailleur" })).toBeNull();
  });
});
