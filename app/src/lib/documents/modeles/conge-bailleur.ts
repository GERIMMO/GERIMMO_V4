// Congé délivré par le bailleur — art. 15 de la loi n° 89-462 du 6 juillet
// 1989 (logement nu), art. 25-8 (meublé) : au terme du bail uniquement, reçu
// au moins six mois (nu) ou trois mois (meublé) avant l'échéance ; reçu trop
// tard, il est sans effet pour ce terme (le bail est reconduit). Le motif (vente, reprise, motif légitime et sérieux) et ses
// précisions arrivent par `options` : ce sont les choix du geste, pas des
// données du bail. Congé pour vente d'un logement nu : le congé vaut offre de
// vente au profit du locataire (art. 15-II) : le prix proposé est exigé et
// imprimé (audit 29/09) — sans prix, pas de PDF. La date d'effet n'est plus
// saisie : c'est le terme du bail calculé par la base (`terme_bail`, la même
// règle que l'enregistrement du congé), pour la date de réception prévue. Document émis SEUL par
// l'organisation → signature d'émetteur ; la notification part hors
// plateforme (LRAR, acte de commissaire de justice, remise en main propre) : Gerimmo génère
// et suit, il ne notifie jamais (RM-A3.1).
//
// Textes officiels, lot T1 (25/11/2026), d'après le recueil fourni par le dirigeant (article 15, article 13 et
// article 25-8 de la loi du 6 juillet 1989 ; notice annexée à l'arrêté du 13 décembre 2017) :
//  · la date limite de réception est comptée jusqu'au dernier jour du bail, plus jusqu'au lendemain (R13-A1) ;
//  · congé pour vendre d'un logement nu : les cinq premiers alinéas de l'article 15 II sont reproduits mot pour mot
//    (article-15-ii.ts), les conditions de la vente et la désignation des locaux sont exigées ;
//  · congé pour vendre ou pour reprise d'un logement nu : la lettre annonce la notice d'information en pièce jointe.
//    Gerimmo ne l'imprime pas (le texte du recueil porte au moins une coquille) : le bailleur la joint lui-même ;
//  · reprise en location nue : refusée pour une société qui n'est pas une société civile de famille ;
//  · logement acheté déjà loué : la question est posée ; dans les cas où la loi déplace l'effet du congé, Gerimmo
//    ne calcule rien et ne produit pas la lettre.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { ajouterMois, congeBailleurDansLesDelais, dateLimiteCongeBailleur, lendemain, refusLogementAcheteOccupe } from "@/lib/delai-conge-bailleur";
import { normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { lireMontantAvecEspaces } from "@/lib/saisie-montant";
import {
  Fusion,
  assemblerPage,
  blocSignatureEmetteur,
  cartouches,
  echapper,
  enTete,
  eur,
  faitA,
  montantEnLettres,
  section,
  titre,
  pointFinal,
} from "../gabarit";
import {
  adresseLogement,
  chargerContexteBail,
  expediteur,
  liensLocataires,
  nomsBailleurs,
  nomsLocataires,
  referenceCourte,
  signatureOrganisation,
} from "./communs";
import { alineasArticle15IIIntacts } from "./article-15-ii";
import type { Assemblage } from "./index";

const LIBELLES_MOTIF = {
  vente: "vente",
  reprise: "reprise",
  motif_legitime: "motif légitime et sérieux",
} as const;

type Motif = keyof typeof LIBELLES_MOTIF;

// Le calcul des délais vit dans lib/delai-conge-bailleur.ts (module sans dépendance, lu aussi par l'écran du bail).
export { ajouterMois, congeBailleurDansLesDelais, dateLimiteCongeBailleur, refusLogementAcheteOccupe };

/** Prix saisi (« 245 000 », « 245000,50 ») → nombre positif, sinon null. */
export function prixDepuisOptions(brut: string | undefined): number | null {
  if (!brut) return null;
  // Lu comme tous les montants (VER-TS-02) : « 245 000,50 » et « 245000,50 € » restent admis ; « 1e5 » ne vaut plus 100000.
  const lu = lireMontantAvecEspaces(brut);
  return "montant" in lu ? lu.montant : null;
}

const SOUS_TITRES: Record<Motif, string> = {
  vente: "Congé pour vendre",
  reprise: "Congé pour reprise",
  motif_legitime: "Congé pour motif légitime et sérieux",
};

export async function assemblerCongeBailleur(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
  options?: Record<string, string>
): Promise<Assemblage> {
  const motif = (options?.motif ?? "") as Motif;
  if (!(motif in LIBELLES_MOTIF)) {
    return {
      erreur: "Motif du congé manquant ou inconnu (vente, reprise ou motif légitime et sérieux).",
    };
  }

  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  // Phase 3 (C31, C32) : un congé du bailleur se délivre sur un bail actif, comme l'enregistrement du congé le veut (la base
  // refuse tout autre bail). En préavis, un congé est déjà enregistré ; terminé, le bail est clos : la lettre annonçait une
  // échéance postérieure à la sortie et renvoyait à un enregistrement impossible.
  if (ctx.bail.etat === "termine") return { erreur: "Ce bail est terminé : aucun congé n’est à délivrer." };
  if (ctx.bail.etat === "preavis") return { erreur: "Un congé est déjà enregistré pour ce bail (préavis en cours) : la location prend fin à sa date d’effet. Un congé du bailleur se prépare pour un bail actif." };
  if (ctx.bail.etat !== "actif") return { erreur: "Ce bail n’est pas encore en cours : le congé du bailleur se prépare pour un bail actif." };

  // Nu ou meublé : le type du bail prime ; un bail « colocation » suit
  // l'ameublement du lot. Le préavis et la base légale en dépendent.
  const meuble = ctx.bail.type === "meuble" ? true : ctx.bail.type === "nu" ? false : ctx.lot.meuble;
  const preavis = meuble ? "trois" : "six";
  const preavisMois = meuble ? 3 : 6;

  // Congé pour vente d'un logement NU : le congé vaut offre de vente, le prix
  // en est une mention obligatoire (art. 15-II). Pas de PDF sans prix.
  const prixVente = prixDepuisOptions(options?.prix_vente);
  if (motif === "vente" && !meuble && prixVente === null) {
    return {
      erreur:
        "Congé pour vente d'un logement loué nu : indiquez le prix de vente proposé — le congé vaut offre de vente au locataire (article 15-II de la loi du 6 juillet 1989).",
    };
  }

  // Lot T1 (R13-A5) : en location nue, la reprise pour habiter n'est pas ouverte à une société qui n'est pas une
  // société civile de famille (article 13 de la loi : société civile « constituée exclusivement entre parents et
  // alliés jusqu'au quatrième degré inclus », au profit de l'un des associés ; indivision : tout membre). Même refus
  // que la base à l'enregistrement du congé. En meublé, le texte fourni ne le dit pas : non contrôlé (JURISTE).
  const qualites = ctx.bailleurs.map((b) => normaliserQualiteBailleur(b.qualite));
  const sciFamiliale = qualites.includes("SCI familiale");
  if (motif === "reprise" && !meuble && qualites.some((q) => q === "SCI" || q === "Personne morale")) {
    return {
      erreur:
        "Congé pour reprise impossible : le bailleur est une société (SCI non familiale ou autre personne morale). En location nue, la reprise pour habiter est réservée au bailleur personne physique, à la société civile de famille au profit de l’un de ses associés et aux membres d’une indivision. Si la société est une SCI familiale, corrigez d’abord la qualité du bailleur sur sa fiche.",
    };
  }

  // Lot T1 (R13-A7) : logement acheté alors qu'il était déjà loué. Gerimmo ne connaît pas la date d'acquisition : la
  // question est posée à chaque congé pour vendre ou pour reprise d'un logement nu, et la réponse est obligatoire.
  const acheteOccupe = options?.achete_occupe;
  const dateAcquisition = /^\d{4}-\d{2}-\d{2}$/.test(options?.date_acquisition ?? "") ? (options?.date_acquisition as string) : null;
  const questionAcquisition = !meuble && (motif === "vente" || motif === "reprise");
  if (questionAcquisition && acheteOccupe !== "oui" && acheteOccupe !== "non") {
    return {
      erreur:
        "Indiquez si le logement a été acheté alors qu’il était déjà loué (oui ou non) : dans ce cas, la loi limite le congé pour vendre et repousse l’effet du congé pour reprise.",
    };
  }
  if (questionAcquisition && acheteOccupe === "oui" && !dateAcquisition) {
    return { erreur: "Logement acheté déjà loué : indiquez la date d’acquisition." };
  }

  // Lot T1 (R02-A1, R13-A3) : sans le texte intact des cinq alinéas à reproduire, pas de congé pour vendre.
  const alineas15II = motif === "vente" && !meuble ? alineasArticle15IIIntacts() : null;
  if (motif === "vente" && !meuble && !alineas15II) {
    return {
      erreur:
        "Le congé pour vendre un logement loué nu doit reproduire les cinq premiers alinéas de l’article 15 II de la loi du 6 juillet 1989. Le texte enregistré dans Gerimmo n’est pas intact : la lettre n’est pas produite. Signalez-le depuis Aide et retours.",
    };
  }

  // Date d'effet : le terme du bail calculé par la base pour la date de
  // réception prévue ; si le préavis n'y tient plus, le terme suivant.
  // Sans date de réception prévue : aujourd'hui, au jour de Paris (le jour UTC du
  // serveur était la veille entre minuit et 2 h ; décision du 15/10/2026).
  const presentation = /^\d{4}-\d{2}-\d{2}$/.test(options?.date_presentation ?? "")
    ? (options?.date_presentation as string)
    : aujourdhuiParis();
  let terme: string | null = null;
  {
    const { data, error } = await supabase.rpc("terme_bail", { p_bail: ctx.bail.id, p_date: presentation });
    if (error) return { erreur: "Le terme du bail n'a pas pu être calculé." };
    terme = (data as string | null) ?? null;
  }
  if (terme && terme < presentation) {
    return {
      erreur: `Le bail étudiant a pris fin le ${terme.split("-").reverse().join("/")} : il n'est jamais reconduit, aucun congé n'est à délivrer.`,
    };
  }
  const termeTardif = terme !== null && !congeBailleurDansLesDelais(presentation, terme, preavisMois);
  if (terme && termeTardif) {
    const { data, error } = await supabase.rpc("terme_bail", { p_bail: ctx.bail.id, p_date: lendemain(terme) });
    if (error) return { erreur: "Le terme du bail n'a pas pu être calculé." };
    terme = (data as string | null) ?? null;
  }
  // Lot T1 (R13-A7) : acheté déjà loué — le terme visé est comparé à la date d'acquisition ; dans le doute, refus.
  if (questionAcquisition && acheteOccupe === "oui" && dateAcquisition) {
    if (!terme) return { erreur: "Logement acheté déjà loué : le terme du bail ne se calcule pas, Gerimmo ne peut pas vérifier le délai depuis l’acquisition. Faites établir ce congé par un professionnel." };
    const refus = refusLogementAcheteOccupe(motif as "vente" | "reprise", dateAcquisition, terme);
    if (refus) return { erreur: refus };
  }
  const articleLoi = meuble ? "25-8" : "15";

  const f = new Fusion();
  const exp = expediteur(ctx);
  const reference = referenceCourte("CONGE", ctx.bail.id);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const agence = ctx.organisation.type === "agence";
  // La date d'effet est le terme calculé ; incalculable (bail nu à durée
  // réduite), la date de fin du bail, à défaut un libellé à compléter.
  const dateEffet = f.date(terme ?? ctx.bail.date_fin, "date d'échéance du bail");
  const prixHtml =
    prixVente !== null
      ? `<b>${eur(prixVente)}</b>${prixVente < 1_000_000 ? ` (${montantEnLettres(prixVente)})` : ""}`
      : null;
  const conditions = options?.conditions_vente?.trim();
  // Lot T1 : la notice de l'arrêté du 13 décembre 2017 « est jointe au congé délivré par le bailleur en raison de sa
  // décision de reprendre ou de vendre le logement » (article 15 I). Elle ne s'applique pas aux logements loués
  // meublés (préambule de la notice). La lettre l'annonce ; le bailleur la joint lui-même (même logique que Q46).
  const noticeJointe = !meuble && (motif === "vente" || motif === "reprise");

  // Audit palier 1 (P0-08, 23/11/2026) : l'adresse du bénéficiaire et les raisons de la reprise ont leur place dans
  // la lettre. Non saisies, elles sont comptées manquantes, comme le nom et le lien du bénéficiaire l'étaient déjà :
  // le PDF n'est pas généré tant qu'elles ne sont pas renseignées (une lettre de reprise ne sort pas avec des blancs).
  // Lot T1 : ces mentions sont celles de l'article 15 I et du point 2-1-5 de la notice (recueil fourni par le dirigeant).
  // Lot T1 (notice, point 2-2-3) : le congé pour vendre « reprend la désignation des locaux loués figurant au bail » et
  // décrit les locaux et leurs dépendances. Mêmes informations et mêmes libellés que le bail (bail-nu.ts) : ce qui
  // manque est compté « à renseigner » et bloque le PDF. La surface n'est pas exigée par la notice. Le nombre de pièces
  // s'imprime quand il est connu, sans bloquer : sur un lot loué, la base le verrouille (il ne pourrait plus être complété).
  // Calculée pour le seul congé pour vendre d'un logement nu : ailleurs, rien ne doit être compté « à renseigner ».
  const designation = motif !== "vente" || meuble ? "" : (
    ctx.chambre
      ? [
          f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte"),
          `Chambre privative : ${f.champ([ctx.chambre.nom, ctx.chambre.equipements].filter(Boolean).join(" — "), "chambre et équipements privatifs")}`,
          `Espaces partagés : ${f.champ(ctx.chambre.espaces_partages, "espaces partagés autorisés par ce contrat")}`,
        ]
      : [
          f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte"),
          ctx.lot.pieces ? `Nombre de pièces principales : ${echapper(String(ctx.lot.pieces))}` : null,
          `Autres parties du logement : ${f.champ(ctx.lot.description, "cave, grenier, balcon, terrasse, jardin…", "autres parties du logement")}`,
          `Locaux et équipements à usage privatif : ${f.champ(ctx.lot.locaux_privatifs, "cave, parking, garage… avec numéro", "locaux privatifs du logement")}`,
        ]
  )
    .filter(Boolean)
    .join("<br/>\n         ");
  let blocMotif: string;
  if (motif === "vente") {
    blocMotif = meuble
      ? `<p>Le présent congé vous est délivré au motif de la <b>vente</b> du logement désigné
         ci-dessus (article 25-8 de la loi du 6 juillet 1989).</p>
         ${prixHtml ? `<p>Prix de vente envisagé : ${prixHtml}.</p>` : ""}
         <p class="mentions">En location meublée, le congé pour vendre n'emporte pas offre de vente
         au profit du locataire : le droit de préemption de l'article 15-II, propre à la location
         nue, ne s'applique pas ici.</p>`
      : `<p>Le présent congé vous est délivré en vue de la <b>vente</b> du logement désigné
         ci-dessus.</p>
         <p>Désignation des locaux loués, telle qu'elle figure au bail :<br/>${designation}</p>
         <p>Prix de la vente projetée : ${prixHtml}.<br/>
         Conditions de la vente projetée : ${f.champ(conditions, "conditions de la vente projetée", "conditions de la vente")}${pointFinal(conditions)}</p>
         <p>Le présent congé <b>vaut offre de vente</b> à votre profit. Cette offre est valable pendant les
         <b>deux premiers mois</b> du délai de préavis, dans les conditions de l'article 15, II, de la loi du
         6 juillet 1989, dont les cinq premiers alinéas sont reproduits ci-après.</p>
         ${section("Article 15, II, de la loi du 6 juillet 1989 (reproduction)")}
         ${(alineas15II ?? []).map((alinea) => `<p>${echapper(alinea)}</p>`).join("\n         ")}`;
    // Lot T1 (R02-A1, R02-A2, R02-A7, R13-A3, R13-A6) : le résumé de l'offre de vente (« à peine de nullité de l'offre »,
    // « le notaire doit vous notifier ») disait autre chose que la loi ; il est remplacé par la reproduction mot pour mot.
  } else if (motif === "reprise") {
    blocMotif = `<p>Le présent congé vous est délivré au motif de la <b>reprise</b> du logement
      pour l'habiter à titre de résidence principale, au bénéfice de
      ${f.champ(options?.beneficiaire_nom, "nom du bénéficiaire de la reprise")},
      ${f.champ(options?.beneficiaire_lien, "lien avec le bailleur")},
      demeurant ${f.champ(options?.beneficiaire_adresse, "adresse du bénéficiaire de la reprise")}${pointFinal(options?.beneficiaire_adresse)}</p>
      <p>Raisons de la reprise : ${f.champ(options?.raisons_reprise, "raisons de la reprise")}${pointFinal(options?.raisons_reprise)}</p>
      <p class="mentions">${
        // Lot T1 (R02-A8) : les liens admis sont ceux du texte, avec « à la date du congé » (article 15 I ; 25-8 I en
        // meublé). Bailleur société civile de famille (location nue) : la reprise se fait au profit d'un associé (article 13).
        sciFamiliale && !meuble
          ? "Le bailleur est une société civile constituée exclusivement entre parents et alliés jusqu'au quatrième degré inclus : la reprise est faite par la société au profit de l'un de ses associés (article 13 de la loi du 6 juillet 1989)."
          : "Le bénéficiaire de la reprise ne peut être que le bailleur, son conjoint, le partenaire auquel il est lié par un pacte civil de solidarité enregistré à la date du congé, son concubin notoire depuis au moins un an à la date du congé, ses ascendants, ses descendants ou ceux de son conjoint, de son partenaire ou de son concubin notoire."
      } Le bailleur justifie du caractère <b>réel et sérieux</b> de sa décision de reprise.</p>`;
  } else {
    blocMotif = `<p>Le présent congé vous est délivré pour un <b>motif légitime et sérieux</b>,
      à savoir : ${f.champ(options?.motif_detail, "motif invoqué")}${pointFinal(options?.motif_detail)}</p>
      <p class="mentions">Le motif légitime et sérieux résulte notamment de l'inexécution par le
      locataire de l'une de ses obligations (impayés répétés, troubles de voisinage…) ; en cas de
      contestation, son bien-fondé est apprécié par le juge.</p>`;
  }

  const corps = `
    ${enTete(f, exp, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Congé délivré par le bailleur", SOUS_TITRES[motif], [
      `Article ${articleLoi} de la loi n° 89-462 du 6 juillet 1989`,
    ])}
    ${cartouches([
      ["Bailleur", `<div>${nomsBailleurs(f, ctx.bailleurs)}</div>`],
      ["Locataire (destinataire)", `<div>${nomsLocataires(f, ctx.locataires)}</div>`],
      [
        "Logement loué",
        `<div>${f.champ(adresseLogement(ctx.lot, ctx.bien), "adresse complète, étage, porte")}</div>`,
      ],
      [
        "Bail",
        // Lot 53 (reprise du lot 51, W19) : « prise d’effet » avec l'apostrophe typographique des documents du dossier du bail.
        `Réf. ${echapper(referenceBail)} — prise d’effet le ${f.date(ctx.bail.date_debut, "date de prise d'effet du bail")}`,
      ],
    ])}
    <p>Madame, Monsieur,</p>
    <p>${
      agence
        ? "Au nom et pour le compte du bailleur, dont nous sommes mandataire, nous vous notifions"
        : "Nous vous notifions"
    } par la présente <b>congé</b> du logement désigné ci-dessus, à effet à l'échéance du contrat
    de location, conformément à l'article ${articleLoi} de la loi n° 89-462 du 6 juillet 1989.</p>

    ${section("Motif du congé")}
    ${blocMotif}

    ${section("Date d'effet et préavis")}
    <p>Le présent congé prend effet à l'échéance du bail, soit le ${dateEffet}. Il doit vous
    parvenir au moins <b>${preavis} mois</b> avant cette date — délai de préavis applicable à un
    logement ${meuble ? "loué meublé" : "loué nu"} ; un congé reçu hors délai serait sans effet
    pour l'échéance visée.</p>
    ${
      termeTardif
        ? `<p class="mentions">Reçu le ${f.date(presentation)}, ce congé ne respecterait plus le préavis
           avant l'échéance en cours : il vise l'échéance suivante.</p>`
        : ""
    }
    <p>Vous devrez avoir libéré les lieux et restitué l'ensemble des clés au plus tard à la date
    d'effet ; un état des lieux de sortie sera établi contradictoirement.</p>

    ${/* Phase 3, lot 51 (W17) : l'encadré « Notification » (modes d'envoi, « Gerimmo … ne le notifie jamais », date à
         enregistrer sur la fiche du bail) s'adressait à l'expéditeur, dans la lettre notifiée au locataire. Ces consignes
         restent à l'écran de préparation du congé (generer-conge-bailleur.tsx, catalogue-options.ts) ; elles sortent du PDF. */ ""}
    ${section("Mentions")}
    <div class="mentions">
      <p>Pendant le délai de préavis, le locataire n'est redevable du loyer et des charges que
      pour le temps où il occupe réellement les lieux : il peut quitter le logement à tout moment,
      sans préavis de sa part.</p>
      ${/* Lot T1 (R02-A9, R13-A8) : la protection est décrite comme le texte (article 15 III, et 25-8 II en meublé) :
            personne à charge, exception du bailleur, dates d'appréciation. Le IV de l'article 15 (allocation de
            l'article L. 544-1 du code de la sécurité sociale) ne figure pas à l'article 25-8 : location nue seulement. */ ""}
      <p>Le bailleur ne peut s'opposer au renouvellement du contrat en donnant congé à un locataire âgé de
      plus de soixante-cinq ans dont les ressources annuelles sont inférieures au plafond de ressources en vigueur
      pour l'attribution des logements locatifs conventionnés, sans qu'un logement correspondant à ses besoins et
      à ses possibilités lui soit offert dans les limites géographiques prévues par la loi. Il en va de même
      lorsque le locataire a à sa charge une personne de plus de soixante-cinq ans vivant habituellement dans le
      logement, sous conditions de ressources. Cette protection ne s'applique pas lorsque le bailleur est une
      personne physique âgée de plus de soixante-cinq ans ou si ses ressources annuelles sont inférieures au même
      plafond. L'âge est apprécié à la date d'échéance du contrat, les ressources à la date de notification du
      congé.</p>
      ${
        meuble
          ? ""
          : `<p>La même règle vaut à l'égard de tout bénéficiaire de l'allocation mentionnée à l'article L. 544-1
             du code de la sécurité sociale dont les ressources annuelles sont inférieures au même plafond.</p>`
      }
      ${
        // Lot T1 (R02-A8) : la sanction du congé frauduleux, dans les mots du texte (article 15 V ; 25-8 III en meublé).
        motif === "motif_legitime"
          ? ""
          : `<p>Le fait pour un bailleur de délivrer un congé justifié frauduleusement par sa décision de reprendre
             ou de vendre le logement est puni d'une amende pénale dont le montant ne peut être supérieur à
             6 000 € pour une personne physique et à 30 000 € pour une personne morale. Le locataire est recevable
             dans sa constitution de partie civile et la demande de réparation de son préjudice.</p>`
      }
    </div>
    ${
      noticeJointe
        ? `${section("Pièce jointe")}
           <p>Notice d'information relative aux obligations du bailleur et aux voies de recours et d'indemnisation
           du locataire, jointe au présent congé (arrêté du 13 décembre 2017).</p>`
        : ""
    }
    ${faitA(f, exp.ville, new Date().toISOString())}
    ${blocSignatureEmetteur(exp.nom, await signatureOrganisation(supabase, orgId))}
  `;

  const document = assemblerPage({
    f,
    titreDocument: "Congé délivré par le bailleur",
    nomPied: "Congé du bailleur",
    reference,
    // Phase 3, lot 51 (W21) : à la taille commune, « BAILLEUR » passait seul sur une seconde ligne ; même réglage du titre que
    // les documents du catalogue de la même famille (attestation, accusé de réception, bordereau des clés).
    corps: `<style>h1{font-size:19pt;letter-spacing:.2em}</style>${corps}`,
  });

  return {
    document,
    titreGed: `Congé du bailleur — ${LIBELLES_MOTIF[motif]}`,
    nomFichier: `conge-bailleur-${motif}`,
    liens: [{ entite: "bail", entiteId: ctx.bail.id }, ...liensLocataires(ctx)],
  };
}
