import { obligatoireEnDefaut } from "@/lib/diagnostics";
import { statutDiagnostic } from "@/lib/parc";

export type DiagnosticAvancement = { type: string; date_expiration: string | null; classe_dpe?: string | null };
export type CaracteristiquesAvancement = { nom: string; surface_m2: number | null; pieces: number | null; identifiant_fiscal: string | null; chauffage: string | null; eau_chaude: string | null; locaux_privatifs: string | null; description: string | null };
const rempli = (valeur: string | null) => Boolean(valeur?.trim());

/** Caractéristiques du lot encore à renseigner, nommées comme dans la carte « Le logement » :
 * la liste des biens et la fiche du lot disent la même chose (audit #264, FL-05). */
export function caracteristiquesManquantes(lot: CaracteristiquesAvancement, typeBien: string): string[] {
  const habitation = ["appartement", "maison", "immeuble"].includes(typeBien);
  return [
    !rempli(lot.nom) && "Nom",
    !(Number(lot.surface_m2) > 0) && "Surface",
    habitation && !(Number(lot.pieces) > 0) && "Pièces",
    habitation && !rempli(lot.chauffage) && "Chauffage",
    habitation && !rempli(lot.eau_chaude) && "Eau chaude",
    habitation && !rempli(lot.locaux_privatifs) && "Locaux privatifs",
    habitation && !rempli(lot.description) && "Autres parties du logement",
    habitation && !rempli(lot.identifiant_fiscal) && "Identifiant fiscal",
  ].filter((libelle): libelle is string => Boolean(libelle));
}

/** Avancement de la fiche, indépendant des locataires, loyers et signatures du bail. */
export function avancementLot({ lot, bien, quoteParts, pieces, diagnosticsLot, diagnosticsBien }: {
  lot: CaracteristiquesAvancement;
  bien: { type: string; address_line1: string | null; postal_code: string | null; city: string | null };
  quoteParts: number | null;
  pieces: number | null;
  diagnosticsLot: DiagnosticAvancement[] | null;
  diagnosticsBien: DiagnosticAvancement[] | null;
}) {
  const habitation = ["appartement", "maison", "immeuble"].includes(bien.type);
  const controles = [
    { titre: "Adresse", ancre: "batiment", fait: [bien.address_line1, bien.postal_code, bien.city].every(rempli) },
    { titre: "Caractéristiques", ancre: "caracteristiques", fait: caracteristiquesManquantes(lot, bien.type).length === 0 },
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
