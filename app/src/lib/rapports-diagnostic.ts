// Un rapport de diagnostic vu depuis la bibliothèque Documents (audit de la refonte #264).
// Son échéance et son rattachement vivent dans `diagnostics`, pas sur la fiche document : sans eux, la bibliothèque
// affichait « À vérifier, sans échéance renseignée » pour un DPE daté, et deux ERP du même jour sur deux biens se
// confondaient (DOC-04, DOC-N1). Le lot reste la référence : on y renouvelle le rapport (DOC-03).
import { echeanceReglementaire } from "@/lib/documents-bail";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

// Les diagnostics qui citent la pièce, archivés compris (un rapport remplacé par un plus récent l'est).
export const CHAMPS_USAGE_RAPPORT =
  "document_id, type, date_realisation, date_expiration, archived_at, lot_id, bien_id, lot:lots!diagnostics_lot_id_fkey(nom, bien_id, bien:biens!lots_bien_id_fkey(nom)), bien:biens!diagnostics_bien_id_fkey(nom)";

export type UsageRapport = {
  document_id: string;
  type: string;
  date_realisation: string;
  date_expiration: string | null;
  archived_at: string | null;
  lot_id: string | null;
  bien_id: string | null;
  lot: UnOuPlusieurs<{ nom: string; bien_id: string; bien: UnOuPlusieurs<{ nom: string }> }>;
  bien: UnOuPlusieurs<{ nom: string }>;
};

export type RattachementRapport = { libelle: string; chemin: string; niveau: "lot" | "bien" };

export type SyntheseRapport = {
  // Échéance la plus proche parmi les diagnostics actifs, plafond réglementaire compris ; null sans échéance.
  expireLe: string | null;
  // Plus aucun diagnostic actif ne cite la pièce : un rapport plus récent l'a remplacée sur la fiche.
  remplace: boolean;
  // Où la pièce sert : « Bien · Lot » ou « Bien », et le chemin de la fiche (sans la racine de l'espace).
  rattachements: RattachementRapport[];
};

export function syntheseRapport(usages: UsageRapport[]): SyntheseRapport | null {
  if (usages.length === 0) return null;
  const actifs = usages.filter((u) => !u.archived_at);
  const echeances = actifs
    .map((u) => echeanceReglementaire(u.type, u.date_realisation, u.date_expiration))
    .filter((e): e is string => Boolean(e))
    .sort();
  const rattachements = new Map<string, RattachementRapport>();
  for (const u of actifs.length ? actifs : usages) {
    const lot = premier(u.lot);
    if (u.lot_id && lot) {
      const nomBien = premier(lot.bien)?.nom;
      rattachements.set(`lot-${u.lot_id}`, {
        libelle: nomBien ? `${nomBien} · ${lot.nom}` : lot.nom,
        chemin: `/parc/${lot.bien_id}/lots/${u.lot_id}#diagnostics`,
        niveau: "lot",
      });
    } else if (u.bien_id) {
      rattachements.set(`bien-${u.bien_id}`, {
        libelle: premier(u.bien)?.nom ?? "Bien",
        chemin: `/parc/${u.bien_id}#diagnostics`,
        niveau: "bien",
      });
    }
  }
  return { expireLe: echeances[0] ?? null, remplace: actifs.length === 0, rattachements: [...rattachements.values()] };
}

// L'état d'un rapport de diagnostic : son échéance réelle, ou « Remplacé » quand la fiche en cite un plus récent.
export function presentationRapport<T extends { expire_le?: string | null }>(
  doc: T,
  rapport: SyntheseRapport | null,
  presenter: (doc: T) => { libelle: string; classe: string; detail: string },
) {
  if (rapport?.remplace) {
    return { libelle: "Remplacé", classe: "puce-grise", detail: "Un rapport plus récent est enregistré sur la fiche du bien ou du lot." };
  }
  return presenter(rapport ? { ...doc, expire_le: rapport.expireLe ?? doc.expire_le } : doc);
}

export function usagesParDocument(usages: UsageRapport[]): Map<string, UsageRapport[]> {
  const parDocument = new Map<string, UsageRapport[]>();
  for (const u of usages) parDocument.set(u.document_id, [...(parDocument.get(u.document_id) ?? []), u]);
  return parDocument;
}
