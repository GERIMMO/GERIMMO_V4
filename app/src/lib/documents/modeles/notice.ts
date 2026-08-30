// 05 — Notice d'information, annexe obligatoire au contrat de location
// (arrêté du 29 mai 2015). Cible : le bail. Les rubriques reprennent le
// contenu de la notice officielle sous forme condensée et fidèle — le texte
// intégral officiel pourra remplacer chaque rubrique sans toucher au gabarit.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, assemblerPage, cartouches, echapper, enTete, faitA, section, titre } from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
} from "./communs";
import type { Assemblage } from "./index";

// Rubriques de la notice (arrêté du 29 mai 2015, résumé fidèle rubrique par
// rubrique). Servies telles quelles : zéro donnée à demander.
const RUBRIQUES: [string, string][] = [
  [
    "1 — Le contrat de location",
    "Le bail est signé pour trois ans au moins lorsque le bailleur est une personne physique (six ans pour une personne morale), un an pour une location meublée (neuf mois pour un étudiant, sans reconduction). Il est conforme au contrat type réglementaire et remis en un exemplaire original à chaque partie. À l'échéance, il se reconduit tacitement aux mêmes conditions.",
  ],
  [
    "2 — Le loyer",
    "Le loyer est fixé librement, sauf en zone tendue où son évolution à la relocation est encadrée et où peut s'appliquer un plafonnement par arrêté préfectoral. Il ne peut être révisé qu'une fois par an, si le bail le prévoit, dans la limite de la variation de l'indice de référence des loyers (IRL) publié par l'INSEE.",
  ],
  [
    "3 — Les charges récupérables",
    "Les charges récupérables sont limitées à la liste du décret n° 87-713 du 26 août 1987 (eau, chauffage collectif, entretien des parties communes, taxe d'enlèvement des ordures ménagères…). Réglées par provisions, elles donnent lieu à une régularisation annuelle justifiée ; le forfait, possible en meublé et en colocation, ne peut être manifestement disproportionné.",
  ],
  [
    "4 — Le dépôt de garantie",
    "Le dépôt de garantie ne peut excéder un mois de loyer hors charges (deux mois en meublé). Il est restitué dans un délai maximal d'un mois après la remise des clés si l'état des lieux de sortie est conforme à celui d'entrée, deux mois sinon, déduction faite des sommes justifiées restant dues au bailleur. À défaut, il produit intérêt au profit du locataire.",
  ],
  [
    "5 — L'état des lieux",
    "Un état des lieux contradictoire est établi à l'entrée et à la sortie, joint au contrat. Le locataire peut demander à le compléter dans les dix jours pour tout élément, et pendant le premier mois de chauffe pour le chauffage. À défaut d'état des lieux, le locataire est présumé avoir reçu le logement en bon état de réparations locatives.",
  ],
  [
    "6 — Les réparations, l'entretien et les travaux",
    "Le locataire assume l'entretien courant et les réparations locatives (décret n° 87-712) ; le bailleur prend en charge les réparations autres que locatives, les travaux d'amélioration des parties communes et le maintien en état de servir. Le locataire laisse l'accès pour les travaux nécessaires, qui peuvent ouvrir droit à réduction de loyer au-delà de vingt et un jours.",
  ],
  [
    "7 — Les obligations du bailleur",
    "Le bailleur remet un logement décent, en bon état d'usage et de réparations, avec les équipements en bon état de fonctionnement. Il assure au locataire une jouissance paisible, lui remet gratuitement une quittance s'il la demande, et transmet les documents obligatoires (diagnostics, régularisations, décompte de charges).",
  ],
  [
    "8 — Les obligations du locataire",
    "Le locataire paie le loyer et les charges aux termes convenus, use paisiblement du logement, répond des dégradations survenues pendant le bail, s'assure contre les risques locatifs et en justifie chaque année, et ne transforme pas les lieux sans accord écrit du bailleur.",
  ],
  [
    "9 — La fin du contrat et le congé",
    "Le locataire peut donner congé à tout moment (préavis de trois mois, réduit à un mois en zone tendue et dans les cas prévus par la loi, sur justificatif). Le bailleur ne peut donner congé que pour l'échéance du bail, avec un préavis de six mois (trois mois en meublé), pour vendre, reprendre le logement ou pour motif légitime et sérieux ; des protections renforcées s'appliquent aux locataires âgés de plus de 65 ans aux ressources modestes.",
  ],
  [
    "10 — Les aides au logement",
    "Selon sa situation, le locataire peut bénéficier d'une aide au logement (APL, ALS, ALF) versée par la CAF ou la MSA, et des dispositifs d'Action Logement (garantie Visale, avance Loca-Pass). La demande s'effectue dès l'entrée dans les lieux.",
  ],
  [
    "11 — Les litiges et les voies de recours",
    "En cas de litige, les parties recherchent d'abord une solution amiable, le cas échéant devant la commission départementale de conciliation, compétente et gratuite pour la plupart des différends locatifs. À défaut, le juge des contentieux de la protection peut être saisi. L'agence départementale d'information sur le logement (ADIL) renseigne gratuitement locataires et bailleurs.",
  ],
];

export async function assemblerNotice(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;

  const f = new Fusion();
  const exp = expediteur(ctx);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const corps = `
    ${enTete(f, exp, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Notice d'information", "Annexe obligatoire au contrat de location", [
      "Relative aux droits et obligations des locataires et des bailleurs",
      "Arrêté du 29 mai 2015 pris en application de l'article 3 de la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Annexée au contrat", `Réf. ${f.champ(referenceBail, "référence du bail")} du ${f.date(ctx.bail.date_debut)}`],
      ["Logement", `<div>${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}</div>`],
      ["Bailleur", `<div>${nomsBailleurs(f, ctx.bailleurs)}</div>`],
      ["Locataire", `<div>${nomsLocataires(f, ctx.locataires)}</div>`],
    ])}
    <p>La présente notice est remise au locataire et annexée au contrat de location dont elle fait
    partie intégrante. Elle rappelle les droits et obligations respectifs des parties ainsi que les
    voies de recours et d'indemnisation ouvertes en cas de litige.</p>
    ${RUBRIQUES.map(([t, texte]) => `${section(t)}<p>${echapper(texte)}</p>`).join("")}
    ${section("Remise de la notice")}
    <p>Le locataire reconnaît avoir reçu la présente notice avec son exemplaire du contrat de
    location. Pour toute question : la commission départementale de conciliation et l'ADIL de votre
    département (coordonnées sur service-public.fr et anil.org).</p>
    ${faitA(f, exp.ville, new Date().toISOString())}
  `;

  return {
    document: assemblerPage({
      f,
      titreDocument: "Notice d'information",
      nomPied: "Notice d'information",
      reference: referenceCourte("NOTICE", ctx.bail.id),
      corps,
    }),
    titreGed: "Notice d'information (annexe au bail)",
    nomFichier: "notice-information",
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
