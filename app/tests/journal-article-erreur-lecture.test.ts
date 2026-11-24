/**
 * Seconde reprise du lot D1 des décisions du 24/11/2026 (constat M-c) : la page publique d'un article du Journal
 * (src/app/journal/[slug]/page.tsx) ne confond plus une LECTURE EN ERREUR avec un article ABSENT.
 *
 * Avant : l'erreur de lecture était ignorée, et la page répondait « Article introuvable » pour TOUS les articles
 * (cas réel : le visiteur n'a plus le droit de lire une des colonnes demandées, par exemple `origine` après le rejeu
 * isolé de l'ancienne migration 20261019121000). Désormais : erreur de lecture → écran d'erreur de l'application
 * (src/app/error.tsx) ; aucune ligne → page « introuvable », comme avant.
 *
 * Sans base : la lecture est une doublure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const lecture = vi.hoisted(() => ({ reponse: { data: null as unknown, error: null as { message: string } | null } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const requete = { select: () => requete, eq: () => requete, maybeSingle: async () => lecture.reponse };
    return { from: () => requete };
  },
}));

import PageArticle, { generateMetadata } from "@/app/journal/[slug]/page";

const props = { params: Promise.resolve({ slug: "article-fictif" }) } as Parameters<typeof PageArticle>[0];
/** L'erreur levée par la page (ou `null` si elle se rend). `notFound()` de Next lève une erreur marquée 404. */
const erreurDe = async (rendre: () => Promise<unknown>) => { try { await rendre(); return null; } catch (e) { return e as Error & { digest?: string }; } };
const estIntrouvable = (e: (Error & { digest?: string }) | null) => Boolean(e?.digest?.includes("404"));

describe("page publique d'un article : erreur de lecture ou article absent", () => {
  beforeEach(() => { lecture.reponse = { data: null, error: null }; });

  it("aucune ligne, sans erreur : la page « introuvable », comme avant", async () => {
    expect(estIntrouvable(await erreurDe(() => PageArticle(props)))).toBe(true);
    expect(await generateMetadata(props)).toEqual({ title: "Article introuvable — Gerimmo" });
  });

  it("lecture en erreur (droit de colonne retiré, base indisponible) : écran d'erreur, jamais « introuvable »", async () => {
    lecture.reponse = { data: null, error: { message: "permission denied for table publications" } };
    for (const rendre of [() => PageArticle(props), () => generateMetadata(props)]) {
      const erreur = await erreurDe(rendre);
      expect(erreur).toBeInstanceOf(Error);
      expect(estIntrouvable(erreur)).toBe(false);
      // Le message reste général : le détail technique de la base n'est pas recopié.
      expect(erreur?.message).toBe("L’article n’a pas pu être lu.");
    }
  });
});
