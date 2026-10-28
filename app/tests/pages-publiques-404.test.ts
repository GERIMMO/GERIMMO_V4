/**
 * Audit final du 27/10/2026 (PUB-03) — un article du journal ou une version archivée des conditions inconnus
 * répondaient 200 (« soft 404 ») : la page lisait la base avec le client à cookies, donc rendue en flux, et le
 * notFound() arrivait après l'en-tête. Elles lisent désormais sans cookie (ISR) : le 404 est réel. Le statut lui-même
 * se vérifie sur le banc (e2e/vitrine.spec.ts) ; ce test garde la cause écartée.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGES = ["src/app/journal/[slug]/page.tsx", "src/app/conditions/versions/[document]/[version]/page.tsx"];

describe("pages publiques à identifiant : un 404 réel", () => {
  it.each(PAGES)("%s lit sans cookie, se garde une heure et se rend à la première visite", (fichier) => {
    const source = readFileSync(fichier, "utf8");
    expect(source).not.toMatch(/@\/lib\/supabase\/server/);
    expect(source).not.toMatch(/from "next\/headers"/);
    expect(source).toContain('import { clientAnonyme } from "@/lib/supabase/anonyme";');
    expect(source).toMatch(/export const revalidate = 3600;/);
    expect(source).toMatch(/export async function generateStaticParams\(\)/);
  });
});
