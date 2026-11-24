// Sources vérifiées le 14/09/2026 : décret 2015-587, annexes 1 et 2 ;
// décret 2026-596 (contrats conclus/renouvelés à partir du 01/10/2026) ;
// arrêté du 13/11/2025 (honoraires 2026). Données absentes = manquants.
//
// Textes officiels, lot T2 (25/11/2026) : textes relus dans le recueil fourni par le dirigeant (décret n° 2015-587, annexes 1
// et 2, version en vigueur depuis le 01/10/2026 ; source et version déclarées, non recontrôlées). Les passages fixes du
// contrat type sont repris mot pour mot (contrat-type-textes.ts). Chaque fonction qui change garde, sous `t.archivee`,
// la phrase qu'imprimait un bail déjà préparé pour la signature : l'activation d'un bail signé recalcule son empreinte.
import { Fusion, echapper, eur, ouNeant, sousSection, TYPOGRAPHIE, type Typographie } from '../gabarit';
import { plafondsHonoraires } from '@/lib/mentions-contrat';
import { dureeBailNuAnnees } from '@/lib/qualite-bailleur';
import type { ContexteBail } from './communs';
import { ARTICLE_5_I_ALINEAS_1_A_3, CLAUSE_RESOLUTOIRE_CONTRAT_TYPE, RAPPEL_DECENCE_METHODE_DPE } from './contrat-type-textes';

export function periodeConstruction(annee: number | null): string | null {
  if (!annee) return null;
  if (annee < 1949) return 'avant 1949';
  if (annee <= 1974) return '1949-1974';
  if (annee <= 1989) return '1975-1989';
  if (annee <= 2005) return '1990-2005';
  return 'depuis 2006';
}

export function mentionsEnergie(ctx: ContexteBail, classe: string | null, f: Fusion, t: Typographie = TYPOGRAPHIE): string {
  // Lot T2 (R08-A7) : la dernière phrase du rappel est celle du contrat type ; l'ancienne (« … doit également respecter le
  // seuil applicable ») n'y figure pas.
  const b = ctx.bail;
  return `<p>Classe de performance du logement (DPE) : <b>${f.champ(classe, 'classe DPE du logement')}</b>.</p>
    <p class="mentions">Rappel des niveaux minimaux de performance d’un logement décent :
    en France métropolitaine, classe F à compter du 1er janvier 2025, E à compter du 1er janvier 2028,
    D à compter du 1er janvier 2034. En Guadeloupe, Martinique, Guyane, à La Réunion et à Mayotte :
    classe F à compter du 1er janvier 2028, E à compter du 1er janvier 2031.
    ${t.archivee ? 'La consommation d’énergie finale doit également respecter le seuil applicable.' : echapper(RAPPEL_DECENCE_METHODE_DPE)} Le dossier de diagnostic technique est annexé au contrat.</p>
    ${sousSection('Estimation des dépenses d’énergie')}
    <p>Pour un usage standard, dépenses annuelles estimées entre ${f.montant(b.dpe_depenses_min, 'dépenses annuelles minimales du DPE')}
    et ${f.montant(b.dpe_depenses_max, 'dépenses annuelles maximales du DPE')}.
    Année(s) de référence des prix de l’énergie : ${f.champ(b.dpe_annees_reference, 'année(s) des prix de l’énergie du DPE')}.</p>`;
}

export function destinationServitude(ctx: ContexteBail, f: Fusion): string {
  if (ctx.bail.servitude_residence_principale === true)
    return '<p>Servitude de résidence principale : le logement est soumis à l’article L. 151-14-1 du code de l’urbanisme. Son occupation doit être exclusivement à titre de résidence principale au sens de l’article 2 de la loi du 6 juillet 1989.</p>';
  if (ctx.bail.servitude_residence_principale === false) return '';
  return `<p>Servitude de résidence principale applicable au logement : ${f.champ(null, 'existence de la servitude de résidence principale à vérifier')}.</p>`;
}

export function clauseResolutoire(ctx: ContexteBail, t: Typographie = TYPOGRAPHIE): string {
  const b = ctx.bail;
  // Les nouveaux contrats sont établis pour la signature actuelle ou prévue.
  // Les anciens contrats signés restent dans la GED et ne sont pas réécrits.
  // Lot T2 (R08-A4) : les deux phrases fixes du contrat type, mot pour mot. L'ancienne rédaction (autres mots, et un renvoi
  // à l'article 24 que le contrat type ne porte pas) ne sert plus qu'au recalcul de l'empreinte d'un bail déjà préparé.
  const fixe = t.archivee ? null : `<p>${CLAUSE_RESOLUTOIRE_CONTRAT_TYPE.map(echapper).join('<br/>')}</p>`;
  return `${fixe ?? `<p>Le défaut de paiement du loyer ou des charges aux échéances convenues, ou le non-versement du dépôt de garantie,
    entraîne la résiliation de plein droit du contrat. Cette clause ne prend effet que six semaines après
    un commandement de payer demeuré infructueux, sous réserve des dispositions de l’article 24 de la loi du 6 juillet 1989.</p>`}
    ${b.clause_resolutoire_assurance !== false ? '<p>Les parties conviennent également de la résiliation de plein droit pour défaut d’assurance des risques locatifs. Cette clause ne produit effet qu’un mois après un commandement demeuré infructueux.</p>' : ''}
    ${b.clause_resolutoire_troubles !== false ? '<p>Les parties conviennent de la résiliation de plein droit en cas de troubles de voisinage contraires à l’usage paisible des locaux, constatés par une décision de justice passée en force de chose jugée.</p>' : ''}
    ${b.clause_resolutoire_servitude && b.servitude_residence_principale === true ? '<p>Les parties conviennent de la résiliation de plein droit pour non-respect de la servitude de résidence principale applicable au logement. Cette clause ne produit effet qu’à l’expiration du délai de mise en demeure fixé par le maire conformément au II de l’article L. 481-4 du code de l’urbanisme.</p>' : ''}`;
}

export function honorairesLocation(ctx: ContexteBail, f: Fusion, t: Typographie = TYPOGRAPHIE): string {
  if (ctx.organisation.type !== 'agence') return '<p>Sans objet — location conclue sans intermédiaire.</p>';
  const b = ctx.bail;
  const tarifs = plafondsHonoraires(b.date_conclusion_prevue, b.zone_honoraires);
  // Lot T2 (R08-A2) : le contrat type RAPPELLE les trois premiers alinéas du I de l'article 5 (il ne les résume pas), donne
  // les deux plafonds, puis le détail par partie. Les libellés des montants (liste « À renseigner ») ne changent pas.
  // Non repris, faute de donnée dans Gerimmo : le « détail des prestations effectivement réalisées » et les « autres
  // prestations » à la charge du bailleur ; l'écran du bail invite à les écrire dans les conditions particulières.
  if (!t.archivee) return `<p>Il est rappelé les dispositions du I de l’article 5 de la loi du 6 juillet 1989, alinéas 1 à 3 :</p>
    <p class="mentions">${ARTICLE_5_I_ALINEAS_1_A_3.map(a => `« ${echapper(a)} »`).join('<br/>')}</p>
    <p>Plafonds applicables :<br/>
    — montant du plafond des honoraires imputables aux locataires en matière de prestation de visite du preneur, de constitution de son dossier et de rédaction de bail : ${f.montant(tarifs.location, 'plafond de location selon la date et la zone')} TTC par m² de surface habitable ;<br/>
    — montant du plafond des honoraires imputables aux locataires en matière d’établissement de l’état des lieux d’entrée : ${f.montant(tarifs.edl, 'plafond état des lieux selon la date')} TTC par m² de surface habitable.</p>
    <p>Honoraires à la charge du bailleur :<br/>
    — prestations de visite du preneur, de constitution de son dossier et de rédaction de bail : ${f.montant(b.honoraires_bailleur, 'honoraires visite, dossier et bail — bailleur')} TTC, dus à la signature du bail ;<br/>
    — prestation de réalisation de l’état des lieux d’entrée : ${f.montant(b.honoraires_edl_bailleur, 'honoraires état des lieux — bailleur')} TTC, dus à compter de la réalisation de la prestation.</p>
    <p>Honoraires à la charge du locataire :<br/>
    — prestations de visite du preneur, de constitution de son dossier et de rédaction de bail : ${f.montant(b.honoraires_locataire, 'honoraires visite, dossier et bail — locataire')} TTC, dus à la signature du bail ;<br/>
    — prestation de réalisation de l’état des lieux d’entrée : ${f.montant(b.honoraires_edl_locataire, 'honoraires état des lieux — locataire')} TTC, dus à compter de la réalisation de la prestation.</p>`;
  return `<p>Conformément à l’article 5-I de la loi du 6 juillet 1989, seuls les frais de visite, de dossier, de rédaction du bail
    et d’état des lieux d’entrée peuvent être partagés avec le locataire. Pour chaque catégorie, sa part ne peut dépasser
    celle du bailleur ni le plafond réglementaire. Les autres prestations de mise en location restent à la charge du bailleur.</p>
    <p>Visite, constitution du dossier et rédaction du bail : part du bailleur ${f.montant(b.honoraires_bailleur, 'honoraires visite, dossier et bail — bailleur')}
    TTC ; part du locataire ${f.montant(b.honoraires_locataire, 'honoraires visite, dossier et bail — locataire')} TTC.
    Plafond par m² habitable pour le locataire : ${f.montant(tarifs.location, 'plafond de location selon la date et la zone')} TTC.
    Ces honoraires sont dus à la signature du bail.</p>
    <p>État des lieux d’entrée : part du bailleur ${f.montant(b.honoraires_edl_bailleur, 'honoraires état des lieux — bailleur')} TTC ;
    part du locataire ${f.montant(b.honoraires_edl_locataire, 'honoraires état des lieux — locataire')} TTC.
    Plafond par m² habitable pour le locataire : ${f.montant(tarifs.edl, 'plafond état des lieux selon la date')} TTC.
    Ces honoraires sont dus à la réalisation de l’état des lieux d’entrée.</p>`;
}

export function encadrementLocation(ctx: ContexteBail, f: Fusion, t: Typographie = TYPOGRAPHIE): string {
  const b = ctx.bail;
  const reference = b.encadrement_loyer === true
    ? `<p>Loyers de référence imposés par arrêté local : oui. Loyer de référence : ${f.montant(b.loyer_reference, 'loyer de référence €/m²')} par m² ;
      loyer de référence majoré : ${f.montant(b.loyer_reference_majore, 'loyer de référence majoré €/m²')} par m².<br/>
      ${b.complement_loyer == null ? 'Complément de loyer : néant.' : `Complément de loyer : ${f.montant(b.complement_loyer, 'complément de loyer')}, justifié par ${f.champ(b.complement_justification, 'justification du complément de loyer')}${t.point(b.complement_justification)}`}</p>`
    : `<p>Loyers de référence imposés par arrêté local : ${b.encadrement_loyer === false ? 'non' : f.champ(null, 'application des loyers de référence à vérifier')}.</p>`;
  const situation = b.precedente_location ?? (b.dernier_loyer != null ? 'recente' : null);
  let historique: string;
  if (situation === 'premiere') historique = '<p>Première location : aucun précédent loyer.</p>';
  else if (situation === 'ancienne') historique = '<p>Le précédent locataire a quitté le logement depuis au moins dix-huit mois.</p>';
  else if (situation === 'recente') {
    const revise = b.precedent_loyer_revise ?? (b.dernier_loyer_revision ? true : null);
    historique = `<p>Précédent locataire parti depuis moins de dix-huit mois : dernier loyer
      ${f.montant(b.dernier_loyer, 'dernier loyer si départ depuis moins de 18 mois')}, versé le ${f.date(b.dernier_loyer_versement, 'date du dernier versement si applicable')}.
      ${revise === false ? 'Ce loyer n’a pas été révisé.' : revise === true ? `Dernière révision le ${f.date(b.dernier_loyer_revision, 'date de dernière révision si applicable')}.` : f.champ(null, 'révision du précédent loyer à confirmer')}</p>`;
  } else historique = `<p>${f.champ(null, 'situation de la précédente location à confirmer')}</p>`;
  return `<div class="encadre"><p>Zone soumise au plafonnement de l’évolution du loyer à la relocation : ${(b.zone_tendue ?? ctx.bien.zone_tendue) ? 'oui' : 'non'}.</p>${reference}</div>${historique}`;
}

// Phase 3 (C12, C20) : la mention qui remplace la clause de durée réduite dit à quelle rubrique elle se rapporte, et ne parle
// de « durée de droit commun » que pour un contrat qui l'a : `autreDuree` décrit une durée qui ne l'est pas (bail étudiant de
// neuf mois). Un bail déjà préparé pour la signature se relit à l'identique (typographie archivée) : l'ancienne phrase.
export function dureeReduiteSansObjet(autreDuree: string | null, t: Typographie = TYPOGRAPHIE): string {
  if (t.archivee) return '<p class="mentions">Sans objet — le contrat est conclu pour la durée de droit commun.</p>';
  return `<p class="mentions">Durée réduite pour un événement précis justifiant la reprise du logement : sans objet — ${autreDuree ?? 'le contrat est conclu pour la durée de droit commun'}.</p>`;
}

// Phase 3 (C08, C13, C29) : la fin de la rubrique « travaux … effectués depuis la fin du dernier contrat », ponctuation comprise.
// Première location : sans objet (il n'y a pas de dernier contrat ; des travaux saisis ne s'impriment pas, l'écran du bail le
// dit). Sans travaux : « Néant. » seul, plus de « montant » suivi d'un tiret. Les baux déjà préparés pour la signature gardent
// leur ancienne phrase (voir bail-nu.ts et bail-meuble.ts).
export function travauxDepuisDernierContrat(ctx: ContexteBail, f: Fusion): string {
  const b = ctx.bail;
  if (b.precedente_location === 'premiere') return 'Sans objet — première location.';
  if (!b.travaux_recents?.trim()) return 'Néant.';
  return `${ouNeant(b.travaux_recents)} — montant : ${f.montant(b.travaux_recents_montant, 'montant')}.`;
}

export function fixationLoyer(valeur: string | null): string | null {
  return valeur ? ({ libre: 'Librement fixé', plafonnement: 'Plafonnement en zone d’encadrement', reevaluation: 'Réévaluation après travaux' }[valeur] ?? valeur) : null;
}

export function dateConclusion(ctx: ContexteBail, f: Fusion): string {
  return `<p>Date prévue de conclusion : ${f.date(ctx.bail.date_conclusion_prevue, 'date prévue de conclusion du contrat')}.
    La date effective est celle portée lors de la signature par les parties.</p>`;
}

// ───────────────────────── Textes officiels, lot T2 ─────────────────────────

/** Les cents d'un montant en euros (« 650.5 » → 65050), pour compter sans erreur d'arrondi. */
const centimes = (n: number | string) => Math.round(Number(n) * 100);

/**
 * Lot T2 (R08-A3). Le contrat type demande le « montant total dû à la première échéance de paiement pour une période complète
 * de location », détaillé (loyer, charges) : le bail imprimait à la place le premier mois au prorata. Le montant de la période
 * complète vient donc en premier ; quand le bail ne prend pas effet un 1er, une seconde phrase donne le premier terme
 * réellement appelé. Ce terme se calcule comme l'appel de loyer (generer_appels_loyer_interne) : le loyer et les charges sont
 * proratisés et arrondis CHACUN au centime (jours du premier mois, jour d'entrée compris, sur les jours du mois), puis
 * additionnés. L'ancien calcul arrondissait le total : il pouvait s'écarter d'un centime de l'appel émis.
 */
export function calculPremiereEcheance(loyerHc: number | string, charges: number | string, dateDebut: string) {
  const loyer = centimes(loyerHc), ch = centimes(charges);
  const [annee, mois, jour] = dateDebut.slice(0, 10).split('-').map(Number);
  const joursMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const joursDus = joursMois - jour + 1;
  const part = (c: number) => Math.round((c * joursDus) / joursMois);
  return {
    complet: { loyer: loyer / 100, charges: ch / 100, total: (loyer + ch) / 100 },
    prorata: jour === 1 ? null : { loyer: part(loyer) / 100, charges: part(ch) / 100, total: (part(loyer) + part(ch)) / 100, joursDus, joursMois },
  };
}

export function premiereEcheanceLocation(ctx: ContexteBail, f: Fusion): string {
  const b = ctx.bail;
  // Le libellé reste celui de la liste « À renseigner » et du repère vers la fiche du bail.
  const libelle = 'loyer + charges, montant au prorata';
  const intitule = 'Montant total dû à la première échéance de paiement pour une période complète de location';
  if (b.loyer_hc === null || b.charges === null || !b.date_debut) return `${intitule} : ${f.champ(null, libelle)}.`;
  const c = calculPremiereEcheance(b.loyer_hc, b.charges, b.date_debut);
  const detail = (m: { loyer: number; charges: number }) => `loyer ${eur(m.loyer)} + charges ${eur(m.charges)}`;
  const complet = `${intitule} : ${f.champ(eur(c.complet.total), libelle)} (${detail(c.complet)}).`;
  if (!c.prorata) return complet;
  return `${complet}<br/>
    Le contrat ne prenant pas effet le premier jour du mois, le premier terme est dû au prorata des jours du mois (${c.prorata.joursDus} jours sur ${c.prorata.joursMois}) : ${eur(c.prorata.total)} (${detail(c.prorata)}).`;
}

/**
 * Lot T2 (R08-A1). Le contrat type demande, pour le mandataire : nom ou raison sociale, adresse, « activité exercée », puis
 * « numéro et lieu de délivrance de la carte professionnelle / nom et adresse du garant » (mention obligatoire pour un
 * professionnel de la loi du 2 janvier 1970). L'activité imprimée est celle que le mandat de gestion de Gerimmo donne déjà à
 * l'agence (« Gestion immobilière ») ; le garant est la garantie financière de son profil.
 */
export function mandataireLocation(ctx: ContexteBail, f: Fusion, adresse: string | null | undefined, t: Typographie): string {
  if (ctx.organisation.type !== 'agence') return '';
  const debut = `<p>Le bailleur est représenté par son mandataire : ${echapper(ctx.organisation.name)},
           ${f.champ(adresse, 'adresse du mandataire')}`;
  const carte = `carte professionnelle :
           ${f.champ(ctx.organisation.carte_pro, 'numéro de carte et CCI de délivrance')}`;
  if (t.archivee) return `${debut} — ${carte}.</p>`;
  return `${debut} — activité exercée : gestion immobilière — ${carte} — garant (nom et adresse) :
           ${f.champ(ctx.organisation.garantie_financiere, 'garantie financière du mandataire (nom et adresse du garant)')}.</p>`;
}

/**
 * Lot T2 (R08-A5). Les phrases fixes de la rubrique III. Logement nu (annexe 1) : mot pour mot, « 3 ou 6 ans » remplacé par
 * la durée du contrat. Logement meublé (annexe 2) : le recueil dit que cette annexe a été retouchée à la main à cinq
 * endroits non indiqués ; seules les phrases sur les congés, identiques à celles de l'annexe 1, sont reprises telles
 * quelles ; la phrase sur la reconduction en garde le sens (un an ; aucune pour le bail étudiant de neuf mois).
 */
export function reconductionEtConges(ctx: ContexteBail, meuble: boolean): string {
  const congeLocataire = 'Le locataire peut mettre fin au bail à tout moment, après avoir donné congé.';
  const congeBailleur = 'Le bailleur, quant à lui, peut mettre fin au bail à son échéance et après avoir donné congé, soit pour reprendre le logement en vue de l’occuper lui-même ou une personne de sa famille, soit pour le vendre, soit pour un motif sérieux et légitime.';
  if (!meuble) {
    const duree = dureeBailNuAnnees(ctx.bailleurs.map(b => b.qualite)) === 6 ? 'six' : 'trois';
    return `<p>En l’absence de proposition de renouvellement du contrat, celui-ci est, à son terme, reconduit tacitement pour ${duree} ans et dans les mêmes conditions. ${congeLocataire} ${congeBailleur}</p>`;
  }
  if (ctx.bail.meuble_etudiant)
    return `<p>Le contrat, consenti à un étudiant pour une durée de neuf mois, n’est pas reconduit tacitement à son terme. ${congeLocataire} Le bailleur, quant à lui, peut mettre fin au bail à son échéance et après avoir donné congé.</p>`;
  return `<p>Le contrat est reconduit tacitement à son terme pour une durée d’un an et dans les mêmes conditions. ${congeLocataire} ${congeBailleur}</p>`;
}

/**
 * Lot T2 (R17-A1, R17-A4). La clause de solidarité. L'extinction de la solidarité après un congé est une règle de la
 * colocation (article 8-1 VI de la loi du 6 juillet 1989), écrite ici dans les mots de la loi : à la date d'effet du congé
 * ET lorsqu'un nouveau colocataire figure au bail ; à défaut, au plus tard six mois après. Elle ne vaut pas pour une
 * location consentie exclusivement à des époux ou à des partenaires de PACS, qui n'est pas une colocation (article 8-1 I).
 * Gerimmo ne connaît pas la situation de famille des locataires : quand le bail a exactement deux locataires, la clause le
 * dit elle-même, sous condition.
 */
export function clauseSolidarite(ctx: ContexteBail, t: Typographie): string {
  if (t.archivee) return `<p>Les locataires sont tenus solidairement et indivisiblement de l'exécution du présent contrat.
    En cas de congé de l'un d'eux, la solidarité s'éteint six mois après la date d'effet du congé, ou
    dès qu'un nouveau locataire le remplace au bail.</p>`;
  return `<p>Les locataires sont tenus solidairement et indivisiblement de l’exécution du présent contrat.</p>
    <p>${regleColocationSolidarite('la solidarité de celui des colocataires qui donne congé prend', 'elle s’éteint')}${ctx.locataires.length === 2 ? ` ${EXCEPTION_EPOUX_PACS}` : ''}</p>`;
}
export const regleColocationSolidarite = (sujet: string, aDefaut: string) =>
  `En colocation (article 8-1 de la loi du 6 juillet 1989), ${sujet} fin à la date d’effet du congé régulièrement délivré et lorsqu’un nouveau colocataire figure au bail. À défaut, ${aDefaut} au plus tard à l’expiration d’un délai de six mois après la date d’effet du congé.`;
export const EXCEPTION_EPOUX_PACS =
  'Cette règle ne s’applique pas si la location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat : une telle location n’est pas une colocation au sens de cet article.';

/**
 * Lot T2 (R17-A2). Un bail nu à durée réduite (article 11 de la loi du 6 juillet 1989) doit dire sa durée, les raisons et
 * l'événement invoqués ; Gerimmo n'enregistre pas cette durée et imprimait « trois ans » à côté de l'événement. Tant que la
 * durée réduite n'est pas une vraie donnée, le contrat n'est pas produit quand le champ est rempli.
 */
export const REFUS_BAIL_DUREE_REDUITE =
  'Gerimmo ne sait pas encore préparer un bail à durée réduite : le contrat doit en dire la durée, les raisons et l’événement, que Gerimmo n’enregistre pas. Pour un bail de la durée normale, videz le champ « Événement justifiant une durée réduite » (étape Clauses du bail). Pour un bail à durée réduite, faites rédiger le contrat hors de Gerimmo.';
