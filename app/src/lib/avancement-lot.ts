import { obligatoireEnDefaut } from "@/lib/diagnostics";
import { statutDiagnostic } from "@/lib/parc";

export type DiagnosticAvancement = { type: string; date_expiration: string | null; classe_dpe?: string | null };
/** Avancement de la fiche, indépendant des locataires, loyers et signatures du bail. */
export function avancementLot({ lot, bien, quoteParts, pieces, diagnosticsLot, diagnosticsBien }: {
  lot: { nom: string; surface_m2: number | null; pieces: number | null; identifiant_fiscal: string | null; chauffage: string | null; eau_chaude: string | null; locaux_privatifs: string | null; description: string | null };
  bien: { type: string; address_line1: string | null; postal_code: string | null; city: string | null };
  quoteParts: number | null;
  pieces: number | null;
  diagnosticsLot: DiagnosticAvancement[] | null;
  diagnosticsBien: DiagnosticAvancement[] | null;
}) {
  const habitation = ["appartement", "maison", "immeuble"].includes(bien.type);
  const rempli = (valeur: string | null) => Boolean(valeur?.trim());
  const controles = [
    { titre: "Adresse", ancre: "batiment", fait: [bien.address_line1, bien.postal_code, bien.city].every(rempli) },
    { titre: "Caractéristiques", ancre: "caracteristiques", fait: rempli(lot.nom) && Number(lot.surface_m2) > 0 && (!habitation || (rempli(lot.identifiant_fiscal) && Number(lot.pieces) > 0 && rempli(lot.chauffage) && rempli(lot.eau_chaude) && rempli(lot.locaux_privatifs) && rempli(lot.description))) },
    { titre: "Propriétaires", ancre: "detention", fait: quoteParts === null ? null : Math.abs(quoteParts - 100) < 0.005 },
    ...(habitation ? [{ titre: "Pièces de l’état des lieux", ancre: "pieces", fait: pieces === null ? null : pieces > 0 }] : []),
    { titre: "Diagnostics", ancre: "diagnostics", fait: diagnosticsLot === null || diagnosticsBien === null ? null :
      (!habitation || (!obligatoireEnDefaut("dpe", diagnosticsLot) && !diagnosticsLot.some(d => d.type === "dpe" && d.classe_dpe === "G"))) &&
      !obligatoireEnDefaut("erp", diagnosticsBien) &&
      ![...diagnosticsLot, ...diagnosticsBien].some(d => statutDiagnostic(d.date_expiration) === "expire") },
  ];
  if (controles.some(c => c.fait === null)) return null;
  const faits = controles.filter(c => c.fait).length;
  return { faits, total: controles.length, pourcentage: Math.round(faits / controles.length * 100), controles, prochain: controles.find(c => !c.fait) };
}
