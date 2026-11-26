/**
 * Reprise du lot L4 (26/11/2026), relecture du point D1 : le courriel de veto (lib/alerte-veto-marketing.ts) montre le
 * message que la mission enverra à Facebook. Ce fichier suit le même article dans les deux temps de la mission
 * (lib/missions-planifiees/marketing.ts) : la préparation, qui alerte le superviseur, puis la diffusion, qui envoie le
 * post. Le texte du courriel doit être exactement celui que la diffusion remet à Facebook (texteFacebook sur les champs
 * que diffuserPostsEchus transmet). Sans base ni réseau : tout est simulé, aucune donnée réelle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleFacebook } from "@/lib/facebook";
import type { ApercuPost } from "@/lib/alerte-veto-marketing";

const m = vi.hoisted(() => ({
  alertes: [] as ApercuPost[],
  envois: [] as ArticleFacebook[],
  article: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: vi.fn(async () => {}), ArretSupervision: class extends Error {} }));
vi.mock("@/lib/alerte-veto-marketing", async (original) => ({
  ...(await original<typeof import("@/lib/alerte-veto-marketing")>()),
  alerterSuperviseurDuPost: vi.fn(async (_db: unknown, post: ApercuPost) => { m.alertes.push(post); return { envoye: true }; }),
}));
vi.mock("@/lib/facebook", async (original) => ({
  ...(await original<typeof import("@/lib/facebook")>()),
  envoyerSurFacebook: vi.fn(async (article: ArticleFacebook, reserver: () => Promise<void>) => { await reserver(); m.envois.push(article); return { post_id: "post-fictif" }; }),
}));
vi.mock("@/lib/marketing-meta", () => ({ santeFacebook: async () => ({ configure: true, nom: "Page fictive" }) }));

/** Une base simulée : `publications` rend l'article fictif ; les fonctions SQL de la mission répondent « oui ». */
function base() {
  return {
    rpc: async (nom: string) => ({ data: nom === "publications_marketing_echues" ? [m.article?.id] : true, error: null }),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in", "is", "or", "not", "neq", "gte", "order", "limit", "range", "update"]) q[k] = () => q;
      q.upsert = async () => ({ data: null, error: null });
      q.maybeSingle = async () => ({ data: m.article, error: null });
      q.single = q.maybeSingle;
      q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f);
      return q;
    },
  };
}

import { diffuserPostsEchus, preparerPostDu } from "@/lib/missions-planifiees/marketing";
import { htmlAlerteVeto } from "@/lib/alerte-veto-marketing";
import { texteFacebook } from "@/lib/facebook";
import { MENTION_IA_ARTICLE } from "@/components/mention-ia-article";

const ID = "33333333-3333-4333-8333-333333333333";
const ARTICLE = {
  id: ID, titre: "Article fictif", slug: "2026-11-27-article-fictif", chapo: "Chapô fictif", statut: "brouillon",
  facebook_texte: "Texte fictif préparé", facebook_image_url: "https://exemple.test/visuel.jpg", facebook_post_id: null,
  facebook_envoi_demarre_le: null, image_empreinte: "a".repeat(64), image_essais: 0, image_en_cours_le: null,
  updated_at: "2026-11-26T17:00:00Z", programmee_pour: null, veille_source_id: null, marketing_jour: "2026-11-27",
};
type Db = Parameters<typeof preparerPostDu>[0];
const reglages = { actif: true, validation_obligatoire: false, veille_mots_inclus: [], veille_mots_exclus: [] } as unknown as Parameters<typeof preparerPostDu>[1];
const cible = { jour: "2026-11-27", rang: 1, parution: "2026-11-27T08:00:00Z", rattrapage: false } as unknown as Parameters<typeof preparerPostDu>[2];

/** Le paragraphe sous « Texte Facebook » du courriel (texte, entités de `echapper` décodées). */
const apercuCourriel = (html: string) => /Texte Facebook<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1]
  ?.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("courriel de veto : le message de l'alerte est celui que la diffusion envoie", () => {
  beforeEach(() => {
    m.alertes = []; m.envois = [];
    vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app");
  });

  it.each(["ia", "manuel"] as const)("origine « %s » : préparation puis diffusion du même article, même message", async (origine) => {
    m.article = { ...ARTICLE, origine };
    expect(await preparerPostDu(base() as unknown as Db, reglages, cible)).toMatchObject({ agi: true, alerte: true });
    expect(m.alertes).toHaveLength(1);
    // La préparation transmet à l'alerte l'adresse et l'origine de l'article.
    expect(m.alertes[0]).toMatchObject({ id: ID, slug: ARTICLE.slug, origine });

    m.article = { ...ARTICLE, origine, statut: "programmee", programmee_pour: cible.parution };
    expect((await diffuserPostsEchus(base() as unknown as Db, reglages)).diffuses).toEqual([ID]);
    expect(m.envois).toHaveLength(1);

    const courriel = apercuCourriel(htmlAlerteVeto(m.alertes[0], "https://www.gerimmo.app/admin/marketing#veto"));
    expect(courriel).toBe(texteFacebook(m.envois[0]));
    expect(courriel).toContain(`Lire l’article : https://www.gerimmo.app/journal/${ARTICLE.slug}#gerimmo-${ID}`);
    if (origine === "ia") expect(courriel?.endsWith(MENTION_IA_ARTICLE)).toBe(true);
    else expect(courriel).not.toContain(MENTION_IA_ARTICLE);
  });
});
