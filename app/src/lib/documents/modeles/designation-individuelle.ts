import { Fusion, section } from "../gabarit";
import type { ContexteBail } from "./communs";

export function designationIndividuelle(ctx: ContexteBail, f: Fusion): string {
  const c = ctx.chambre;
  if (!c) return "";
  return `${section("Partie privative et espaces partagés")}
    <p>Chambre réservée au seul locataire : ${f.champ(c.nom, "désignation de la chambre")}.
    Surface habitable privative : ${f.champ(c.surface_m2, "surface privative")} m² ; volume habitable privatif : ${f.champ(c.volume_m3, "volume privatif")} m³.</p>
    <p>Description et accès : ${f.champ(c.description, "description de la chambre")}.</p>
    <p>Équipements privatifs : ${f.champ(c.equipements, "équipements privatifs, ou néant")}.</p>
    <p>Pièces et équipements du logement partagés avec les autres occupants : ${f.champ(c.espaces_partages, "espaces partagés")}.</p>
    <p>Les autres chambres ne font pas partie des locaux loués au titre de ce contrat. Les droits d’usage communs n’autorisent pas l’accès aux parties privatives d’un autre occupant.</p>
    ${section("Indépendance du contrat")}
    <p>Le loyer, les charges et le dépôt ci-dessous sont ceux de ce seul contrat. Il n’existe aucune solidarité entre les titulaires des différents contrats individuels du logement.
    Chaque locataire répond des sommes et obligations prévues par son propre contrat. Les éventuelles cautions garantissent uniquement le locataire désigné dans leur acte.</p>
    <p>Le congé et l’état des lieux de sortie de ce locataire concernent sa partie privative et les espaces partagés mis à sa disposition ; ils ne mettent pas fin aux contrats des autres occupants.
    Le dépôt de ce contrat est restitué individuellement dans les conditions et délais légaux après la remise des clés, déduction faite des seules sommes justifiées à la charge de ce locataire.</p>
    <p>Loyer de référence du logement entier, hors charges : ${f.montant(ctx.plafondColocation, "loyer maximum du logement entier")} par mois.
    La somme des loyers des contrats individuels ne peut excéder le montant applicable au logement entier. Les provisions sur charges font l’objet d’une régularisation propre à ce contrat ; un forfait ne donne pas lieu à régularisation.</p>`;
}
