/** Données permanentes du logement, indépendantes de tout contrat. */
export const ETAPES_LOT = [
  { cle: "bien", titre: "Bâtiment", detail: "Adresse et informations communes" },
  { cle: "lot", titre: "Le lot", detail: "Surfaces, confort et caractéristiques" },
  { cle: "proprietaires", titre: "Propriétaires", detail: "Détention et indivision" },
  { cle: "equipements", titre: "Équipements", detail: "Pièces, chambres et équipements" },
  { cle: "diagnostics", titre: "Diagnostics", detail: "Rapports du logement et du bâtiment" },
  { cle: "recapitulatif", titre: "Récapitulatif", detail: "Relire la fiche du lot" },
] as const;
export type EtapeLot = typeof ETAPES_LOT[number]["cle"];
export function indexEtapeLot(cle: string) {
  const aliases: Record<string, EtapeLot> = { logement: "equipements", detention: "proprietaires", caracteristiques: "lot", pieces: "equipements", "diagnostics-immeuble": "diagnostics", finalisation: "recapitulatif", "location-apercu": "recapitulatif" };
  const index = ETAPES_LOT.findIndex(e => e.cle === (aliases[cle] ?? cle));
  return index < 0 ? 1 : index;
}
export function lienLotDepuisBail(orgId: string, bienId: string, lotId: string, bailId: string, etape: EtapeLot, retourEtape = 3) {
  const query = new URLSearchParams({ parcours: "1", etape, retourBail: bailId, retourEtape: String(retourEtape) });
  return `/agence/${orgId}/parc/${bienId}/lots/${lotId}?${query}`;
}
/** Un retour interne construit à partir d’un bail du lot, jamais une URL libre. */
export function retourBailDuLot(orgId: string, bailId: unknown, etape: unknown, baux: {id: string}[]) {
  if (typeof bailId !== "string" || !baux.some(b => b.id === bailId)) return null;
  const numero = typeof etape === "string" && /^[1-7]$/.test(etape) ? etape : "3";
  return `/agence/${orgId}/baux/${bailId}#etape-bail-${numero}`;
}
