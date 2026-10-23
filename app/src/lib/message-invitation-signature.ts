// Le message commun de l'invitation envoyée par le prestataire de signature (champ « notes » de la demande Zoho, lu par
// chaque signataire dans son e-mail d'invitation et sur la page de signature).
//
// Plan de conformité du 23/10/2026, constat R53 : les signataires sont informés de la transmission de leurs données à
// Zoho Sign (RGPD, art. 14). Décision du dirigeant du 23/10 : l'invitation à signer un état des lieux d'entrée rappelle
// au locataire son droit de le compléter. Pour l'acte de cautionnement, les consignes de la mention personnelle restent
// en tête.
//
// L'adresse d'expédition des invitations n'est pas un paramètre de l'API de création : c'est celle du compte Zoho Sign
// (réglage de la console du prestataire, geste du dirigeant).

import { INSTRUCTIONS_CAUTION_MOBILE } from "./zoho-sign";
import { RAPPEL_COMPLEMENT_EDL_ENTREE } from "./textes-signature-actes";
import { adresseDuSite, domaineDuSite } from "./site";

/** Limite retenue pour le message : celle de la note privée Zoho (1 000 caractères), faute de limite documentée lue. */
export const LONGUEUR_MAX_MESSAGE_INVITATION = 1000;
const LONGUEUR_MAX_BAILLEUR = 160;

export function lienConfidentialite(): string {
  return `${adresseDuSite() ?? `https://${domaineDuSite()}`}/confidentialite`;
}

/** Les noms des propriétaires signataires, sans caractère de contrôle, bornés. */
export function bailleurDesSignataires(signataires: { qualite?: string; prenom: string; nom: string }[]): string {
  const noms = signataires
    .filter((s) => s.qualite === "Propriétaire")
    .map((s) => `${s.prenom} ${s.nom}`.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const texte = noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0] ?? "votre bailleur";
  return texte.length > LONGUEUR_MAX_BAILLEUR ? `${texte.slice(0, LONGUEUR_MAX_BAILLEUR - 1).trimEnd()}…` : texte;
}

export function phraseTransmissionZoho(bailleur: string, lien: string): string {
  return `Vos nom, adresse électronique et numéro de mobile sont transmis à notre prestataire de signature Zoho Sign pour ce seul document, à la demande de ${bailleur}. Détails : ${lien}.`;
}

export function messageInvitationSignature(p: {
  modele?: string;
  bailleur: string;
  lienConfidentialite: string;
  /** État des lieux d'entrée : le rappel du droit de le compléter est ajouté. */
  edlEntree?: boolean;
}): string {
  const parties = [
    ...(p.modele === "cautionnement" ? [INSTRUCTIONS_CAUTION_MOBILE] : []),
    phraseTransmissionZoho(p.bailleur, p.lienConfidentialite),
    ...(p.modele === "edl" && p.edlEntree ? [RAPPEL_COMPLEMENT_EDL_ENTREE] : []),
  ];
  const message = parties.join("\n\n");
  if (message.length > LONGUEUR_MAX_MESSAGE_INVITATION) throw new Error("Le message d’invitation dépasse la place disponible chez le prestataire. Contactez l’assistance.");
  return message;
}
