// Sources vérifiées le 14/09/2026 : décret 2015-587, annexes 1 et 2 ;
// décret 2026-596 (contrats conclus/renouvelés à partir du 01/10/2026) ;
// arrêté du 13/11/2025 (honoraires 2026). Données absentes = manquants.
import { Fusion, sousSection } from '../gabarit';
import { plafondsHonoraires } from '@/lib/mentions-contrat';
import type { ContexteBail } from './communs';

export function periodeConstruction(annee: number | null): string | null {
  if (!annee) return null;
  if (annee < 1949) return 'avant 1949';
  if (annee <= 1974) return '1949-1974';
  if (annee <= 1989) return '1975-1989';
  if (annee <= 2005) return '1990-2005';
  return 'depuis 2006';
}

export function mentionsEnergie(ctx: ContexteBail, classe: string | null, f: Fusion): string {
  const b = ctx.bail;
  return `<p>Classe de performance du logement (DPE) : <b>${f.champ(classe, 'classe DPE du logement')}</b>.</p>
    <p class="mentions">Rappel des niveaux minimaux de performance d’un logement décent :
    en France métropolitaine, classe F à compter du 1er janvier 2025, E à compter du 1er janvier 2028,
    D à compter du 1er janvier 2034. En Guadeloupe, Martinique, Guyane, à La Réunion et à Mayotte :
    classe F à compter du 1er janvier 2028, E à compter du 1er janvier 2031.
    La consommation d’énergie finale doit également respecter le seuil applicable. Le dossier de diagnostic technique est annexé au contrat.</p>
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

export function clauseResolutoire(ctx: ContexteBail): string {
  const b = ctx.bail;
  // Les nouveaux contrats sont établis pour la signature actuelle ou prévue.
  // Les anciens contrats signés restent dans la GED et ne sont pas réécrits.
  return `<p>Le défaut de paiement du loyer ou des charges aux échéances convenues, ou le non-versement du dépôt de garantie,
    entraîne la résiliation de plein droit du contrat. Cette clause ne prend effet que six semaines après
    un commandement de payer demeuré infructueux, sous réserve des dispositions de l’article 24 de la loi du 6 juillet 1989.</p>
    ${b.clause_resolutoire_assurance !== false ? '<p>Les parties conviennent également de la résiliation de plein droit pour défaut d’assurance des risques locatifs. Cette clause ne produit effet qu’un mois après un commandement demeuré infructueux.</p>' : ''}
    ${b.clause_resolutoire_troubles !== false ? '<p>Les parties conviennent de la résiliation de plein droit en cas de troubles de voisinage contraires à l’usage paisible des locaux, constatés par une décision de justice passée en force de chose jugée.</p>' : ''}
    ${b.clause_resolutoire_servitude && b.servitude_residence_principale === true ? '<p>Les parties conviennent de la résiliation de plein droit pour non-respect de la servitude de résidence principale applicable au logement. Cette clause ne produit effet qu’à l’expiration du délai de mise en demeure fixé par le maire conformément au II de l’article L. 481-4 du code de l’urbanisme.</p>' : ''}`;
}

export function honorairesLocation(ctx: ContexteBail, f: Fusion): string {
  if (ctx.organisation.type !== 'agence') return '<p>Sans objet — location conclue sans intermédiaire.</p>';
  const b = ctx.bail;
  const tarifs = plafondsHonoraires(b.date_conclusion_prevue, b.zone_honoraires);
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

export function encadrementLocation(ctx: ContexteBail, f: Fusion): string {
  const b = ctx.bail;
  const reference = b.encadrement_loyer === true
    ? `<p>Loyers de référence imposés par arrêté local : oui. Loyer de référence : ${f.montant(b.loyer_reference, 'loyer de référence €/m²')} par m² ;
      loyer de référence majoré : ${f.montant(b.loyer_reference_majore, 'loyer de référence majoré €/m²')} par m².<br/>
      ${b.complement_loyer == null ? 'Complément de loyer : néant.' : `Complément de loyer : ${f.montant(b.complement_loyer, 'complément de loyer')}, justifié par ${f.champ(b.complement_justification, 'justification du complément de loyer')}.`}</p>`
    : `<p>Loyers de référence imposés par arrêté local : ${b.encadrement_loyer === false ? 'non' : f.champ(null, 'application des loyers de référence à vérifier')}.</p>`;
  return `<div class="encadre"><p>Zone soumise au plafonnement de l’évolution du loyer à la relocation : ${ctx.bien.zone_tendue ? 'oui' : 'non'}.</p>${reference}</div>
    <p>Si le précédent locataire a quitté le logement moins de dix-huit mois avant la signature : dernier loyer
    ${f.montant(b.dernier_loyer, 'dernier loyer si départ depuis moins de 18 mois')}, versé le ${f.date(b.dernier_loyer_versement, 'date du dernier versement si applicable')},
    dernière révision le ${f.date(b.dernier_loyer_revision, 'date de dernière révision si applicable')}.</p>`;
}

export function fixationLoyer(valeur: string | null): string | null {
  return valeur ? ({ libre: 'Librement fixé', plafonnement: 'Plafonnement en zone d’encadrement', reevaluation: 'Réévaluation après travaux' }[valeur] ?? valeur) : null;
}

export function dateConclusion(ctx: ContexteBail, f: Fusion): string {
  return `<p>Date prévue de conclusion : ${f.date(ctx.bail.date_conclusion_prevue, 'date prévue de conclusion du contrat')}.
    La date effective est celle portée lors de la signature par les parties.</p>`;
}
