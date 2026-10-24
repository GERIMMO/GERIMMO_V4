// Les quatre courriers d'un prélèvement qui n'est pas passé.
//
// POURQUOI QUATRE, ET PAS UN RAPPEL RÉPÉTÉ. Le même message renvoyé tous les
// trois jours apprend à ne plus l'ouvrir — et le dernier, celui qui annonce
// l'arrêt de la saisie, arriverait dans un fil qu'on ne lit plus. Chacun dit
// donc quelque chose que le précédent ne disait pas : ce qui s'est passé, puis
// combien de temps il reste, puis que c'est demain, puis que c'est fait.
//
// CE QU'AUCUN DES QUATRE NE FAIT : accuser. Une carte qui expire, un plafond
// bancaire, un changement de banque — la cause est presque toujours matérielle.
// Le ton est celui d'un fournisseur qui prévient, pas d'un créancier qui
// réclame ; et chacun dit où corriger, en un clic.
//
// ET TOUS RAPPELLENT CE QUI RESTE POSSIBLE. Lecture seule n'est pas porte
// close : tout se consulte, tout s'exporte, le journal de gestion compris.
// Le taire ferait croire à une perte de données, et c'est la peur qui fait
// partir un client.
//
// PLAN DE CONFORMITÉ DU 23/10/2026 (lot 1C).
//  · R06 : le courrier du jour de l'échec vaut mise en demeure ; il dit la date à partir de laquelle l'abonnement peut
//    être résilié (trente jours après l'échec), en renvoyant à l'article 15.4 des conditions générales (V1 du
//    24/10/2026 : « Résiliation par l'Éditeur », au plus tôt trente jours après une mise en demeure restée sans effet,
//    qui vise cet article ; l'article 15.2 dit que ce courrier « vise l'article 15.4 et vaut mise en demeure »).
//    Intégration des textes du 24/10 : « article 15 » tant que la version du 30/09 (sans sous-numéro) était en
//    vigueur, « article 15.4 » depuis la V1, comme le plan le prévoyait.
//  · R23 : le PREMIER prélèvement échoué (aucune échéance réglée) a son propre courrier : le compte est gelé dès
//    l'échec, comme à la fin d'un essai sans souscription.
//  · R26 : en lecture seule, les envois automatiques aux locataires sont aussi interrompus ; ceux de la période ne sont
//    pas tous rattrapés. Rien n'est supprimé du fait de l'impayé.
//  · R07 : le courrier de résiliation pour impayé.

import { echapperHtml } from "@/lib/quittance-email";
import { euros, type Periodicite } from "@/lib/tarifs";
import { jourEnLettres } from "@/lib/delai-retractation";

export type Palier = 0 | 1 | 2 | 3;

export type RelancePaiement = {
  palier: Palier;
  organisation: string;
  // Ce que le prélèvement demandait : le montant de la période, en centimes, et sa périodicité. Pour un abonnement
  // annuel, l'équivalent mensuel (un douzième) n'est pas la somme que la banque a refusée — la dire « par mois »
  // serait faux (audit du 19/10, lot mineurs, a).
  periodicite: Periodicite;
  montantPeriodeCents: number;
  joursRestants: number;
  lectureSeuleLe: string; // AAAA-MM-JJ
  // Vers « Mon abonnement ». `null` quand l'adresse publique du site n'est
  // pas configurée : la lettre dit alors le geste sans promettre un clic.
  lien: string | null;
  /** R23 : aucune échéance encore réglée (premier prélèvement à la fin de l'essai). */
  premierPrelevement?: boolean;
  /** R06 : le jour à partir duquel l'abonnement peut être résilié (AAAA-MM-JJ), donné par la base. */
  resiliableLe?: string | null;
  /** Le jour de l'échec (AAAA-MM-JJ). */
  enDefautDepuis?: string | null;
};

/** « 1er décembre 2026 » pour « 2026-12-01 » (relecture adverse du 24/10, M2). */
function jour(iso: string): string {
  return jourEnLettres(iso.slice(0, 10));
}

/** « par mois » ou « par an », en toutes lettres. */
export function parPeriodeEnLettres(p: Periodicite): string {
  return p === "annuel" ? "par an" : "par mois";
}

export function sujetRelance(r: Pick<RelancePaiement, "palier" | "joursRestants" | "premierPrelevement">): string {
  if (r.premierPrelevement && r.palier === 0) return "Votre premier prélèvement Gerimmo n'est pas passé";
  switch (r.palier) {
    case 0:
      return "Votre prélèvement Gerimmo n'est pas passé";
    case 1:
      return `Prélèvement Gerimmo : il vous reste ${r.joursRestants} jour${r.joursRestants > 1 ? "s" : ""}`;
    case 2:
      return "Prélèvement Gerimmo : votre saisie s'arrête demain";
    default:
      return "Votre compte Gerimmo est en lecture seule";
  }
}

/** R06 : la phrase de la mise en demeure, quand la base donne la date. */
function miseEnDemeure(r: RelancePaiement, suite: string): string {
  return r.resiliableLe
    ? `<p>Sans règlement au ${jour(r.resiliableLe)}, l'abonnement pourra être résilié en application de l'article 15.4
        des conditions générales${suite}</p>`
    : "";
}

/** Le paragraphe propre à chaque palier. */
function message(r: RelancePaiement): string {
  const le = jour(r.lectureSeuleLe);
  const montant = `<strong>${euros(r.montantPeriodeCents)} ${parPeriodeEnLettres(r.periodicite)}</strong>`;
  if (r.premierPrelevement && r.palier === 0) {
    const depuis = r.enDefautDepuis ? ` depuis le ${jour(r.enDefautDepuis)}` : "";
    return `
        <p>Le premier prélèvement de votre abonnement (${montant}) n'a pas abouti. Votre essai étant terminé,
        <strong>la saisie de nouvelles données et les envois automatiques à vos locataires sont suspendus${depuis}</strong>.
        Vos données restent entières, consultables et exportables.</p>
        <p>Dès que le paiement aboutit, la saisie et les envois reprennent pour l'avenir.</p>
        ${miseEnDemeure(r, ".")}`;
  }
  switch (r.palier) {
    case 0:
      return `
        <p>Le prélèvement de votre abonnement (${montant})
        n'a pas abouti. Cela vient presque toujours d'une carte arrivée à expiration
        ou d'un plafond bancaire — rien d'inquiétant, mais il faut le corriger.</p>
        <p><strong>Votre compte reste entièrement ouvert jusqu'au ${le}.</strong>
        Passé cette date et sans règlement, la saisie de nouvelles données sera
        suspendue.</p>
        ${miseEnDemeure(r, " ; vos données resteront consultables et exportables.")}`;
    case 1:
      return `
        <p>Le prélèvement de votre abonnement n'a toujours pas abouti.
        Il vous reste <strong>${r.joursRestants} jour${r.joursRestants > 1 ? "s" : ""}</strong>
        avant que la saisie ne soit suspendue, le ${le}.</p>
        <p>Mettre votre moyen de paiement à jour prend une minute.</p>`;
    case 2:
      return `
        <p><strong>Demain, ${le}, la saisie de nouvelles données sera suspendue</strong>
        sur votre compte, faute de règlement. Les envois automatiques à vos locataires s'arrêteront aussi.</p>
        <p>Il est encore temps : dès que le paiement passe, tout rouvre immédiatement.</p>`;
    default:
      return `
        <p>Faute de règlement depuis le ${le}, <strong>votre compte est passé en
        lecture seule</strong>.</p>
        <p><strong>Tout rouvre dès que le paiement est enregistré, tant que l'abonnement n'est pas résilié</strong>,
        exactement où vous vous étiez arrêté. Rien n'est supprimé du fait de l'impayé.</p>`;
  }
}

export function corpsRelance(r: RelancePaiement): string {
  const geste = r.palier === 3 ? "Régulariser et rouvrir mon compte" : "Mettre mon paiement à jour";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="font-size:17px">${sujetRelance(r)}</h2>
      <p>Bonjour,</p>
      ${message(r)}
      ${
        r.lien
          ? `<p style="margin:22px 0">
        <a href="${echapperHtml(r.lien)}"
           style="background:#12263f;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          ${geste}
        </a>
      </p>`
          : `<p style="margin:22px 0"><strong>${geste}</strong> depuis « Mon abonnement »,
             dans votre espace Gerimmo.</p>`
      }
      <p style="color:#555">
        Quoi qu'il arrive, <strong>vos données restent entières</strong> : baux,
        quittances, états des lieux, journal de gestion — tout reste consultable et
        exportable, même en lecture seule. En lecture seule, les nouvelles saisies et
        les envois automatiques à vos locataires (appels de loyer, quittances, relances)
        sont interrompus jusqu'au règlement ; ceux de la période d'interruption ne sont
        pas tous rattrapés.
      </p>
      <p style="color:#555">— Gerimmo, pour ${echapperHtml(r.organisation)}</p>
    </div>`;
}

/** R07 : ce que sont devenues les factures restées ouvertes à la résiliation. */
export type FacturesAnnulees = "annulees" | "aucune" | "a_annuler";

/**
 * R07 : le courrier de résiliation pour impayé, sur `customer.subscription.deleted`, seulement quand un défaut de
 * paiement était en cours et qu'aucune résiliation n'avait été demandée par le client.
 *
 * `apresMiseEnDemeure` (relecture adverse du 24/10, I1) : la résiliation a lieu trente jours au moins après la mise en
 * demeure, l'article 15.4 est cité ; sinon le courrier dit les faits, sans invoquer un article dont la condition n'est
 * pas remplie (et sans contredire la date annoncée par la mise en demeure).
 */
export function courrierResiliationImpaye(p: {
  organisation: string;
  resilieLe: string; // AAAA-MM-JJ, jour de Paris
  factures: FacturesAnnulees;
  lien: string | null;
  apresMiseEnDemeure: boolean;
}): { sujet: string; html: string } {
  const sujet = "Votre abonnement Gerimmo est résilié faute de règlement";
  const facture =
    p.factures === "annulees"
      ? " La facture restée impayée est annulée."
      : p.factures === "a_annuler"
        ? " La facture restée impayée sera annulée : vous n'avez rien à régler."
        : "";
  const geste = "Souscrire de nouveau";
  return {
    sujet,
    html: `
    <div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="font-size:17px">${sujet}</h2>
      <p>Bonjour,</p>
      <p>${
        p.apresMiseEnDemeure
          ? `Faute de règlement, votre abonnement Gerimmo est résilié depuis le ${jour(p.resilieLe)}, en application de l'article 15.4 des conditions générales.`
          : `Faute de règlement, votre abonnement Gerimmo a été résilié le ${jour(p.resilieLe)}.`
      }${facture}</p>
      <p>Vos données restent consultables et exportables en lecture seule ; rien n'est supprimé du fait de cette
      résiliation. Pour reprendre la saisie, souscrivez de nouveau depuis « Mon abonnement ».</p>
      ${
        p.lien
          ? `<p style="margin:22px 0">
        <a href="${echapperHtml(p.lien)}"
           style="background:#12263f;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          ${geste}
        </a>
      </p>`
          : ""
      }
      <p style="color:#555">— Gerimmo, pour ${echapperHtml(p.organisation)}</p>
    </div>`,
  };
}
