import { z } from "zod";

export const CHAMPS_BROUILLON_BIEN = ["nom", "address_line1", "address_line2", "postal_code", "city", "commune_insee", "annee_construction", "copropriete", "zone_tendue", "parties_communes", "acces_tic"] as const;
const lot = z.object({ nom: z.string().max(200).optional(), surface: z.string().max(30), pieces: z.string().max(10) });
const schema = z.object({
  version: z.literal(1), enregistreLe: z.number().finite(), creationId: z.string().uuid(),
  etape: z.union([z.literal(0), z.literal(1)]), type: z.string().max(40), divise: z.boolean(),
  champs: z.record(z.string(), z.string().max(1000)),
  lots: z.array(lot.extend({ nom: z.string().max(200) })).min(1).max(500), lotUnique: lot,
});
export type BrouillonBien = z.infer<typeof schema>;
export const DUREE_BROUILLON_BIEN = 7 * 24 * 60 * 60 * 1000;

export function cleBrouillonBien(compte: string, org: string) {
  return `gerimmo:bien:v1:${encodeURIComponent(compte)}:${encodeURIComponent(org)}`;
}

// Aucun document, secret, jeton, champ technique React ou identifiant de droit.
export function champsBrouillonBien(form: FormData): Record<string, string> {
  return Object.fromEntries(CHAMPS_BROUILLON_BIEN.map(nom => {
    const valeur = form.get(nom);
    return [nom, typeof valeur === "string" ? valeur : ""];
  }));
}

export function lireBrouillonBien(cle: string): BrouillonBien | null {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return null;
    const resultat = brut.length <= 200_000 ? schema.safeParse(JSON.parse(brut)) : null;
    if (!resultat?.success || Date.now() - resultat.data.enregistreLe > DUREE_BROUILLON_BIEN || resultat.data.enregistreLe > Date.now() + 60_000) {
      localStorage.removeItem(cle); return null;
    }
    const b = resultat.data;
    b.champs = Object.fromEntries(CHAMPS_BROUILLON_BIEN.map(nom => [nom, b.champs[nom] ?? ""]));
    return b;
  } catch { return null; }
}

export function sauverBrouillonBien(cle: string, b: BrouillonBien): boolean {
  try { localStorage.setItem(cle, JSON.stringify(b)); return true; } catch { return false; }
}

// N'efface pas un autre brouillon ouvert entre-temps dans un deuxième onglet.
export function effacerBrouillonBien(cle: string, creationId: string): void {
  try {
    if (lireBrouillonBien(cle)?.creationId === creationId) localStorage.removeItem(cle);
  } catch { /* Le stockage peut être refusé par le navigateur. */ }
}
