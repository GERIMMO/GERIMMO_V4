/** Devis exprimé en centimes. Les arrondis sont identiques à ceux de PostgreSQL. */
export type LigneDevis = {
  libelle: string;
  quantite: number;
  prix_unitaire_ht_cents: number;
  tva_bps: number;
};
export type LigneDevisCalculee = LigneDevis & {
  montant_ht_cents: number;
  montant_tva_cents: number;
  montant_ttc_cents: number;
};
export const TAUX_TVA = [0, 210, 550, 1000, 2000] as const;
export const MAX_TOTAL_DEVIS_CENTS = 100_000_000_000;

export function montantEnCentimes(brut: string): number | null {
  const valeur = brut.trim().replace(/[\s\u202f\u00a0]/g, "").replace(/€$/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(valeur)) return null;
  const [entier, fraction = ""] = valeur.split(".");
  const cents = Number(entier) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_TOTAL_DEVIS_CENTS ? cents : null;
}

export function calculerDevis(lignes: unknown): {
  lignes: LigneDevisCalculee[]; montant_ht_cents: number; montant_tva_cents: number; montant_ttc_cents: number;
} {
  if (!Array.isArray(lignes) || lignes.length < 1 || lignes.length > 100) {
    throw new Error("Ajoutez entre une et cent lignes au devis.");
  }
  let totalHt = 0, totalTva = 0;
  const resultat = lignes.map((brut: unknown): LigneDevisCalculee => {
    if (!brut || typeof brut !== "object") throw new Error("Une ligne du devis est invalide.");
    const l = brut as Record<string, unknown>;
    const libelle = typeof l.libelle === "string" ? l.libelle.trim() : "";
    const q = l.quantite, prix = l.prix_unitaire_ht_cents, taux = l.tva_bps;
    if (!libelle || libelle.length > 240 || typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > 1_000_000 ||
      !/^\d+(\.\d{1,3})?$/.test(String(q)) || typeof prix !== "number" || !Number.isSafeInteger(prix) || prix < 0 || prix > 1_000_000_000 ||
      typeof taux !== "number" || !TAUX_TVA.includes(taux as typeof TAUX_TVA[number])) {
      throw new Error("Vérifiez le libellé, la quantité, le prix et la TVA de chaque ligne.");
    }
    // BigInt préserve exactement les demi-centimes, sans imprécision flottante.
    const milli = BigInt(String(q).replace(".", "").padEnd(String(q).split(".")[0].length + 3, "0"));
    const ht = Number((milli * BigInt(prix) + BigInt(500)) / BigInt(1000));
    const tva = Number((BigInt(ht) * BigInt(taux) + BigInt(5000)) / BigInt(10000));
    totalHt += ht; totalTva += tva;
    if (totalHt + totalTva > MAX_TOTAL_DEVIS_CENTS) throw new Error("Le total du devis est trop élevé.");
    return { libelle, quantite: q, prix_unitaire_ht_cents: prix, tva_bps: taux, montant_ht_cents: ht, montant_tva_cents: tva, montant_ttc_cents: ht+tva };
  });
  if (totalHt + totalTva <= 0) throw new Error("Indiquez au moins une ligne payante.");
  return { lignes: resultat, montant_ht_cents: totalHt, montant_tva_cents: totalTva, montant_ttc_cents: totalHt+totalTva };
}

export function lireLignesDevis(brut: FormDataEntryValue | null) {
  try { return calculerDevis(JSON.parse(String(brut ?? "[]"))); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("Le détail du devis est incomplet."); throw error; }
}
