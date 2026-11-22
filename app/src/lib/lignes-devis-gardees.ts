// LIGNES DE DEVIS GARDÉES PAR L'ARTISAN (audit palier 1 du 22/11/2026, P2-04).
//
// Une ligne gardée est une AIDE À LA SAISIE : un libellé, et s'il le veut un prix unitaire hors taxes et un taux de
// TVA. La reprendre la recopie dans le devis en cours, que l'artisan relit et modifie librement ; modifier ou retirer
// une ligne gardée ne touche jamais un devis déjà préparé ou déposé. Aucune IA n'intervient.

import { erreurPrixSaisi, montantEnCentimes } from "./devis-structure";
import type { LigneDevisSaisie } from "./brouillon-devis-local";

export type LigneGardee = { id: string; libelle: string; prix_unitaire_ht_cents: number | null; tva_bps: number | null };

export const LIBELLE_LIGNE_GARDEE_MAX = 240;
export const LIGNES_GARDEES_MAX = 200;
// Les taux de la liste du formulaire, tels que le <select> les rend. Une valeur hors de cette table n'est jamais
// convertie : elle est refusée (la saisie ne se lit pas par Number()).
const TAUX_ADMIS: Readonly<Record<string, number>> = { "0": 0, "210": 210, "550": 550, "1000": 1000, "2000": 2000 };

const prixSaisi = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** La ligne de saisie que produit la reprise d'une ligne gardée : quantité 1, le reste tel qu'il a été gardé. */
export function versLigneDeSaisie(g: LigneGardee): LigneDevisSaisie {
  return {
    code: "",
    libelle: g.libelle,
    quantite: "1",
    prix: g.prix_unitaire_ht_cents === null ? "" : prixSaisi(g.prix_unitaire_ht_cents),
    tva: g.tva_bps === null ? "" : String(g.tva_bps),
  };
}

/**
 * Recopie une ligne gardée dans le devis : dans la première ligne encore vide (ni libellé, ni prix), sinon à la
 * suite. Au-delà de cent lignes, rien n'est ajouté (même plafond que le devis).
 */
export function reprendreLigne(lignes: LigneDevisSaisie[], g: LigneGardee): LigneDevisSaisie[] {
  const nouvelle = versLigneDeSaisie(g);
  const vide = lignes.findIndex((l) => !l.libelle.trim() && !l.prix.trim());
  if (vide >= 0) return lignes.map((l, i) => (i === vide ? nouvelle : l));
  return lignes.length >= 100 ? lignes : [...lignes, nouvelle];
}

/** Ce que l'artisan lit d'une ligne gardée, sous son libellé. */
export function detailLigneGardee(g: LigneGardee): string {
  const prix = g.prix_unitaire_ht_cents === null ? "prix à saisir" : `${prixSaisi(g.prix_unitaire_ht_cents)} € HT`;
  const tva = g.tva_bps === null ? "TVA à choisir" : g.tva_bps === 0 ? "TVA 0 % / non applicable" : `TVA ${String(g.tva_bps / 100).replace(".", ",")} %`;
  return `${prix} · ${tva}`;
}

/**
 * Ce qui part à la base quand l'artisan garde une ligne de son devis. Le libellé est obligatoire ; le prix et la TVA
 * sont gardés s'ils sont saisis et lisibles, sinon la ligne est gardée sans eux — jamais avec une valeur devinée.
 */
export function lireLigneAGarder(saisie: { libelle: string; prix: string; tva: string }):
  { erreur: string } | { libelle: string; prixCents: number | null; tvaBps: number | null } {
  const libelle = saisie.libelle.trim();
  if (!libelle) return { erreur: "Écrivez la prestation ou la fourniture avant de la garder." };
  if (libelle.length > LIBELLE_LIGNE_GARDEE_MAX) return { erreur: `Raccourcissez le libellé (${LIBELLE_LIGNE_GARDEE_MAX} caractères au plus).` };
  const prix = saisie.prix.trim();
  if (prix && erreurPrixSaisi(prix)) return { erreur: erreurPrixSaisi(prix)! };
  const tva = saisie.tva.trim();
  if (tva && !Object.hasOwn(TAUX_ADMIS, tva)) return { erreur: "Choisissez un taux de TVA de la liste avant de garder cette ligne." };
  return { libelle, prixCents: prix ? montantEnCentimes(prix) : null, tvaBps: tva ? TAUX_ADMIS[tva] : null };
}

/** La liste après qu'une ligne a été gardée : la ligne du même identifiant est remplacée, l'ordre est celui du libellé. */
export function avecLigneGardee(lignes: LigneGardee[], g: LigneGardee): LigneGardee[] {
  return [...lignes.filter((l) => l.id !== g.id), g].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}
