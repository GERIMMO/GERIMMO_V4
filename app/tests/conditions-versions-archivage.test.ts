/**
 * Plan de conformité du 23/10/2026, constat R12 : l'archivage de la version en vigueur des conditions
 * (lib/conditions-versions-serveur.ts) et son action serveur (actions/conditions-versions.ts).
 *
 * La page « publiée » est celle que le code rend vraiment (page /conditions, identité fictive) : l'archive doit en
 * ranger le texte contractuel, l'empreinte de ce texte et l'identité lue en base, et refuser sinon. Sans base : le client
 * de service, la lecture de la page et l'envoi d'e-mail sont remplacés. Aucune adresse réelle.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { empreinteIdentite, extraireTexteContractuel, sha256Hex, versionDeclaree } from "../src/lib/conditions-versions";
import { identiteDepuisValeurs } from "../src/lib/identite-editeur";
import { CONDITIONS_ARTISANS_VERSION, CONDITIONS_VERSION } from "../src/lib/editeur";

const m = vi.hoisted(() => ({
  identitePage: {} as Record<string, string | null>,
  identiteIndisponible: false,
  droit: { data: true as unknown, error: null as unknown },
  service: null as unknown,
  site: "https://site.example.com" as string | null,
}));
// Comme lib/editeur-serveur.ts : l'identité du code recouverte par les valeurs saisies ; en échec, celle du code seule.
vi.mock("@/lib/editeur-serveur", async () => {
  const { identiteDepuisValeurs } = await import("@/lib/identite-editeur");
  return {
    lireEditeur: async () => ({
      editeur: identiteDepuisValeurs(m.identiteIndisponible ? null : m.identitePage),
      indisponible: m.identiteIndisponible,
    }),
  };
});
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: async () => m.droit }) }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.service }));
vi.mock("@/lib/site", async (importer) => ({ ...(await importer<typeof import("@/lib/site")>()), adresseDuSite: () => m.site }));
vi.mock("@/lib/relais-alerte-reglage", () => ({ adressesRelaisDuServeur: () => ({ valides: [], invalides: 0, configure: false }) }));
import Conditions from "../src/app/conditions/page";
import ConditionsArtisans from "../src/app/conditions/artisans/page";
import { archiverConditionsPubliees } from "../src/lib/conditions-versions-serveur";
import { archiverConditionsEnVigueur } from "../src/app/actions/conditions-versions";

const VALEURS = { denomination: "Éditeur fictif EI", email: "contact@example.com", siege: "1 rue de l'Exemple, Paris" };

/** Un client de service : l'identité (valeurs, révisions successives) et la RPC d'archivage. */
function service(options: {
  revisions?: number[]; retour?: unknown; erreur?: unknown; valeurs?: Record<string, string>;
  /** Reprise D4 (D4R-02) : les souscriptions lues dans `abonnements` (aucune par défaut) ; `null` : lecture en échec. */
  abonnes?: { stripe_statut: string | null }[] | null;
  /** La version en vigueur est-elle déjà dans `versions_conditions` ? */
  archivee?: boolean;
} = {}) {
  const revisions = [...(options.revisions ?? [3, 3])];
  const rpc = vi.fn(async () => ({ data: options.retour ?? { statut: "archivee" }, error: options.erreur ?? null }));
  const lectures: string[] = [];
  const client = {
    rpc,
    from: (table: string) => {
      lectures.push(table);
      if (table === "abonnements") {
        const reponse = options.abonnes === null ? { data: null, error: { message: "lecture refusée" } } : { data: options.abonnes ?? [], error: null };
        const a = { select: () => a, not: () => a, limit: async () => reponse };
        return a;
      }
      if (table === "versions_conditions") {
        const v = { select: () => v, eq: () => v, maybeSingle: async () => ({ data: options.archivee ? { version: CONDITIONS_VERSION } : null, error: null }) };
        return v;
      }
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { valeurs: options.valeurs ?? VALEURS, revision: revisions.shift() ?? 99 }, error: null }),
      };
      return q;
    },
  };
  return { client, rpc, lectures };
}

async function pagePubliee(): Promise<string> {
  return `<!DOCTYPE html><html><body><header><div>menu</div></header>${renderToStaticMarkup(await Conditions())}<script>self.__next_f=[]</script></body></html>`;
}

beforeEach(() => {
  m.identitePage = { ...VALEURS };
  m.identiteIndisponible = false;
  m.droit = { data: true, error: null };
  m.site = "https://site.example.com";
  m.service = null;
});

describe("archiverConditionsPubliees", () => {
  it("range le texte contractuel de la page publiée, son empreinte, l'identité lue et la déclaration de la version", async () => {
    const page = await pagePubliee();
    const s = service();
    const lirePage = vi.fn(async () => page);
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage });
    expect(lirePage).toHaveBeenCalledWith("https://site.example.com/conditions");
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledWith("archiver_version_conditions", expect.objectContaining({
      p_document: "conditions_clients",
      p_version: CONDITIONS_VERSION,
      p_date_effet: versionDeclaree("conditions_clients", CONDITIONS_VERSION)?.date_effet,
      p_nature: "substantielle",
      p_texte_html: extraction.html,
      p_empreinte_sha256: sha256Hex(extraction.html),
      p_identite_editeur: expect.objectContaining({ denomination: "Éditeur fictif EI", email: "contact@example.com", mediateurNom: null }),
    }));
    // Le texte rangé est celui de la page, identité saisie comprise, sans l'en-tête, le lien de navigation ni les scripts.
    expect(extraction.html).toContain("contact@example.com");
    expect(extraction.html).not.toContain("/conditions/versions");
    expect(extraction.html).not.toContain("__next_f");
    expect(r).toMatchObject({ statut: "archivee", empreinte: sha256Hex(extraction.html) });
    expect(r.message).toContain("archivée");
  });

  it("archive aussi les conditions de l'espace artisan (V1, R10), lues à leur propre adresse", async () => {
    const pages: Record<string, string> = {
      "https://site.example.com/conditions": await pagePubliee(),
      "https://site.example.com/conditions/artisans": `<!DOCTYPE html><html><body>${renderToStaticMarkup(await ConditionsArtisans())}</body></html>`,
    };
    const s = service({ revisions: [3, 3, 3, 3] });
    const resultats = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: async (url) => pages[url] });
    expect(resultats.map((r) => [r.document, r.statut])).toEqual([
      ["conditions_clients", "archivee"],
      ["conditions_artisans", "archivee"],
    ]);
    const extraction = extraireTexteContractuel(pages["https://site.example.com/conditions/artisans"], "conditions_artisans");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    expect(s.rpc).toHaveBeenCalledWith("archiver_version_conditions", expect.objectContaining({
      p_document: "conditions_artisans",
      p_version: CONDITIONS_ARTISANS_VERSION,
      p_date_effet: versionDeclaree("conditions_artisans", CONDITIONS_ARTISANS_VERSION ?? "")?.date_effet,
      p_texte_html: extraction.html,
    }));
  });

  it("une version déjà archivée avec le même texte : rien à faire", async () => {
    const s = service({ retour: { statut: "deja_archivee", empreinte_sha256: "a".repeat(64) } });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee });
    expect(r.statut).toBe("deja_archivee");
    expect(r.message).toContain("déjà archivée avec le même texte");
  });

  it("la même version avec une autre empreinte : refus, et alerte du relais nommant les informations modifiées", async () => {
    const s = service({ retour: { statut: "empreinte_differente", empreinte_sha256: "b".repeat(64), champs_identite_modifies: ["email"] } });
    const envoyer = vi.fn(async () => ({ id: "envoi-1" }));
    const [r] = await archiverConditionsPubliees({
      service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee, envoyer, adressesRelais: ["relais@example.com"],
    });
    expect(r.statut).toBe("empreinte_differente");
    expect(r.message).toContain("refusé");
    expect(r.message).toContain("e-mail de contact");
    expect(r.message).toContain("Le relais a été alerté");
    expect(envoyer).toHaveBeenCalledTimes(1);
    const [envoi] = envoyer.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; cleIdempotence: string }];
    expect(envoi.to).toBe("relais@example.com");
    expect(envoi.subject).toContain("différentes de leur archive");
    expect(envoi.html).toContain("E-mail de contact");
    expect(envoi.html).toContain("b".repeat(64));
    expect(envoi.html).toContain("https://site.example.com/admin/sante#archive-conditions");
    expect(envoi.cleIdempotence).toContain(`conditions-divergentes-conditions_clients-${CONDITIONS_VERSION}-`);
  });

  it("M2 : seule la présentation a changé (déploiement visuel) : rien à faire, aucune alerte au relais", async () => {
    const s = service({ retour: { statut: "presentation_differente", empreinte_sha256: "b".repeat(64), empreinte_publiee: "c".repeat(64) } });
    const envoyer = vi.fn(async () => ({ id: "envoi-1" }));
    const [r] = await archiverConditionsPubliees({
      service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee, envoyer, adressesRelais: ["relais@example.com"],
    });
    expect(r.statut).toBe("deja_archivee");
    expect(r.message).toContain("seule la présentation");
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("sans relais configuré, le refus le dit : l'écart reste au journal technique", async () => {
    const s = service({ retour: { statut: "empreinte_differente", empreinte_sha256: "b".repeat(64), champs_identite_modifies: [] } });
    const envoyer = vi.fn(async () => ({ id: "envoi-1" }));
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee, envoyer, adressesRelais: [] });
    expect(envoyer).not.toHaveBeenCalled();
    expect(r.message).toContain("Aucune alerte e-mail n'est partie");
  });

  it("l'identité change pendant la lecture de la page : rien n'est archivé", async () => {
    const s = service({ revisions: [3, 4] });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee });
    expect(r.statut).toBe("echec");
    expect(r.message).toContain("a changé pendant la lecture");
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("une page sans texte contractuel, d'une autre version, ou illisible : rien n'est archivé", async () => {
    const sansMarque = service();
    const [a] = await archiverConditionsPubliees({ service: sansMarque.client as never, site: "https://site.example.com", lirePage: async () => "<html><main>Conditions</main></html>" });
    expect(a.statut).toBe("echec");
    expect(a.message).toContain("n'a pas été trouvé");
    expect(sansMarque.rpc).not.toHaveBeenCalled();

    const autre = service();
    const page = (await pagePubliee()).replace(`data-version="${CONDITIONS_VERSION}"`, 'data-version="2099-01-01"');
    const [b] = await archiverConditionsPubliees({ service: autre.client as never, site: "https://site.example.com", lirePage: async () => page });
    expect(b.message).toContain("affiche la version 2099-01-01");
    expect(autre.rpc).not.toHaveBeenCalled();

    const injoignable = service();
    const [c] = await archiverConditionsPubliees({
      service: injoignable.client as never, site: "https://site.example.com",
      lirePage: async () => { throw new Error("la page a répondu 503"); },
    });
    expect(c.message).toContain("la page a répondu 503");
    expect(injoignable.rpc).not.toHaveBeenCalled();
  });

  it("I1 : une page rendue sans pouvoir lire l'identité (texte dégradé, « à venir ») n'est jamais archivée", async () => {
    m.identiteIndisponible = true;
    const page = await pagePubliee();
    // La page dégradée est servie normalement : marque, version et texte, avec ses mentions « à venir ».
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    expect(extraction).toMatchObject({ ok: true, version: CONDITIONS_VERSION, identiteLue: false });
    expect(extraction.ok && extraction.html).toContain("Document en cours de finalisation");
    const s = service();
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: async () => page });
    expect(r.statut).toBe("echec");
    expect(r.message).toContain("n'a pas pu lire l'identité de l'éditeur");
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("I1 : une page rendue avec une autre identité que celle lue en base (cache, saisie en cours) n'est pas archivée", async () => {
    m.identitePage = { ...VALEURS, email: "ancienne@example.com" };
    const page = await pagePubliee();
    const s = service();
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: async () => page });
    expect(r.statut).toBe("echec");
    expect(r.message).toContain("autre identité de l'éditeur");
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("I1 : l'identité lue par la page est portée par l'élément marqué, hors du texte archivé", async () => {
    const page = await pagePubliee();
    const extraction = extraireTexteContractuel(page, "conditions_clients");
    if (!extraction.ok) throw new Error("texte contractuel introuvable");
    expect(extraction.identiteLue).toBe(true);
    expect(extraction.identiteEmpreinte).toBe(empreinteIdentite(identiteDepuisValeurs(VALEURS)));
    expect(extraction.html).not.toContain("data-identite");
  });

  it("B1 et I1 sur les pages réellement servies par next start : la page normale s'archive entière, la page dégradée est refusée", async () => {
    // Pages relevées le 11/11/2026 sur le build de cette branche : base du banc joignable (identité fictive), puis
    // base coupée (statut 200, mentions « à venir »). Lot T4 (24/11/2026) : les passages du contrat modifiés par la
    // version du 24/11/2026 y ont été remplacés sans nouveau relevé (voir l'en-tête de tests/conditions-flux.test.ts).
    const banc = {
      denomination: "Éditeur fictif du banc EI", forme: "Entrepreneur individuel (EI)", siege: "1 rue de l'Exemple, 75000 Paris",
      rcs: "RNE 000 000 000", siret: "00000000000000", directeurPublication: "Personne fictive", email: "contact@example.com",
      telephone: "01 00 00 00 00",
    };
    const normale = readFileSync("tests/fixtures/conditions-next-start.html", "utf8");
    const s = service({ valeurs: banc });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: async () => normale });
    expect(r.statut).toBe("archivee");
    const { p_texte_html: texte } = (s.rpc.mock.calls[0] as unknown as [string, { p_texte_html: string }])[1];
    expect(texte).not.toMatch(/<template\b|\bid="[PSB]:/);
    expect(texte).toContain("au plus tôt trois mois et au plus tard un mois avant le terme");

    const degradee = readFileSync("tests/fixtures/conditions-next-start-degradee.html", "utf8");
    expect(degradee).toContain("Document en cours de finalisation");
    const t = service({ valeurs: banc });
    const [d] = await archiverConditionsPubliees({ service: t.client as never, site: "https://site.example.com", lirePage: async () => degradee });
    expect(d.statut).toBe("echec");
    expect(d.message).toContain("n'a pas pu lire l'identité de l'éditeur");
    expect(t.rpc).not.toHaveBeenCalled();
  });

  // Reprise du lot D4 (relecture D4R-02) : l'article 16 promet une annonce par courriel avant l'effet d'une nouvelle
  // version ; Gerimmo ne l'envoie pas encore. Avec un abonné actif, une nouvelle version des conditions clients ne
  // s'archive pas (l'archivage déclencherait aussitôt la demande d'accord) ; le super-administrateur lit pourquoi.
  it.each([
    ["un abonné actif", [{ stripe_statut: "active" }], "Un abonné actif est concerné"],
    ["un abonné en retard de paiement et un abonnement clos", [{ stripe_statut: "past_due" }, { stripe_statut: "canceled" }], "Un abonné actif est concerné"],
    ["deux abonnés, dont un statut inconnu", [{ stripe_statut: "trialing" }, { stripe_statut: null }], "2 abonnés actifs sont concernés"],
    ["une lecture des abonnements en échec", null, "n'a pas pu être lu"],
  ])("D4R-02 — %s : nouvelle version refusée, rien n'est lu ni archivé, le message dit d'annoncer d'abord", async (_cas, abonnes, qui) => {
    const s = service({ abonnes });
    const lirePage = vi.fn(pagePubliee);
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage });
    expect(r).toMatchObject({ document: "conditions_clients", statut: "echec" });
    expect(r.message).toContain(qui);
    expect(r.message).toContain("rien n'est archivé");
    expect(r.message).toContain("article 16");
    expect(r.message).toContain("annoncer la version aux abonnés");
    expect(lirePage).not.toHaveBeenCalledWith("https://site.example.com/conditions");
    expect(s.rpc).not.toHaveBeenCalledWith("archiver_version_conditions", expect.objectContaining({ p_document: "conditions_clients" }));
  });

  it("D4R-02 — aucun abonné actif (abonnements clos seulement) : la version s'archive comme avant", async () => {
    const s = service({ abonnes: [{ stripe_statut: "canceled" }, { stripe_statut: "incomplete_expired" }] });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee });
    expect(r.statut).toBe("archivee");
    expect(s.rpc).toHaveBeenCalledWith("archiver_version_conditions", expect.objectContaining({ p_document: "conditions_clients" }));
  });

  it("D4R-02 — version déjà archivée : avec des abonnés, elle se revérifie toujours (rien de nouveau n'est archivé)", async () => {
    const s = service({ abonnes: [{ stripe_statut: "active" }], archivee: true, retour: { statut: "deja_archivee", empreinte_sha256: "a".repeat(64) } });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee });
    expect(r.statut).toBe("deja_archivee");
  });

  it("un refus de la base n'est jamais présenté comme un archivage", async () => {
    const s = service({ erreur: { message: "permission denied" } });
    const [r] = await archiverConditionsPubliees({ service: s.client as never, site: "https://site.example.com", lirePage: pagePubliee });
    expect(r.statut).toBe("echec");
    expect(r.message).toContain("rien n'est archivé");
  });
});

describe("archiverConditionsEnVigueur (action serveur)", () => {
  it("refuse sans super-administrateur permanent avec second facteur, avant toute clé de service", async () => {
    m.droit = { data: false, error: null };
    const s = service();
    m.service = s.client;
    const etat = await archiverConditionsEnVigueur({}, new FormData());
    expect(etat.erreur).toContain("supervision permanent");
    expect(s.lectures).toEqual([]);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("dit ce qui manque : adresse publique du site ou clé de service", async () => {
    m.site = null;
    expect((await archiverConditionsEnVigueur({}, new FormData())).erreur).toContain("NEXT_PUBLIC_SITE_URL");
    m.site = "https://site.example.com";
    m.service = null;
    expect((await archiverConditionsEnVigueur({}, new FormData())).erreur).toContain("clé de service");
  });
});
