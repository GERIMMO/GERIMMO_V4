/**
 * Défauts d'écran MAJEURS de la console du super admin (passe 1, relecture des captures : L64 et L65). Chaque test
 * rend l'écran sans base (données fictives) et vérifie ce que lit le superviseur :
 *  — E069 = E179 : l'état vide des demandes de contact ne propose plus « Voir le formulaire sur le site » (/#contact) ;
 *    pour un connecté, la vitrine renvoie à « Mes espaces » (proxy.ts) et le formulaire n'est jamais montré ;
 *  — E089 : la veille ne propose « Commander la collecte » que si le lancement manuel est possible (CRON_SECRET),
 *    comme l'écran « Automatismes et consignes » ; sinon elle renvoie à la vérification des connexions ;
 *  — E198 (et E101, même cause) : l'éditeur d'article n'annonce plus une « Page Facebook connectée » et ne propose
 *    plus « Publier sur Facebook » quand la Page n'est pas reliée, selon la même lecture que « Marketing et contenus » ;
 *  — E199 : « Paiements Stripe » n'est plus vert quand Stripe n'est pas relié, ni quand un écart ou une réception
 *    attend, ni quand le contrôle est illisible.
 * E070 = E180 (fiche d'un compte) : tests/supervision-defauts-audit.test.ts. E088 (filtre des prospects à 390 px) :
 * e2e/ecrans-majeurs-tour5.spec.ts, qui mesure le champ dans le navigateur.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rendreServeur } from "./fixtures/rendu-serveur";

const banc = vi.hoisted(() => ({
  resultats: {} as Record<string, unknown>,
  facebook: { configure: false } as { configure: boolean; erreur?: string; nom?: string },
}));
function requete(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "contains", "eq", "neq", "is", "in", "or", "not", "lt", "like", "gte", "order", "limit", "range"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve(banc.resultats[`${table}:un`] ?? { data: null, error: null });
  q.single = q.maybeSingle;
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(banc.resultats[table] ?? { data: [], error: null, count: 0 }).then(ok);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: requete,
    rpc: async (nom: string) => banc.resultats[`rpc:${nom}`] ?? { data: null, error: null },
    auth: { getUser: async () => ({ data: { user: { id: "superviseur-fictif" } }, error: null }) },
  }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("404"); }, redirect: () => { throw Error("redirection"); } }));
vi.mock("@/lib/marketing-meta", () => ({ santeFacebook: async () => banc.facebook }));
vi.mock("@/app/actions/publications", () => {
  const rien = vi.fn(async () => ({}));
  return { enregistrerPublication: rien, publierPublication: rien, refuserPublication: rien, retirerPublication: rien, publierPublicationFacebook: rien, resoudreDiffusionFacebook: rien };
});
vi.mock("@/app/admin/veille/decision", () => ({ DecisionVeille: () => null }));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));

import PageDevis from "@/app/admin/devis/page";
import PageVeille from "@/app/admin/veille/page";
import PagePublication from "@/app/admin/publications/[id]/page";
import { EditeurPublication } from "@/app/admin/publications/[id]/editeur-publication";
import { SuiviStripe, type ControleStripe } from "@/app/admin/sante/controle-stripe";
import PageSante from "@/app/admin/sante/page";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  banc.resultats = {};
  banc.facebook = { configure: false };
});
afterEach(() => vi.unstubAllEnvs());

describe("E069 = E179 : demandes de contact, état vide", () => {
  it("ne propose plus un lien vers la vitrine, que le proxy ferme au superviseur connecté", async () => {
    banc.resultats.demandes_devis = { data: [], error: null };
    const html = renderToStaticMarkup(await PageDevis());
    const t = texte(html);
    expect(t).toContain("Aucune demande de contact");
    expect(html).not.toContain('href="/#contact"');
    expect(t).not.toContain("Voir le formulaire sur le site");
    // Le superviseur sait où le formulaire se trouve et comment le voir.
    expect(t).toContain("navigation privée");
  });
});

describe("E089 : veille, aucune collecte encore", () => {
  const vide = () => {
    banc.resultats.regulatory_watch = { data: [], error: null, count: 0 };
    banc.resultats.agent_passages = { data: [], error: null };
    banc.resultats["rpc:ia_disponible"] = { data: true, error: null };
  };
  const rendre = async () => renderToStaticMarkup(await PageVeille({ searchParams: Promise.resolve({}) }));

  it("lancement manuel impossible (secret des tâches absent) : pas de « Commander la collecte », renvoi aux connexions", async () => {
    vide();
    vi.stubEnv("CRON_SECRET", "");
    const html = await rendre();
    const t = texte(html);
    expect(t).not.toContain("Commander la collecte");
    expect(t).not.toContain("commandez-la");
    expect(t).toContain("Le lancement manuel attend la connexion des traitements");
    expect(html).toMatch(/<a [^>]*href="\/admin\/sante"[^>]*>Vérifier les connexions<\/a>/);
  });

  it("lancement manuel possible : la commande reste proposée", async () => {
    vide();
    vi.stubEnv("CRON_SECRET", "secret-fictif");
    const html = await rendre();
    expect(texte(html)).toContain("commandez-la depuis « Tâches automatiques »");
    expect(html).toMatch(/<a [^>]*href="\/admin\/equipes"[^>]*>Commander la collecte<\/a>/);
  });
});

describe("E198 : diffusion Facebook d'un article paru", () => {
  const article = {
    id: "article-fictif", titre: "Titre fictif", slug: "titre-fictif", chapo: "Chapô fictif", corps: "Corps fictif.",
    seoDescription: null, statut: "publiee", sources: [], facebookTexte: "Texte fictif", facebookImageUrl: null,
    tentativeFacebook: null, facebookPostId: null, facebookPublieLe: null, facebookErreur: null,
  };
  const editeur = (facebook: "relie" | "a_verifier" | "a_relier", tentative: string | null = null) =>
    renderToStaticMarkup(createElement(EditeurPublication, { ...article, tentativeFacebook: tentative, facebook }));

  it("Page non reliée : ni « Page connectée » ni « Publier sur Facebook », renvoi à Marketing", () => {
    const html = editeur("a_relier");
    const t = texte(html);
    expect(t).not.toContain("Page Facebook connectée");
    expect(t).not.toContain("Publier sur Facebook");
    expect(t).toContain("La Page Facebook n’est pas encore reliée à Gerimmo");
    expect(html).toContain('href="/admin/marketing#canaux"');
  });

  it("Page reliée mais illisible : aucune diffusion proposée tant que la connexion n'est pas vérifiée", () => {
    const t = texte(editeur("a_verifier"));
    expect(t).not.toContain("Publier sur Facebook");
    expect(t).toContain("La connexion à la Page Facebook est à vérifier");
  });

  it("Page reliée : la diffusion reste proposée", () => {
    const t = texte(editeur("relie"));
    expect(t).toContain("La diffusion utilise la Page Facebook reliée à Gerimmo.");
    expect(t).toContain("Publier sur Facebook");
  });

  it("une tentative incertaine reste vérifiable, même Page non reliée", () => {
    const t = texte(editeur("a_relier", "2026-11-24T10:00:00Z"));
    expect(t).toContain("Vérifier et consigner le résultat");
    expect(t).not.toContain("Publier sur Facebook");
  });

  it.each([
    [{ configure: false }, "La Page Facebook n’est pas encore reliée à Gerimmo"],
    [{ configure: true, erreur: "Meta ne répond pas." }, "La connexion à la Page Facebook est à vérifier"],
    [{ configure: true, nom: "Page fictive" }, "Publier sur Facebook"],
  ])("la page lit la connexion comme « Marketing et contenus » (%o)", async (facebook, attendu) => {
    banc.facebook = facebook;
    banc.resultats["publications:un"] = { data: { id: "article-fictif", titre: "Titre fictif", slug: "titre-fictif", chapo: "Chapô", corps: "Corps", seo_description: null, statut: "publiee", sources: [], periode: null, veine: null, publie_le: "2026-11-20T08:00:00Z", facebook_texte: null, facebook_image_url: null, facebook_post_id: null, facebook_publie_le: null, facebook_erreur: null, facebook_envoi_demarre_le: null }, error: null };
    const t = texte(renderToStaticMarkup(await PagePublication({ params: Promise.resolve({ id: "article-fictif" }) } as never)));
    expect(t).toContain(attendu);
    if (attendu !== "Publier sur Facebook") expect(t).not.toContain("Publier sur Facebook");
  });
});

describe("E199 : « Paiements Stripe » dans Santé", () => {
  const zero: ControleStripe = { en_attente: 0, a_reprendre: 0, a_controler: 0, ecarts: 0, dossiers: [] };
  const ton = (html: string) => /<details[^>]*id="controle-stripe"[^>]*data-tone="([a-z]+)"/.exec(html)?.[1];
  const rendre = (controle: ControleStripe | null, stripeRelie: boolean) => renderToStaticMarkup(createElement(SuiviStripe, { controle, stripeRelie }));

  it("Stripe non relié : ambre, « Stripe non relié », et les zéros ne se lisent pas comme un contrôle réussi", () => {
    const html = rendre(zero, false);
    expect(ton(html)).toBe("ambre");
    expect(texte(html)).toContain("Stripe non relié");
    expect(texte(html)).toContain("ces compteurs ne viennent d’aucun contrôle");
  });
  it.each([
    ["contrôle illisible", null],
    ["écart", { ...zero, ecarts: 2 }],
    ["réception à examiner", { ...zero, a_reprendre: 1 }],
  ])("%s : ambre", (_, controle) => expect(ton(rendre(controle as ControleStripe | null, true))).toBe("ambre"));
  it("Stripe relié, rien à examiner : vert", () => expect(ton(rendre(zero, true))).toBe("vert"));

  it("l'écran Santé passe l'état des deux clés de Stripe (sans elles : ambre, « Stripe non relié »)", async () => {
    banc.resultats["rpc:supervision_stripe_controles"] = { data: zero, error: null };
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const html = await rendreServeur(await PageSante());
    expect(ton(html)).toBe("ambre");
    expect(texte(/<details[^>]*id="controle-stripe"[\s\S]*?<\/summary>/.exec(html)?.[0] ?? "")).toContain("Stripe non relié");
  });
});
