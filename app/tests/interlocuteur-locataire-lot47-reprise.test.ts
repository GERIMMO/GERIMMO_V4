/**
 * Phase 3, lot 47 (reprise) — les constats des relecteurs sur le second passage.
 *
 *  1. Page Compte, compte qui est AUSSI locataire (propriétaire de son propre espace, par exemple) : il lisait
 *     « Demandez-la à votre gestionnaire », comme un compte dont les adhésions ne se lisent pas. Son adhésion de
 *     locataire décide ; une lecture en échec prend la tournure vraie dans tous les espaces.
 *  2. Locataire d'une agence sans bail actif, en préavis ou terminé (bail en brouillon) : `attestation_emetteur_locataire`
 *     ne rend rien, et l'identité vide se lisait « Mon bailleur… c'est lui qui y répond ». Le type de l'espace la
 *     complète (`organisations_portail`) : page Compte, titre de l'espace, attestation.
 *  3. Le défaut inverse : « Votre propriétaire » (discussion d'intervention, rendez-vous manqué) et « prévenez le
 *     propriétaire » (rappel de relevé) dits au locataire d'une agence, où c'est le gestionnaire qui écrit et consigne.
 *  4. « dans cette agence » dit au locataire d'un propriétaire : bail signé introuvable, et le refus écrit en base
 *     « Aucune fiche rattachée à votre compte dans cette agence » (cinq fonctions du locataire).
 * Chaque cas est rendu pour un propriétaire ET pour une agence, qui garde son texte. Aucun e-mail n'est envoyé : le
 * service d'e-mail est remplacé par une doublure qui garde le message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const m = vi.hoisted(() => ({
  client: null as unknown,
  service: null as unknown,
  envoyes: [] as { to: string; subject: string; html: string }[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.client }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => null }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/email", () => ({
  envoyerEmail: async (p: { to: string; subject: string; html: string }) => {
    m.envoyes.push({ to: p.to, subject: p.subject, html: p.html });
    return { id: `fictif-${m.envoyes.length}` };
  },
}));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspaceLocataire: async (orgId: string) => ({
    supabase: m.client,
    user: { id: "compte-1" },
    organisation: { id: orgId, name: "ESSAI espace" },
    personne: { id: "personne-1", nom: "Martin", prenom: "Zoé" },
    adhesionActive: true,
  }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierLocataire: async () => ({ supabase: m.client, user: { id: "compte-1" } }),
  verifierGerant: async () => ({ supabase: m.client, user: null, role: null }),
}));
vi.mock("@/lib/depot-direct", () => ({
  resoudreDepotsFormulaire: async () => null,
  limiteFichierDepose: () => 4 * 1024 * 1024,
}));
// Témoins des composants sans texte d'interlocuteur.
vi.mock("@/components/marque-organisation", () => ({ MarqueOrganisation: () => null }));
vi.mock("@/components/marque-gerimmo", () => ({ MarqueGerimmo: () => null }));
vi.mock("@/components/formulaire-deconnexion", () => ({ FormulaireDeconnexion: () => null }));
vi.mock("@/components/purger-copies-autres-comptes", () => ({ PurgerCopiesAutresComptes: () => null }));
vi.mock("@/components/echanges-intervention", () => ({ EchangesIntervention: () => null }));
vi.mock("@/components/rendez-vous-locataire-confirme", () => ({ RendezVousLocataireConfirme: () => null }));
vi.mock("@/app/locataire/[orgId]/incidents-locataire", () => ({ IncidentsLocataire: () => null }));
vi.mock("@/app/compte/formulaire-mot-de-passe", () => ({ FormulaireMotDePasse: () => null }));
vi.mock("@/app/compte/second-facteur", () => ({ SecondFacteur: () => null }));
vi.mock("@/app/compte/conditions-acceptees", () => ({ ConditionsAcceptees: () => null }));

import PageCompte from "@/app/compte/page";
import PageDemandesLocataire from "@/app/locataire/[orgId]/demandes/page";
import { GET as bailSigne } from "@/app/locataire/[orgId]/bail/fichier/route";
import { lireIdentiteContact } from "@/app/locataire/[orgId]/identite-contact";
import { deposerMaPiece } from "@/app/actions/pieces-demandees";
import { donnerMonConge } from "@/app/actions/conge-locataire";
import { completerIdentiteContact, lireIdentiteContactLocataire } from "@/lib/interlocuteur-locataire-serveur";
import { auteurCoteEspace, messageDeLaBasePourLocataire } from "@/lib/interlocuteur-locataire";
import { phraseRendezVousManque } from "@/lib/rendez-vous-manque";
import { envoyerRappelsGestes, messageRappelGeste } from "@/lib/notifications";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();

const ORG = "11111111-2222-4333-8444-555555555555";
const AUTRE = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const TYPES = [
  { nom: "propriétaire", type: "proprietaire_direct", qui: "bailleur" },
  { nom: "agence", type: "agence", qui: "gestionnaire" },
] as const;

/**
 * Un client de session fictif. Chaque requête rend la ligne de sa table (lecture unique) ou ses lignes (liste), quels
 * que soient ses filtres ; `rpc` répond par nom. `undefined` dans `tables` : la lecture échoue.
 */
function client(opts: {
  tables?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
  erreurs?: Record<string, string>;
  rpcErreurs?: Record<string, string>;
}) {
  const tables = opts.tables ?? {};
  const erreur = (table: string) => (opts.erreurs?.[table] ? { message: opts.erreurs[table] } : null);
  const from = (table: string): unknown => {
    const requete: unknown = new Proxy({}, {
      get(_cible, propriete) {
        if (propriete === "then") {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            Promise.resolve(
              erreur(table)
                ? { data: null, error: erreur(table) }
                : { data: Array.isArray(tables[table]) ? tables[table] : [], error: null },
            ).then(ok, ko);
        }
        if (propriete === "maybeSingle" || propriete === "single") {
          return async () => (erreur(table) ? { data: null, error: erreur(table) } : { data: Array.isArray(tables[table]) ? null : tables[table] ?? null, error: null });
        }
        return () => requete;
      },
    });
    return requete;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "compte-1", email: "zoe@exemple.invalid", last_sign_in_at: null } } }) },
    from,
    rpc: async (nom: string) =>
      opts.rpcErreurs?.[nom] ? { data: null, error: { message: opts.rpcErreurs[nom] } } : { data: opts.rpc?.[nom] ?? null, error: null },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
}

beforeEach(() => {
  m.client = null;
  m.service = null;
  m.envoyes = [];
  vi.unstubAllEnvs();
});

// ─── 1 et 2. La page Compte ──────────────────────────────────────────────────────────────────────────────────────────
describe("page Compte : le compte qui est aussi locataire, et le locataire d'agence sans bail actif", () => {
  const page = async () => texteDe(renderToStaticMarkup((await PageCompte()) as never));
  const locataire = { role: "locataire", organization_id: ORG };
  const sonEspace = { role: "proprietaire_direct", organization_id: AUTRE };

  for (const t of TYPES) {
    it(`locataire d'un espace ${t.nom} ET propriétaire de son propre espace : « Demandez-la à votre ${t.qui} »`, async () => {
      m.client = client({
        tables: { memberships: [locataire, sonEspace] },
        rpc: { attestation_emetteur_locataire: { type: t.type, nom: "ESSAI espace", bailleurs: [{ prenom: "Claire", nom: "Moreau" }] } },
      });
      const html = await page();
      expect(html).toContain(`Demandez-la à votre ${t.qui}, ou à l’assistance pour un compte propriétaire.`);
      // Plusieurs espaces : la carte des données garde la tournure de l'écran des espaces.
      expect(html).toContain("Pour les données d'une location, adressez-vous à son bailleur ou à son gestionnaire ;");
      if (t.qui === "bailleur") expect(html).not.toMatch(/(?<!ou )(?<!ou à )(votre|son) gestionnaire\b/);
    });
  }

  it("adhésions illisibles : la tournure vraie dans tous les espaces, plus « votre gestionnaire » seul", async () => {
    m.client = client({ erreurs: { memberships: "lecture refusée" } });
    const html = await page();
    expect(html).toContain("Demandez-la à votre bailleur ou à son gestionnaire, ou à l’assistance pour un compte propriétaire.");
    expect(html).not.toMatch(/(?<!ou )(?<!ou à )(votre|son) gestionnaire\b/);
  });

  it("un compte sans adhésion de locataire garde la phrase d'avant", async () => {
    m.client = client({ tables: { memberships: [sonEspace] } });
    expect(await page()).toContain("Demandez-la à votre gestionnaire, ou à l’assistance pour un compte propriétaire.");
  });

  it("locataire d'une agence au bail encore en brouillon : « votre gestionnaire », depuis « Mon gestionnaire »", async () => {
    // attestation_emetteur_locataire ne rend rien sans bail actif, en préavis ou terminé ; l'espace, lui, se lit.
    m.client = client({
      tables: { memberships: [locataire], organisations_portail: { type: "agence", name: "Agence des Lilas" } },
      rpc: { attestation_emetteur_locataire: null },
    });
    const html = await page();
    expect(html).toContain("Demandez-la à votre gestionnaire, ou à l’assistance pour un compte propriétaire.");
    expect(html).toContain("écrivez à votre gestionnaire depuis Mon gestionnaire : c'est lui qui y répond, sous un mois.");
    expect(html).not.toMatch(/bailleur/);
  });

  it("locataire d'un propriétaire sans bail actif : « votre bailleur », depuis « Mon bailleur »", async () => {
    m.client = client({
      tables: { memberships: [locataire], organisations_portail: { type: "proprietaire_direct", name: "Parc de Claire Moreau" } },
      rpc: { attestation_emetteur_locataire: null },
    });
    const html = await page();
    expect(html).toContain("écrivez à votre bailleur depuis Mon bailleur : c'est lui qui y répond, sous un mois.");
    expect(html).not.toMatch(/gestionnaire/i);
  });
});

describe("l'identité de contact sans bail actif : le type de l'espace la complète", () => {
  it("le titre de l'espace d'agence : « Mon gestionnaire », au nom de l'agence", async () => {
    m.client = client({ tables: { organisations_portail: { type: "agence", name: "Agence des Lilas" } }, rpc: { attestation_emetteur_locataire: null } });
    expect(await lireIdentiteContact(ORG)).toEqual({ nom: "Agence des Lilas", titre: "Mon gestionnaire", agence: true });
  });

  it("chez un propriétaire : « Mon bailleur », jamais le nom interne du parc", async () => {
    const db = client({ tables: { organisations_portail: { type: "proprietaire_direct", name: "Parc de Claire Moreau" } } }) as unknown as SupabaseClient;
    expect(await lireIdentiteContactLocataire(db, ORG)).toEqual({ nom: null, titre: "Mon bailleur", agence: false });
  });

  it("l'émetteur lu décide ; rien de lisible : « Mon bailleur », comme avant ; jamais d'exception", async () => {
    const agence = client({ tables: { organisations_portail: { type: "agence", name: "Agence des Lilas" } } }) as unknown as SupabaseClient;
    expect(await completerIdentiteContact(agence, ORG, { type: "proprietaire_direct", bailleurs: [{ prenom: "Claire", nom: "Moreau" }] }))
      .toEqual({ nom: "Claire Moreau", titre: "Mon bailleur", agence: false });
    const illisible = client({ erreurs: { organisations_portail: "lecture refusée" } }) as unknown as SupabaseClient;
    expect(await lireIdentiteContactLocataire(illisible, ORG)).toEqual({ nom: null, titre: "Mon bailleur", agence: false });
    const leve = { rpc: async () => { throw new Error("réseau"); }, from: () => { throw new Error("réseau"); } } as unknown as SupabaseClient;
    expect(await lireIdentiteContactLocataire(leve, ORG)).toEqual({ nom: null, titre: "Mon bailleur", agence: false });
  });

  it("l'attestation de bon paiement et l'espace lisent la même identité complétée", () => {
    expect(readFileSync("src/app/attestation-loyer/[orgId]/page.tsx", "utf8"))
      .toContain("interlocuteurDeLIdentite(await completerIdentiteContact(supabase, orgId, eEmetteur ? null : emetteurBrut))");
    expect(readFileSync("src/app/locataire/[orgId]/identite-contact.ts", "utf8")).toContain("return lireIdentiteContactLocataire(supabase, orgId);");
  });
});

// ─── 3. « Votre propriétaire » dit au locataire d'une agence ─────────────────────────────────────────────────────────
describe("Mes demandes : qui écrit, qui consigne un rendez-vous manqué", () => {
  it("la règle : « Votre gestionnaire » en agence, le texte d'avant chez un propriétaire", () => {
    expect(auteurCoteEspace("gestionnaire")).toBe("Votre gestionnaire");
    expect(auteurCoteEspace("bailleur")).toBe("Votre propriétaire");
    expect(phraseRendezVousManque({ absent: "artisan", consigne_role: "gestionnaire" }, "gestionnaire"))
      .toBe("Votre gestionnaire a consigné que l’artisan ne s’est pas présenté. Un nouveau rendez-vous va être convenu.");
  });

  const attendu = { bailleur: "Votre propriétaire", gestionnaire: "Votre gestionnaire" } as const;
  for (const t of TYPES) {
    it(`espace ${t.nom} : la page rendue dit « ${attendu[t.qui]} »`, async () => {
      m.client = client({
        tables: { organisations_portail: { type: t.type, name: "ESSAI espace" } },
        rpc: {
          attestation_emetteur_locataire: { type: t.type, nom: "ESSAI espace", bailleurs: [{ prenom: "Claire", nom: "Moreau" }] },
          mes_incidents_locataire: [],
          mon_suivi_intervention: [{ incident_id: "inc-1", intervention_id: "iv-1", etape: "creneaux_attendus", rdv_debut: null, terminee_le: null }],
          mes_creneaux_locataire: [],
          mon_bail_locataire: [{ etat: "actif" }],
          mes_rendez_vous_locataire: [],
          echanges_intervention_non_lus: [{ intervention_id: "iv-1", incident_id: "inc-1", non_lus: 1 }],
          mes_rdv_manques_locataire: [{ incident_id: "inc-1", intervention_id: "iv-1", rdv_debut: "2026-11-18T09:00:00Z", absent: "artisan", consigne_role: "gestionnaire", consigne_le: "2026-11-18T12:00:00Z" }],
        },
      });
      const html = texteDe(renderToStaticMarkup((await PageDemandesLocataire({
        params: Promise.resolve({ orgId: ORG }), searchParams: Promise.resolve({}),
      } as never)) as never));
      expect(html).toContain(`${attendu[t.qui]} ou l'artisan vous a écrit dans la discussion de l'intervention.`);
      expect(html).toContain(`${attendu[t.qui]} a consigné que l’artisan ne s’est pas présenté.`);
      if (t.qui === "gestionnaire") expect(html).not.toMatch(/propriétaire/);
    });
  }
});

describe("rappel automatique de relevé : à qui signaler un index manquant", () => {
  it("le message : « prévenez votre gestionnaire » en agence, le texte d'avant ailleurs", () => {
    const releve = (interlocuteur?: "gestionnaire" | "bailleur") =>
      texteDe(messageRappelGeste({ type: "releve_attendu", emetteur: "Agence des Lilas", libelle: "Eau froide", lien: null, interlocuteur }).html);
    expect(releve("gestionnaire")).toContain("Si vous n’avez pas l’index demandé, prévenez votre gestionnaire ; ne l’estimez pas.");
    expect(releve("gestionnaire")).not.toMatch(/propriétaire/);
    expect(releve("bailleur")).toContain("prévenez le propriétaire ; ne l’estimez pas.");
    expect(releve()).toContain("prévenez le propriétaire ; ne l’estimez pas.");
  });

  for (const t of TYPES) {
    it(`la ronde des rappels lit le type de l'espace (${t.nom})`, async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
      const demande = { id: "dem-1", organization_id: ORG, personne_id: "p-1", libelle: "Eau froide", created_at: "2026-10-10T06:00:00Z" };
      const db = client({
        tables: { persons: { email: "zoe@exemple.invalid", prenom: "Zoé" }, organizations: { type: t.type }, tech_log: [] },
        rpc: { org_ecriture_ouverte: true, releves_a_rappeler: [demande] },
      }) as unknown as SupabaseClient;
      const bilan = await envoyerRappelsGestes(db, new Date("2026-10-14T06:00:00Z"));
      expect(bilan.par_type.releve_attendu).toBe(1);
      const html = texteDe(m.envoyes.find((e) => e.to === "zoe@exemple.invalid")?.html ?? "");
      expect(html).toContain(t.qui === "gestionnaire" ? "prévenez votre gestionnaire ; ne l’estimez pas." : "prévenez le propriétaire ; ne l’estimez pas.");
    });
  }
});

// ─── 4. « dans cette agence » dit au locataire d'un propriétaire ─────────────────────────────────────────────────────
describe("« dans cette agence » seulement dans un espace d'agence", () => {
  const ou = { bailleur: "dans cet espace", gestionnaire: "dans cette agence" } as const;

  it("la règle des refus écrits en base", () => {
    const base = "Aucune fiche rattachée à votre compte dans cette agence";
    expect(messageDeLaBasePourLocataire(base, "gestionnaire")).toBe(base);
    expect(messageDeLaBasePourLocataire(base, "bailleur")).toBe("Aucune fiche rattachée à votre compte dans cet espace");
    // Les deux tournures ensemble, le reste inchangé.
    expect(messageDeLaBasePourLocataire("Aucun bail actif à votre nom — contactez votre gestionnaire", "bailleur"))
      .toBe("Aucun bail actif à votre nom — contactez votre bailleur");
  });

  for (const t of TYPES) {
    it(`espace ${t.nom} : bail signé introuvable → « ${ou[t.qui]} »`, async () => {
      m.client = client({ tables: { organisations_portail: { type: t.type } }, rpc: { mon_bail_document_locataire: [] } });
      const r = await bailSigne(new NextRequest(`https://exemple.invalid/locataire/${ORG}/bail/fichier`), { params: Promise.resolve({ orgId: ORG }) } as never);
      expect(r.status).toBe(404);
      expect(texteDe(await r.text())).toContain(`Aucun bail signé n'est disponible pour votre compte ${ou[t.qui]}.`);
    });

    it(`espace ${t.nom} : pièce déposée sans fiche rattachée → « ${ou[t.qui]} »`, async () => {
      m.client = client({
        tables: { organisations_portail: { type: t.type } },
        rpcErreurs: { deposer_ma_piece: "Aucune fiche rattachée à votre compte dans cette agence" },
      });
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
      const form = new FormData();
      form.set("fichier", new File([png], "piece.png", { type: "image/png" }));
      const r = await deposerMaPiece(ORG, "9ccce3bb-7fd2-43c8-9962-2deb6f45497b", {}, form);
      expect(r.erreur).toBe(`Aucune fiche rattachée à votre compte ${ou[t.qui]}`);
    });

    it(`espace ${t.nom} : congé sans fiche rattachée → « ${ou[t.qui]} »`, async () => {
      m.client = client({
        tables: { organisations_portail: { type: t.type } },
        rpcErreurs: { mon_conge_locataire: "Aucune fiche rattachée à votre compte dans cette agence" },
      });
      const r = await donnerMonConge(ORG, {}, new FormData());
      expect(r.erreur).toBe(`Aucune fiche rattachée à votre compte ${ou[t.qui]}`);
    });
  }

  // Les cinq fonctions du locataire qui lèvent « … dans cette agence » : chaque action rend leur refus dans les mots de
  // l'espace (attestation d'assurance, document signé, signalement : mêmes chemins que la pièce et le congé ci-dessus).
  it.each([
    ["src/app/actions/pieces-demandees.ts", "deposer_ma_piece"],
    ["src/app/actions/conge-locataire.ts", "mon_conge_locataire"],
    ["src/app/actions/attestation-locataire.ts", "deposer_mon_attestation"],
    ["src/app/actions/signature-locataire.ts", "retourner_document_signe"],
    ["src/app/actions/incidents.ts", "declarer_mon_incident_reprise"],
  ])("%s (%s)", (fichier, fonction) => {
    const source = readFileSync(fichier, "utf8");
    const apres = source.slice(source.indexOf(`rpc("${fonction}"`));
    const retour = apres.slice(0, apres.indexOf("revalidatePath"));
    expect(retour).toMatch(/messageDeLaBasePourLocataire\(sansJargon\((error|erreurRpc)\.message\), await lireInterlocuteurLocataire\(supabase, orgId\)\)/);
  });
});
