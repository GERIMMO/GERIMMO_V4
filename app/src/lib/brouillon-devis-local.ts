import { z } from "zod";

export const CHAMPS_DEVIS_LOCAL = ["diagnostic", "delai", "duree", "contraintes", "observations", "valide_jusqu_au"] as const;
const ligne = z.object({ code: z.string().max(100), libelle: z.string().max(1000), quantite: z.string().max(100), prix: z.string().max(100), tva: z.string().max(10) });
export type LigneDevisSaisie = z.infer<typeof ligne>;
const contenu = z.object({
  diagnostic: z.string().max(4000), delai: z.string().max(240), duree: z.string().max(240),
  contraintes: z.string().max(3000), observations: z.string().max(3000), valide_jusqu_au: z.string().max(10),
  lignes: z.array(ligne).min(1).max(100),
});
const schema = z.object({ version: z.literal(1), copieId: z.string().uuid(), enregistreLe: z.number().finite(), revision: z.number().int().nonnegative(), contenu });
export type ContenuDevisLocal = z.infer<typeof contenu>;
export type BrouillonDevisLocal = z.infer<typeof schema>;
export const DUREE_DEVIS_LOCAL = 7 * 86400000;
export const cleDevisLocal = (compte: string, demande: string) => `gerimmo:devis:v1:${encodeURIComponent(compte)}:${encodeURIComponent(demande)}`;

// Conserver les chaînes brutes : une virgule ou une TVA non choisie ne doit
// pas devenir un zéro. Aucun PDF, secret ou accord de validation n'est copié.
export function contenuDevisLocal(form: FormData): ContenuDevisLocal {
  return contenu.parse({ ...Object.fromEntries(CHAMPS_DEVIS_LOCAL.map(n => [n, form.get(n) ?? ""])), lignes: JSON.parse(String(form.get("lignes_devis_saisie") ?? "[]")) });
}
export function lireDevisLocal(cle: string): BrouillonDevisLocal | null {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return null;
    const b = brut.length <= 200000 ? schema.safeParse(JSON.parse(brut)) : null;
    if (!b?.success || Date.now() - b.data.enregistreLe > DUREE_DEVIS_LOCAL || b.data.enregistreLe > Date.now() + 60000) { localStorage.removeItem(cle); return null; }
    return b.data;
  } catch { return null; }
}
export function sauverDevisLocal(cle: string, b: BrouillonDevisLocal): boolean {
  try { localStorage.setItem(cle, JSON.stringify(schema.parse(b))); return true; } catch { return false; }
}
export function effacerDevisLocal(cle: string, b: BrouillonDevisLocal): void {
  try {
    // Une réponse lente ne doit pas effacer la saisie plus récente d'un onglet.
    if (JSON.stringify(lireDevisLocal(cle)) === JSON.stringify(schema.parse(b))) localStorage.removeItem(cle);
  } catch { /* Stockage refusé : le formulaire reste utilisable. */ }
}
