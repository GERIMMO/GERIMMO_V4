import { rendreServeur } from "./fixtures/rendu-serveur";
/**
 * Lot L4 du plan de correction du 26/11/2026, partie console (mineurs relevés par la relecture des écrans, lots 64-65,
 * et la passe 2 : notes-banc/passe2/p2-relecture-superadmin.md). Chaque écran dit l'état réel, pas un état écrit en dur :
 *  — E096/E204, /admin/sante : « Envoi du cautionnement » disait « Activé » dès que son interrupteur propre était
 *    ouvert, connexion Zoho absente et ZOHO_SIGN_BAIL_ACTIF ou ZOHO_SIGN_DOCUMENTS_ACTIF fermés ;
 *  — E107/E214, /admin/parametres : la carte « Fonctions assistées par l’IA » disait « Activée » d'après le seul
 *    réglage, même quand aucun appel ne peut partir (clé absente, mode pilote) ;
 *  — E189, /admin/journaux : la rubrique « Sauvegardes » était verte en dur, même « À vérifier » ou illisible ;
 *  — compteurs de « Informations légales », /admin/sante : « 12 à compléter » en tête, « 9 à fournir » dessous ;
 *  — couverture du réseau à 390 px : le tableau de 42rem défilait de côté et coupait la colonne « Artisans ».
 * Aucune donnée réelle : des valeurs fictives.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { etatConfiguration } from "../src/lib/sante-service";
import { ouvertureSignatures } from "../src/lib/ouverture-signatures";

type Reponse = { data: unknown; error: unknown; count?: number | null };
const banc = vi.hoisted(() => ({
  identite: { editeur: {} as Record<string, string | null>, indisponible: false },
  reglage: { blocageIdentiteActif: true, venteSansMediateurLe: null as string | null, revision: 1 as number | null, indisponible: false },
  iaActive: true as boolean | null,
  iaDisponible: true,
  /** Lecture de `ia_disponible` : réponse normale, erreur rendue par la base, ou appel qui lève. */
  iaLecture: "ok" as "ok" | "erreur" | "exception",
  copies: { data: [] as unknown, error: null as unknown, count: 0 as number | null },
}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => banc.identite }));
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => banc.reglage }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nom: string) => {
      if (nom === "ia_disponible" && banc.iaLecture === "exception") throw new Error("réseau fictif indisponible");
      if (nom === "ia_disponible" && banc.iaLecture === "erreur") return { data: null, error: { message: "fonction indisponible" } };
      return { data: nom === "ia_disponible" ? banc.iaDisponible : null, error: null };
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "like", "in", "is", "gte", "gt", "order", "limit", "eq", "contains", "range"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve<Reponse>(
        table === "ia_plafond_reglage"
          ? banc.iaActive === null ? { data: null, error: { message: "illisible" } } : { data: { ia_active: banc.iaActive }, error: null }
          : { data: { valeurs: {}, revision: 1 }, error: null },
      );
      q.single = () => Promise.resolve<Reponse>({ data: null, error: null });
      q.then = (ok: (r: unknown) => unknown) =>
        Promise.resolve<Reponse>(table === "tech_log" ? banc.copies : { data: [], error: null, count: 0 }).then(ok);
      return q;
    },
  }),
}));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));
vi.mock("@/app/admin/parametres/identite", () => ({ IdentiteEditeur: () => null }));
vi.mock("@/app/actions/reglage-souscription", () => ({ reglerOuvertureVentes: async () => ({}), reglerBlocageSouscription: async () => ({}), reglerVenteSansMediateur: async () => ({}) }));
import PageSante from "../src/app/admin/sante/page";
import PageParametres from "../src/app/admin/parametres/page";
import { PreuvesSupervision } from "../src/app/admin/journaux/preuves";
import { TableauCouverture } from "../src/app/admin/couverture/tableau-couverture";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");

describe("E096/E204 — /admin/sante : l'envoi du cautionnement suit la connexion et les interrupteurs en amont", () => {
  const REGIME = { nature: "franchise" } as const;
  // Connexion Zoho complète (même jeu que tests/ouverture-signatures.test.ts), cautionnement non suspendu.
  const OUVERT = {
    SIGNATURE_BAIL_PRESTATAIRE: "zoho", ZOHO_SIGN_ENV: "production", ZOHO_SIGN_CLIENT_ID: "fictif", ZOHO_SIGN_CLIENT_SECRET: "fictif",
    ZOHO_SIGN_REFRESH_TOKEN: "fictif", ZOHO_SIGN_WEBHOOK_SECRET: "fictif", ZOHO_SIGN_BAIL_ACTIF: "true", ZOHO_SIGN_DOCUMENTS_ACTIF: "true",
  };
  const caution = (env: Record<string, string | undefined>) => etatConfiguration(env, REGIME).find((v) => v.cle === "ZOHO_SIGN_CAUTIONNEMENT_FERME");
  const budget = { plafond: 800, utilise: 0, devisActif: true };

  it.each([
    ["ZOHO_SIGN_DOCUMENTS_ACTIF fermé", { ...OUVERT, ZOHO_SIGN_DOCUMENTS_ACTIF: "false" }, "envoi des autres actes désactivé"],
    ["ZOHO_SIGN_BAIL_ACTIF fermé", { ...OUVERT, ZOHO_SIGN_BAIL_ACTIF: undefined }, "envoi des baux désactivé"],
    ["connexion Zoho en essai", { ...OUVERT, ZOHO_SIGN_ENV: "sandbox" }, "connexion Zoho à configurer"],
    ["aucune variable Zoho", {}, "connexion Zoho à configurer"],
  ])("%s : « Désactivé », et la raison est dite", (_, env, raison) => {
    const ligne = caution(env);
    expect(ligne).toMatchObject({ etat: "ok", information: "Désactivé" });
    expect(ligne?.detail).toBe(`interrupteur ouvert — nouveaux envois fermés : ${raison}`);
    // La même vérité que la rubrique des signatures de la page : l'acte n'y est pas ouvert non plus.
    expect(ouvertureSignatures(env, budget).documents.find((d) => d.code === "cautionnement")?.ouvert).toBe(false);
  });

  it("tout ouvert : « Activé », comme la rubrique des signatures", () => {
    // Reprise du lot L4 : l'attente d'origine (« la configuration Zoho et les contrôles du document restent
    // applicables ») ne disait pas que cette ligne ne lit pas le budget. Elle est durcie : le détail le dit.
    expect(caution(OUVERT)).toMatchObject({ information: "Activé", detail: "interrupteur ouvert, hors budget — le plafond du mois (« Budget des signatures ») et les contrôles du document restent applicables" });
    expect(ouvertureSignatures(OUVERT, budget).documents.find((d) => d.code === "cautionnement")?.ouvert).toBe(true);
  });

  it("budget épuisé ou illisible : la ligne reste « Activé » et dit qu'elle ne lit pas le budget ; la rubrique, elle, ferme", () => {
    // Les deux lectures ne s'accordent que sur les réglages (lib/reglages-signature.ts) : c'est écrit, pas caché.
    expect(caution(OUVERT)?.detail).toContain("hors budget");
    expect(ouvertureSignatures(OUVERT, { plafond: 800, utilise: 800, devisActif: true }).documents.find((d) => d.code === "cautionnement"))
      .toMatchObject({ ouvert: false, motif: "Plafond mensuel atteint" });
    expect(ouvertureSignatures(OUVERT, null).documents.find((d) => d.code === "cautionnement"))
      .toMatchObject({ ouvert: false, motif: "Budget non disponible" });
  });

  describe("organisations de la liste d'essai (SIGNATURE_BAIL_ORGS_ESSAI) : elles passent outre les interrupteurs des baux et des actes", () => {
    const ESSAI = "44444444-4444-4444-8444-444444444444";
    it.each([
      ["ZOHO_SIGN_BAIL_ACTIF fermé", { ...OUVERT, ZOHO_SIGN_BAIL_ACTIF: undefined, SIGNATURE_BAIL_ORGS_ESSAI: ESSAI }, "envoi des baux désactivé"],
      ["ZOHO_SIGN_DOCUMENTS_ACTIF fermé", { ...OUVERT, ZOHO_SIGN_DOCUMENTS_ACTIF: "false", SIGNATURE_BAIL_ORGS_ESSAI: ` ${ESSAI} ` }, "envoi des autres actes désactivé"],
    ])("%s, liste d'essai valide : la raison le dit, comme « Suspendu » parle des essais", (_, env, raison) => {
      expect(caution(env)).toMatchObject({ information: "Désactivé", detail: `interrupteur ouvert — nouveaux envois fermés : ${raison} (hors organisations de la liste d’essai)` });
    });

    it("connexion absente : la liste d'essai n'y change rien, aucune mention des essais", () => {
      expect(caution({ ...OUVERT, ZOHO_SIGN_ENV: "sandbox", SIGNATURE_BAIL_ORGS_ESSAI: ESSAI })?.detail).toBe("interrupteur ouvert — nouveaux envois fermés : connexion Zoho à configurer");
    });

    it("liste invalide (les essais sont refusés) ou vide : aucune mention des essais", () => {
      for (const liste of ["pas-un-identifiant", `${ESSAI},pas-un-identifiant`, "", " , "]) {
        expect(caution({ ...OUVERT, ZOHO_SIGN_BAIL_ACTIF: undefined, SIGNATURE_BAIL_ORGS_ESSAI: liste })?.detail, liste).toBe("interrupteur ouvert — nouveaux envois fermés : envoi des baux désactivé");
      }
    });

    it("cautionnement suspendu : « y compris pour les essais », inchangé", () => {
      expect(caution({ ...OUVERT, ZOHO_SIGN_CAUTIONNEMENT_FERME: "true", SIGNATURE_BAIL_ORGS_ESSAI: ESSAI })).toMatchObject({ information: "Suspendu", detail: expect.stringContaining("suspendu, y compris pour les essais") });
    });
  });

  it("interrupteur propre fermé : « Suspendu », quel que soit l'amont", () => {
    for (const env of [{ ...OUVERT, ZOHO_SIGN_CAUTIONNEMENT_FERME: "1" }, { ZOHO_SIGN_CAUTIONNEMENT_FERME: "true" }]) {
      expect(caution(env)).toMatchObject({ information: "Suspendu", detail: expect.stringContaining("suspendu, y compris pour les essais") });
    }
  });
});

describe("E107/E214 — /admin/parametres : la carte de l'IA dit l'état constaté, pas le seul réglage", () => {
  /** Le texte sous « Fonctions assistées par l’IA ↓ » dans la rangée de cartes. */
  const carteIA = (html: string) => /href="#ia"><strong[^>]*>[^<]*<\/strong><span[^>]*>([^<]*)<\/span>/.exec(html)?.[1];
  const poser = (env: Record<string, string>) => { for (const [cle, valeur] of Object.entries(env)) vi.stubEnv(cle, valeur); };
  beforeEach(() => {
    banc.iaActive = true;
    banc.iaDisponible = true;
    banc.iaLecture = "ok";
    poser({ OPENAI_API_KEY: "", OPEN_AI_KEY: "", GERIMMO_PILOTE_LIMITE: "", GERIMMO_PAIEMENTS_DESACTIVES: "", GERIMMO_PREPRODUCTION_VALIDEE: "" });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("activée, clé du fournisseur absente : « Activée, non connectée »", async () => {
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("Activée, non connectée");
  });

  it("activée, serveur en mode pilote : « Activée, mode pilote »", async () => {
    // lib/verrou-pilote.ts : GERIMMO_PILOTE_LIMITE suspend les opérations payantes externes.
    poser({ OPENAI_API_KEY: "sk-fictif", GERIMMO_PILOTE_LIMITE: "true" });
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("Activée, mode pilote");
  });

  it("activée et reliée : « Activée »", async () => {
    // Le banc des tests tourne en simulation (tests/fixtures/effets-fictifs.ts) : avec la clé, rien ne s'oppose à l'appel.
    poser({ OPENAI_API_KEY: "sk-fictif" });
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("Activée");
  });

  it.each(["erreur", "exception"] as const)("activée, état de l'IA illisible (ia_disponible : %s) : « Activée, état à vérifier »", async (lecture) => {
    // Le réglage dit « activée », mais l'état constaté ne peut pas être lu : ni « Activée », ni « Désactivée ».
    poser({ OPENAI_API_KEY: "sk-fictif" });
    banc.iaLecture = lecture;
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("Activée, état à vérifier");
  });

  it("désactivée, ou réglage illisible : inchangé", async () => {
    banc.iaActive = false;
    banc.iaDisponible = false;
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("Désactivée");
    banc.iaActive = null;
    expect(carteIA(await rendreServeur(await PageParametres()))).toBe("État indisponible");
  });
});

describe("E189 — /admin/journaux : la couleur des sauvegardes suit leur dernier résultat", () => {
  const tonDe = (html: string) => /<details[^>]*id="copies"[^>]*data-tone="([^"]+)"|<details[^>]*data-tone="([^"]+)"[^>]*id="copies"/
    .exec(html)?.slice(1).find(Boolean);
  const ton = async () => tonDe(await rendreServeur(await PreuvesSupervision({ p: {} })));
  const copie = (echecs: number | undefined) => ({ id: "11111111-1111-4111-8111-111111111111", evenement: "tache_sauvegarde", details: echecs === undefined ? {} : { echecs }, created_at: "2026-11-25T03:00:00Z" });

  it("dernière relecture réussie : vert", async () => {
    banc.copies = { data: [copie(0)], error: null, count: 1 };
    expect(await ton()).toBe("vert");
  });

  it.each([
    ["échec", { data: [copie(2)], error: null, count: 1 }],
    ["résultat non confirmé", { data: [copie(undefined)], error: null, count: 1 }],
    ["aucune preuve", { data: [], error: null, count: 0 }],
    ["lecture impossible", { data: null, error: { message: "indisponible" }, count: null }],
  ])("%s : ambre, jamais vert", async (_, copies) => {
    banc.copies = copies;
    expect(await ton()).toBe("ambre");
  });

  describe("reprise du lot L4 : une vue filtrée ou une page suivante ne colore pas l'état des sauvegardes", () => {
    /** La couleur et le texte de l'en-tête (« summary ») de la rubrique, pour des paramètres d'adresse donnés. */
    const rubrique = async (p: Record<string, string>) => {
      const html = await rendreServeur(await PreuvesSupervision({ p }));
      return { ton: tonDe(html), entete: texte(/<details[^>]*id="copies"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/.exec(html)?.[1] ?? "") };
    };

    it.each([
      ["filtre « Relecture réussie » (vert d'office avant)", { copie: "reussie" }, [copie(0)]],
      ["filtre « Échec » (ambre d'office avant)", { copie: "echec" }, [copie(2)]],
      ["filtre « Depuis »", { depuis: "2026-11-01" }, [copie(0)]],
      ["filtre « Depuis », dernière copie en échec", { depuis: "2026-11-01" }, [copie(2)]],
    ])("%s : couleur neutre, « Vue filtrée »", async (_, p, data) => {
      banc.copies = { data, error: null, count: data.length };
      const r = await rubrique(p);
      expect(r.ton).toBe("bleu");
      expect(r.entete).toContain("Vue filtrée");
      expect(r.entete).not.toContain("réussi");
      expect(r.entete).not.toContain("À vérifier");
    });

    it.each([[copie(0)], [copie(2)]])("page 2 (copies plus anciennes) : couleur neutre, « Page 2 »", async (premiere) => {
      banc.copies = { data: [premiere], error: null, count: 30 };
      const r = await rubrique({ pageCopies: "2" });
      expect(r.ton).toBe("bleu");
      expect(r.entete).toContain("Page 2");
    });

    it("page demandée au-delà des copies : la première page est montrée, la règle d'E189 s'applique", async () => {
      banc.copies = { data: [copie(0)], error: null, count: 1 };
      expect((await rubrique({ pageCopies: "2" })).ton).toBe("vert");
      banc.copies = { data: [copie(2)], error: null, count: 1 };
      expect((await rubrique({ pageCopies: "2" })).ton).toBe("ambre");
    });

    it("paramètres que la requête ignore (résultat inconnu, date mal formée) : ce n'est pas un filtre, règle d'E189", async () => {
      banc.copies = { data: [copie(0)], error: null, count: 1 };
      for (const p of [{ copie: "autre" }, { depuis: "hier" }, { copie: "" }] as Record<string, string>[]) {
        const r = await rubrique(p);
        expect(r.ton, JSON.stringify(p)).toBe("vert");
        expect(r.entete, JSON.stringify(p)).toContain("Dernier résultat affiché : réussi");
      }
    });

    it("lecture impossible, filtre actif : ambre, « Lecture indisponible »", async () => {
      banc.copies = { data: null, error: { message: "indisponible" }, count: null };
      const r = await rubrique({ copie: "reussie" });
      expect(r.ton).toBe("ambre");
      expect(r.entete).toContain("Lecture indisponible");
    });
  });
});

describe("Compteurs de « Informations légales » (/admin/sante) : ce qui est à fournir et ce qui est à compléter, à part", () => {
  const REQUIS = {
    denomination: "Personne fictive EI", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple, Paris", typeVendeur: "entrepreneur_individuel",
    rcs: "RNE — 000 000 000", siret: "00000000000000", directeurPublication: "Personne fictive", email: "contact@example.test", telephone: "01 00 00 00 00",
  };
  const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, Paris", mediateurSite: "https://example.test/m" };
  beforeEach(() => {
    banc.reglage = { blocageIdentiteActif: true, venteSansMediateurLe: null, revision: 1, indisponible: false };
  });

  it("rien de saisi : l'en-tête reprend le nombre de la pastille « à fournir » et compte le médiateur à part", async () => {
    banc.identite = { editeur: {}, indisponible: false };
    const t = texte(await rendreServeur(await PageSante()));
    const aFournir = Number(/(\d+) à fournir/.exec(t)?.[1]);
    expect(aFournir).toBeGreaterThan(3);
    expect(t).toContain(`${aFournir} à fournir · 3 à compléter`);
    // L'ancienne somme (« 12 à compléter » au banc) n'apparaît plus.
    expect(t).not.toContain(`${aFournir + 3} à compléter`);
  });

  it("un fait requis manquant, médiateur absent : « 1 à fournir · 3 à compléter »", async () => {
    banc.identite = { editeur: { ...REQUIS, telephone: null }, indisponible: false };
    const t = texte(await rendreServeur(await PageSante()));
    expect(t).toContain("1 à fournir · 3 à compléter");
    expect(t).not.toContain("4 à compléter");
  });

  it("seul le médiateur manque : « 3 à compléter » ; tout est saisi : « Complètes »", async () => {
    banc.identite = { editeur: { ...REQUIS }, indisponible: false };
    const t = texte(await rendreServeur(await PageSante()));
    expect(t).toContain("3 à compléter (médiateur)");
    expect(t).not.toContain("à fournir");
    banc.identite = { editeur: { ...REQUIS, ...MEDIATEUR }, indisponible: false };
    expect(texte(await rendreServeur(await PageSante()))).toContain("Complètes");
  });
});

describe("Couverture du réseau à 390 px : aucune colonne coupée", () => {
  const communes = [
    { commune_code: "91377", nom: "Massy", ouverte: true, preparee: true, artisans: 3, eligibles: 2, interets: 4, biens_interesses: 1, demandes: 5 },
    { commune_code: "91228", nom: "Évry-Courcouronnes", ouverte: false, preparee: true, artisans: 1, eligibles: 0, interets: 0, biens_interesses: 0, demandes: 0 },
  ];
  const html = renderToStaticMarkup(createElement(TableauCouverture, { communes, metier: "electricite", departement: "91" }));

  it("le tableau ne porte sa largeur minimale qu'à partir de `sm`", () => {
    const classes = /<table class="([^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];
    expect(classes).toContain("tableau");
    expect(classes).toContain("sm:min-w-[42rem]");
    expect(classes).not.toContain("min-w-[42rem]");
  });

  it("sous `sm`, les trois colonnes de chiffres sont repliées sous le nom de la commune, sans rien perdre", () => {
    const enTetes = [...html.matchAll(/<th scope="col" class="([^"]*)">([^<]*)<\/th>/g)].map(([, classe, nom]) => [nom, classe]);
    expect(enTetes).toEqual([
      ["Artisans proposés / déclarés", "nombre hidden sm:table-cell"],
      ["Intérêts / biens", "nombre hidden sm:table-cell"],
      ["Demandes réseau", "nombre hidden sm:table-cell"],
    ]);
    // Chaque ligne garde ses cinq cellules ; les trois cellules de chiffres suivent leur en-tête.
    expect(html.match(/<td class="nombre hidden sm:table-cell">/g)).toHaveLength(3 * communes.length);
    const lignes = [...html.matchAll(/<small data-chiffres-commune="[^"]*" class="([^"]*)">([^<]*)<\/small>/g)].map(([, classe, contenu]) => [classe, contenu]);
    expect(lignes).toEqual([
      ["mt-1 block text-xs sm:hidden", "Artisans proposés / déclarés : 2 / 3 · Intérêts / biens : 4 / 1 · Demandes réseau : 5"],
      ["mt-1 block text-xs sm:hidden", "Artisans proposés / déclarés : 0 / 1 · Intérêts / biens : 0 / 0 · Demandes réseau : 0"],
    ]);
    // La ligne et le lien de la commune restent ceux du tableau (e2e/reseau-couverture.spec.ts les cherche).
    expect(html).toMatch(/<tr><td><a [^>]*href="\/admin\/couverture\?departement=91&amp;metier=electricite&amp;commune=91377#artisans-commune"[^>]*>Massy<\/a>/);
  });
});
