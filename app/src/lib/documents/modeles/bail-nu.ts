import { presentationArchivee, typographieArchivee, type OptionsContrat } from "./communs";
// 01 — Contrat de location, logement nu, résidence principale.
// Fidèle à l'épreuve (sections I → XII, contrat type du décret 2015-587).
// Blocs conditionnels pilotés par les données réelles (indivision, zone
// tendue, copropriété, colocataires, garants…) ; tout champ contractuel
// absent reste en libellé d'épreuve et remonte dans la liste des manquants.
// Les champs facultatifs au sens du contrat type (téléphone, IBAN) et les
// clauses vides s'impriment « — » ou « Néant. » sans créer de manquant.
// Phase 3, lot 50 : l'IBAN n'est facultatif que si le paiement ne se fait pas
// par virement ; par virement, il est à renseigner (coordonneesBancaires).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  echapper,
  enTete,
  eur,
  facultatif,
  montantEnLettres,
  ouNeant,
  section,
  sousSection,
  titre,
  typographie,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  adressePersonne,
  adresseLogement,
  nomPersonne,
  referenceCourte,
  type ContexteBail,
  type PersonneDocument,
  liensLocataires,
  coordonneesBancaires,
} from "./communs";
import { periodeConstruction, mentionsEnergie, destinationServitude, clauseResolutoire, honorairesLocation, encadrementLocation, fixationLoyer, dateConclusion, dureeReduiteSansObjet, travauxDepuisDernierContrat, premiereEcheanceLocation, mandataireLocation, reconductionEtConges, clauseSolidarite, refusEpouxPacs, REFUS_BAIL_DUREE_REDUITE } from "./mentions-location";
import { designationIndividuelle } from "./designation-individuelle";
import type { Assemblage } from "./index";
import { dureeBailNuAnnees } from "@/lib/qualite-bailleur";
import { mentionCadreCautionBail } from "@/lib/textes-signature-actes";



// Textes officiels, lot T2 (R08-A3) : ce calcul ne sert plus qu'à relire un bail déjà préparé pour la signature (typographie
// archivée). Un nouveau contrat imprime le montant d'une période complète, puis le premier terme calculé comme l'appel de
// loyer (premiereEcheanceLocation, mentions-location.ts).
// Montant total dû à la première échéance : loyer + charges, proratisés quand
// le bail ne prend pas effet un 1er du mois (jours restants jusqu'à la fin du
// mois inclus / jours du mois). Sans loyer, charges ou date de début, le
// calcul est impossible : le libellé d'épreuve reste et compte manquant.
function premiereEcheance(f: Fusion, bail: ContexteBail["bail"]): string {
  const libelle = "loyer + charges, montant au prorata";
  if (bail.loyer_hc === null || bail.charges === null || !bail.date_debut) {
    return f.champ(null, libelle);
  }
  const total = Number(bail.loyer_hc) + Number(bail.charges);
  const debut = new Date(`${bail.date_debut.slice(0, 10)}T12:00:00`);
  const jour = debut.getDate();
  if (jour === 1) return f.montant(total, libelle);
  const joursDuMois = new Date(debut.getFullYear(), debut.getMonth() + 1, 0).getDate();
  const prorata = Math.round(((joursDuMois - jour + 1) / joursDuMois) * total * 100) / 100;
  return `${f.montant(prorata, libelle)} (premier mois au prorata)`;
}

function blocLocataire(f: Fusion, p: PersonneDocument, adresseElectroniqueObligatoire: boolean): string {
  return `<p>${f.champ(nomPersonne(p), "nom et prénom(s)")}, né(e) le ${f.date(p.date_naissance, "Date de naissance du locataire")}
  à ${f.champ(p.commune_naissance, "commune de naissance")}, demeurant ${f.champ(adressePersonne(p), "adresse actuelle")}.<br/>
  Adresse électronique : ${adresseElectroniqueObligatoire ? f.champ(p.email, "adresse électronique") : facultatif(p.email)} — Numéro de téléphone portable :
  ${facultatif(p.telephone)}.</p>`;
}

// `presentationAncienne` : la présentation d'avant #331, toujours avec la mise en forme d'alors. `typographieArchivee` : la
// présentation d'aujourd'hui avec la mise en forme d'avant la version g8. Les deux ne servent qu'à recalculer l'empreinte
// d'un circuit de signature déjà préparé (voir communs.ts).
export function construireBailNu(ctx: ContexteBail, options: { dpeClasse: string | null; f: Fusion; presentationAncienne?: boolean; typographieArchivee?: boolean }) {
  const f = options.f;
  const t = typographie(options.presentationAncienne || options.typographieArchivee);
  const adresseElectroniqueObligatoire = t.archivee || Boolean(ctx.bail.chambre_id);
  const exp = expediteur(options.presentationAncienne ? { organisation: ctx.organisation } : ctx);
  const referenceBail = referenceCourte("BAIL", ctx.bail.id);
  const bailleurPrincipal = ctx.bailleurs[0] ?? null;
  const indivision = ctx.bailleurs.length > 1;
  const individuel = Boolean(ctx.chambre);
  // Case « mariés ou pacsés » (décision du 24/11/2026) : une location consentie exclusivement à deux époux ou partenaires de
  // PACS n'est pas une colocation (article 8-1, I) : le contrat porte alors le titre, le pied et les cadres de signature d'un
  // contrat de location, et non « colocation » (la clause de solidarité le dit : clauseSolidarite). Le rendu archivé, qui
  // recalcule l'empreinte d'un circuit déjà préparé, n'en tient pas compte.
  const epouxPacs = Boolean(ctx.bail.locataires_epoux_pacses) && !(options.presentationAncienne || options.typographieArchivee);
  const colocation = ctx.bail.type === "colocation" && !individuel && !epouxPacs;
  const plusieursLocataires = ctx.locataires.length > 1;
  const copro = ctx.bien.copropriete;
  const depot = ctx.bail.depot_garantie === null ? null : Number(ctx.bail.depot_garantie);
  const chargesMode =
    ctx.bail.charges_mode === "forfait"
      ? "forfait de charges"
      : "provisions sur charges avec régularisation annuelle";

  // Reprise du lot 48 (U04, U06) : le bloc du bailleur passe par `f.bailleur` (même texte, empreinte inchangée) pour que ses
  // manques mènent à l'écran du détenteur du lot, et non à la fiche du locataire ou du bail.
  const corps = `
    ${enTete(f, { ...exp, emailFacultatif: !adresseElectroniqueObligatoire && exp.emetteur === "detenteurs" }, { libelle: "Contrat", reference: referenceBail, etabliLe: new Date().toISOString() })}
    ${titre(individuel ? "Contrat individuel de colocation" : colocation ? "Contrat commun de colocation" : "Contrat de location", "Logement nu · résidence principale", [
      "Soumis au titre Ier de la loi n° 89-462 du 6 juillet 1989",
      individuel ? "Contrat indépendant — article 8-1 de la loi du 6 juillet 1989" : "Contrat type — annexe 1 du décret n° 2015-587 du 29 mai 2015",
    ])}
    <p>Les parties déclarent avoir pris connaissance de la notice d'information relative aux droits
    et obligations des locataires et des bailleurs, annexée au présent contrat et en faisant partie
    intégrante.</p>

    ${section("I — Désignation des parties")}
    <p${t.classe("annonce")}>Le présent contrat est conclu entre les soussignés :</p>
    ${sousSection("Le bailleur")}
    ${f.bailleur(() => `<p>Nom et prénom(s) ou dénomination : ${f.champ(nomPersonne(bailleurPrincipal), "nom et prénom(s), ou dénomination")}
    — Qualité : ${f.champ(bailleurPrincipal?.qualite, "personne physique, indivision, SCI familiale, SCI, personne morale")}<br/>
    ${!options.presentationAncienne && bailleurPrincipal?.siren ? `SIREN : ${echapper(bailleurPrincipal.siren)}<br/>` : ""}Domicile ou siège social : ${f.champ(adressePersonne(bailleurPrincipal), "domicile ou siège social")}<br/>
    Adresse électronique : ${adresseElectroniqueObligatoire ? f.champ(bailleurPrincipal?.email, "adresse électronique") : facultatif(bailleurPrincipal?.email)} — Numéro de
    téléphone portable : ${facultatif(bailleurPrincipal?.telephone)}</p>`)}
    ${
      indivision
        ? `<p>Le logement étant détenu en indivision, sont également parties au présent contrat :
           ${ctx.bailleurs
             .slice(1)
             .map((b) => `${echapper(nomPersonne(b) ?? "")}${!options.presentationAncienne && b.siren ? ` · SIREN ${echapper(b.siren)}` : ""} (${b.quote_part.toLocaleString("fr-FR")}${t.pourcent})`)
             .join(" ; ")}.</p>`
        : ""
    }
    ${mandataireLocation(ctx, f, exp.adresse, t)}
    ${sousSection(plusieursLocataires ? "Les locataires" : "Le locataire")}
    ${
      ctx.locataires.length > 0
        ? ctx.locataires.map((l) => blocLocataire(f, l, adresseElectroniqueObligatoire)).join("")
        : blocLocataire(f, {
            id: "",
            nom: "",
            prenom: null,
            email: null,
            telephone: null,
            date_naissance: null,
            commune_naissance: null,
            address_line1: null,
            postal_code: null,
            city: null,
            qualite: null,
          }, adresseElectroniqueObligatoire)
    }
    <p>Ci-après dénommé${plusieursLocataires ? "s" : ""} « le locataire ».</p>

    ${section("II — Objet du contrat")}
    <p${t.classe("annonce")}>${individuel ? 'Le présent contrat porte exclusivement sur la chambre privative et le droit d’usage des espaces partagés désignés ci-dessous. Il ne loue pas le logement entier.' : "Le présent contrat a pour objet la location d'un logement, ainsi déterminé :"}</p>
    ${designationIndividuelle(ctx, f, t)}
    ${sousSection("A. Consistance du logement")}
    <p>Localisation du logement : ${f.champ(adresseLogement(ctx.lot, ctx.bien, t.archivee), "adresse complète, étage, porte")}<br/>
    Identifiant fiscal du logement : ${f.champ(ctx.lot.identifiant_fiscal, "le cas échéant", "identifiant fiscal du logement")}<br/>
    Type d'habitat : ${f.champ(
      ctx.bien.type === "appartement" || ctx.bien.type === "immeuble" ? "immeuble collectif" : "individuel",
      "immeuble collectif ou individuel"
    )} — Régime juridique de l'immeuble : ${f.champ(copro ? "copropriété" : "monopropriété", "monopropriété ou copropriété")}${
      // Phase 3, lot 50 (W05) : « Période de construction » sur sa propre ligne. En fin d'une ligne trop longue, le libellé
      // restait en bas de page et sa valeur passait seule à la page suivante. Typographie archivée : rendu d'avant.
      t.archivee ? " —\n    " : "<br/>\n    "}Période de construction : ${f.champ(periodeConstruction(ctx.bien.annee_construction), "avant 1949, 1949-1974, 1975-1989, 1990-2005, depuis 2006")}<br/>
    Surface habitable ${individuel ? "du logement entier" : ""} : ${f.champ(
      ctx.lot.surface_m2 !== null ? `${t.nombre(ctx.lot.surface_m2)} m²` : null,
      "en m²"
    )} — Nombre de pièces principales : ${f.champ(ctx.lot.pieces, "nombre")}<br/>
    Autres parties du logement : ${f.champ(ctx.lot.description, "cave, grenier, balcon, terrasse, jardin…", "autres parties du logement")}<br/>
    Éléments d'équipement du logement : ${f.champ(ctx.lot.equipements.join(", "), "cuisine équipée, sanitaires, placards…", "équipements du logement")}<br/>
    Modalité de production de chauffage : ${f.champ(ctx.lot.chauffage, "individuel ou collectif, énergie", "chauffage du logement")} — Modalité de
    production d'eau chaude sanitaire : ${f.champ(ctx.lot.eau_chaude, "individuel ou collectif, énergie", "eau chaude du logement")}</p>
    ${mentionsEnergie(ctx, options.dpeClasse, f, t)}
    ${sousSection("B. Destination des locaux")}
    <p>Le logement est loué à usage exclusif d'habitation, à titre de résidence principale du locataire.</p>
    ${destinationServitude(ctx, f)}
    ${sousSection("C. Désignation des locaux et équipements accessoires")}
    <p>Locaux et équipements à usage privatif : ${ctx.chambre ? f.champ([ctx.chambre.nom, ctx.chambre.equipements].filter(Boolean).join(" — "), "chambre et équipements privatifs") : f.champ(ctx.lot.locaux_privatifs, "cave, parking, garage… avec numéro", "locaux privatifs du logement")}<br/>
    Locaux, parties, équipements et accessoires à usage commun : ${ctx.chambre ? f.champ(ctx.chambre.espaces_partages, "espaces partagés autorisés par ce contrat") : f.champ(ctx.bien.parties_communes, "hall, ascenseur, local vélos…")}<br/>
    Équipements d'accès aux technologies de l'information et de la communication : ${f.champ(ctx.bien.acces_tic, "fibre, câble, TNT…")}</p>
    ${
      copro
        ? `<p>L'immeuble étant soumis au statut de la copropriété, le locataire est tenu de respecter le
           règlement de copropriété, dont les extraits relatifs à la destination de l'immeuble, à la
           jouissance et à l'usage des parties privatives et communes${
             // Lot T2 (R05-A1) : les extraits précisent aussi la quote-part du lot (article 3 de la loi, annexe du contrat type).
             t.archivee ? "" : ", et précisant la quote-part afférente au lot loué dans chacune des catégories de charges,"} lui sont remis en annexe.</p>`
        : ""
    }

    ${section("III — Date de prise d'effet et durée du contrat")}
    ${dateConclusion(ctx, f)}
    <p>Date de prise d'effet : ${f.date(ctx.bail.date_debut, "Date d’entrée du bail")}.<br/>
    Durée du contrat : ${f.champ(
      // Art. 10 et 13 : 6 ans dès qu'un bailleur est une personne morale autre
      // qu'une SCI familiale, 3 ans sinon — la règle de la base (audit 29/09).
      dureeBailNuAnnees(ctx.bailleurs.map((b) => b.qualite)) === 6 ? "six ans" : "trois ans",
      "durée applicable au régime du bail"
    )}${t.archivee ? ", reconduite tacitement aux mêmes conditions à défaut de congé donné dans les formes et délais légaux" : ""}.</p>${/* Lot T2 (R08-A5) : les phrases fixes de la rubrique III du contrat type remplacent l'ancienne fin de phrase. */
      t.archivee ? "" : reconductionEtConges(ctx, false)}
    ${
      // Lot T2 (R17-A2) : cette branche ne sert plus qu'au recalcul de l'empreinte d'un bail déjà préparé. Un nouveau contrat
      // dont le champ est rempli est refusé avant d'arriver ici (refusBailDureeReduite).
      ctx.bail.duree_reduite_evenement
        ? `<p class="mentions">Un contrat d'une durée réduite (au moins un an) n'est possible que si un événement
           précis justifie la reprise du logement par le bailleur : ${f.champ(ctx.bail.duree_reduite_evenement, "événement précis justifiant la durée réduite")}${t.point(ctx.bail.duree_reduite_evenement)}</p>`
        : dureeReduiteSansObjet(null, t)
    }

    ${section("IV — Conditions financières")}
    ${sousSection("A. Loyer")}
    <p>Montant du loyer mensuel hors charges : ${f.montant(ctx.bail.loyer_hc, "montant mensuel")}.<br/>
    Modalité de fixation du loyer : ${f.champ(fixationLoyer(ctx.bail.fixation_loyer), "libre, plafonnement, réévaluation après travaux…")}.</p>
    ${encadrementLocation(ctx, f, t)}
    ${
      ctx.bail.revision_irl
        ? `<p>Le loyer est révisé chaque année à la date anniversaire du contrat, dans la limite de la
           variation de l'indice de référence des loyers (IRL). Trimestre de référence :
           ${f.champ(ctx.bail.irl_trimestre, "ex. 2e trimestre 2026")} — valeur de l'indice :
           ${f.champ(
             ctx.bail.irl_valeur !== null ? Number(ctx.bail.irl_valeur).toLocaleString("fr-FR") : null,
             "valeur de l'indice"
           )}.</p>`
        : `<p>Le contrat ne prévoit pas de clause de révision annuelle du loyer.</p>`
    }
    ${options.dpeClasse === "F" || options.dpeClasse === "G"
      ? `<div class="encadre"><p>Le logement est classé ${options.dpeClasse} : la révision et la majoration
         du loyer sont bloquées tant que cette classe n'est pas améliorée (loi Climat et résilience).</p></div>`
      : ""}
    ${sousSection("B. Charges récupérables")}
    <p>Modalité de règlement : ${f.champ(chargesMode, "provisions avec régularisation, forfait, réel")} —
    Montant mensuel : ${f.montant(ctx.bail.charges, "montant mensuel")}.</p>
    ${sousSection("C. Modalités de paiement")}
    <p>Périodicité : ${f.champ("mensuelle", "mensuelle, trimestrielle…")} — paiement ${f.champ(
      ctx.bail.paiement_echeance === "echu" ? "à terme échu" : "à échoir",
      "à échoir ou échu"
    )}
    le ${f.champ(t.jour(ctx.bail.jour_echeance), "jour du mois")} de chaque mois.<br/>
    Lieu de paiement : ${f.champ(ctx.bail.lieu_paiement, "domicile du bailleur, virement…")} — Coordonnées bancaires :
    ${/* Phase 3, lot 50 (W01, W02, W06) : le contrat qui fixe un paiement par virement donne le compte où verser, comme l'avis
      d'échéance (C50, C72) ; inconnu, l'IBAN du profil de l'espace est à renseigner. Un bail déjà préparé pour la signature
      garde son rendu (typographie archivée : « — »). */
      t.archivee ? facultatif(ctx.organisation.iban) : coordonneesBancaires(f, ctx.bail.lieu_paiement, ctx.organisation.iban)}.<br/>
    ${t.archivee ? `Montant total dû à la première échéance : ${premiereEcheance(f, ctx.bail)}.` : premiereEcheanceLocation(ctx, f)}</p>

    ${section("V — Travaux")}
    <p>Travaux d'amélioration ou de mise en conformité effectués depuis la fin du dernier contrat :
    ${t.archivee ? `${ouNeant(ctx.bail.travaux_recents)} — montant : ${
      ctx.bail.travaux_recents ? f.montant(ctx.bail.travaux_recents_montant, "montant") : "—"
    }.` : travauxDepuisDernierContrat(ctx, f)}<br/>
    Travaux que le locataire est autorisé à réaliser et contreparties : ${ouNeant(ctx.bail.travaux_locataire)}</p>

    ${section("VI — Garanties")}
    <p>Dépôt de garantie : ${
      depot !== null
        ? `<b>${eur(depot)}</b> (${montantEnLettres(depot)})`
        : f.champ(null, "montant convenu, dans la limite légale applicable")
    }, soit au plus un mois de loyer hors charges.</p>

    ${plusieursLocataires ? `${section("VII — Clause de solidarité")}
    ${clauseSolidarite(ctx, t)}` : ""}

    ${section(`${plusieursLocataires ? "VIII" : "VII"} — Clause résolutoire`)}
    ${clauseResolutoire(ctx, t)}

    ${section(`${plusieursLocataires ? "IX" : "VIII"} — Honoraires de location`)}
    ${honorairesLocation(ctx, f, t)}

    ${section(`${plusieursLocataires ? "X" : "IX"} — Autres conditions particulières`)}
    <p>${ouNeant(ctx.bail.clauses_particulieres)}</p>

    ${/* Reprises du lot T2 (T2R-2) : annexes et signatures forment un ensemble qui ne se coupe pas — plus de page ne
         portant que les signatures. Rien n'est ajouté au rendu archivé (empreinte d'un bail déjà préparé). */ ""}${t.finEnsemble[0]}${section(`${plusieursLocataires ? "XI" : "X"} — Annexes`)}
    <p${t.classe("annonce")}>Sont annexées et jointes au contrat les pièces suivantes :</p>
    <p class="mentions"${t.insecable}>☐ Le dossier de diagnostic technique (DPE, ERP, et selon l'ancienneté du
    logement : plomb, amiante, électricité, gaz)<br/>
    ☐ La notice d'information relative aux droits et obligations des locataires et des bailleurs<br/>
    ☐ L'état des lieux d'entrée<br/>
    ${copro ? `☐ Les extraits du règlement de copropriété${t.archivee ? "" : " (destination de l'immeuble, jouissance et usage des parties privatives et communes, quote-part afférente au lot loué dans chacune des catégories de charges)"}<br/>` : ""}
    ${ctx.garants.length > 0 ? "☐ L'acte de cautionnement<br/>" : ""}
    ☐ Le cas échéant, l'attestation d'assurance contre les risques locatifs<br/>
    ☐ Le cas échéant, la grille de vétusté applicable</p>

    <div class="bloc-signataires">
    ${section(`${plusieursLocataires ? "XII" : "XI"} — Date et signatures`)}
    <p${t.classe("fait-a")}>Fait à ${f.champ(exp.ville, "commune")}, le <span class="fusion">date effective à compléter lors de la signature</span>, en autant
    d'exemplaires originaux que de parties.</p>
    <div class="signatures">
      ${options.presentationAncienne || !indivision
        ? cadreSignature("Le bailleur", f.champ(nomPersonne(bailleurPrincipal), "nom et prénom(s), ou dénomination"))
        : ctx.bailleurs.map((p, i) => cadreSignature(`Bailleur ${i + 1}`, f.champ(nomPersonne(p), "nom et prénom(s), ou dénomination"))).join("")}
      ${colocation || (epouxPacs && plusieursLocataires) ? ctx.locataires.map((l, i) => cadreSignature(`${colocation ? "Colocataire" : "Locataire"} ${i + 1}`, f.champ(nomPersonne(l), `nom du colocataire ${i + 1}`))).join("") : cadreSignature(
        plusieursLocataires ? "Les locataires" : "Le locataire",
        ctx.locataires.map((l) => echapper(nomPersonne(l) ?? "")).join("<br/>") ||
          f.champ(null, "nom et prénom(s) du ou des locataires")
      )}
      ${ctx.garants.length > 0 ? cadreSignature("La caution", `${ctx.garants.map((g) => echapper(nomPersonne(g) ?? "")).join("<br/>")}<br/>${mentionCadreCautionBail(ctx.garants.length)}`) : ""}
    </div>
    </div>${t.finEnsemble[1]}
  `;

  return assemblerPage({
    f,
    titreDocument: individuel ? "Colocation — contrat individuel nu" : colocation ? "Colocation — bail commun nu" : "Contrat de location — logement nu",
    nomPied: individuel ? "Colocation — contrat individuel nu" : colocation ? "Colocation — bail commun nu" : "Contrat de location — logement nu",
    reference: referenceBail,
    corps,
    feuilleArchivee: t.archivee,
  });
}

/**
 * Textes officiels, lot T2 (R17-A2) : pas de contrat nu quand un événement de durée réduite est saisi (voir
 * REFUS_BAIL_DUREE_REDUITE). Le recalcul de l'empreinte d'un bail DÉJÀ préparé (formats archivés) n'est pas refusé : il doit
 * rendre le contrat tel qu'il a été signé.
 */
export function refusBailDureeReduite(ctx: ContexteBail, format: OptionsContrat): { erreur: string } | null {
  if (format[presentationArchivee] || format[typographieArchivee]) return null;
  return ctx.bail.duree_reduite_evenement?.trim() ? { erreur: REFUS_BAIL_DUREE_REDUITE } : null;
}

export async function assemblerBailNu(
  supabase: SupabaseClient,
  orgId: string,
  bailId: string,
  format: OptionsContrat = {}
): Promise<Assemblage> {
  const ctx = await chargerContexteBail(supabase, orgId, bailId);
  if ("erreur" in ctx) return ctx;
  if (ctx.bail.type !== "nu") {
    return { erreur: "Choisissez le modèle correspondant au bail : nu, meublé ou colocation." };
  }
  if (ctx.bail.etat !== "brouillon") return { erreur: "Le contrat initial se prépare sur un brouillon. Pour un bail déjà engagé, utilisez un avenant." };
  const refus = refusBailDureeReduite(ctx, format) ?? refusEpouxPacs(ctx, Boolean(format[presentationArchivee] || format[typographieArchivee]));
  if (refus) return refus;
  // Phase 3, lot 46 (reprise, T21) : sans locataire principal, le contrat est INCOMPLET, plus refusé. Le catalogue proposait le
  // brouillon puis répondait « Renseignez d'abord le locataire principal du bail », sans lien ; « nom et prénom(s) » (le libellé
  // du contrôle du brouillon et du bloc du locataire) rejoint la liste « À renseigner », qui mène à la fiche du bail. Le PDF reste
  // bloqué tant qu'il manque (refusDocumentIncomplet) : aucun contrat n'est produit sans son locataire.
  const f = new Fusion();
  if (!ctx.bail.locataire_principal) f.champ(null, "nom et prénom(s)");

  const { data: dpe, error: erreurDpe } = await supabase
    .from("diagnostics")
    .select("classe_dpe")
    .eq("lot_id", ctx.lot.id)
    .eq("type", "dpe")
    .is("archived_at", null)
    .order("date_realisation", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erreurDpe) return { erreur: "Le diagnostic du logement n’a pas pu être chargé. Réessayez avant de générer le contrat." };
  const document = construireBailNu(ctx, { presentationAncienne: format[presentationArchivee], typographieArchivee: format[typographieArchivee], dpeClasse: dpe?.classe_dpe ?? null, f });

  return {
    document,
    titreGed: "Bail nu (généré, à faire signer)",
    nomFichier: `bail-nu-${referenceCourte("BAIL", ctx.bail.id).toLowerCase()}`,
    liens: [
      { entite: "bail", entiteId: ctx.bail.id },
      { entite: "lot", entiteId: ctx.lot.id },
      ...liensLocataires(ctx),
    ],
  };
}
