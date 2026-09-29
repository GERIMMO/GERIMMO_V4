import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { adresseCanonique } from "@/lib/site";

// sitemap.xml (29/09) : les pages publiques et chaque article paru du journal,
// en adresses absolues. Les articles se lisent comme le journal les lit
// (table `publications`, statut « publiee », visible du public par la RLS),
// avec la clé publique et SANS cookie : le plan du site est le même pour tout
// le monde, et peut donc être mis en cache.
//
// Relu toutes les heures : un article paru entre deux déploiements y figure
// sans attendre le suivant.
export const revalidate = 3600;

const PAGES: { chemin: string; frequence: "daily" | "weekly" | "monthly"; priorite: number }[] = [
  { chemin: "/", frequence: "weekly", priorite: 1 },
  { chemin: "/tarifs", frequence: "monthly", priorite: 0.9 },
  { chemin: "/journal", frequence: "daily", priorite: 0.8 },
  { chemin: "/conditions", frequence: "monthly", priorite: 0.3 },
  { chemin: "/mentions-legales", frequence: "monthly", priorite: 0.3 },
  { chemin: "/confidentialite", frequence: "monthly", priorite: 0.3 },
];

async function articlesParus(): Promise<{ slug: string; date: string | null }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sans configuration (construction en CI), le plan du site se limite aux
  // pages fixes plutôt que d'échouer.
  if (!url || !cle) return [];
  try {
    const db = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db
      .from("publications")
      .select("slug, publie_le, updated_at")
      .eq("statut", "publiee")
      .not("slug", "is", null)
      .order("publie_le", { ascending: false })
      .limit(1000);
    if (error || !data) return [];
    return data
      .filter((a): a is typeof a & { slug: string } => typeof a.slug === "string" && a.slug.length > 0)
      .map((a) => ({ slug: a.slug, date: a.updated_at ?? a.publie_le }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = adresseCanonique();
  const articles = await articlesParus();
  return [
    ...PAGES.map((p) => ({
      url: p.chemin === "/" ? site : `${site}${p.chemin}`,
      changeFrequency: p.frequence,
      priority: p.priorite,
    })),
    ...articles.map((a) => ({
      url: `${site}/journal/${encodeURIComponent(a.slug)}`,
      ...(a.date ? { lastModified: new Date(a.date) } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
