// Les deux courriers d'un loyer qui n'est pas arrivé (relances automatiques, 20/09).
//
// DEUX, PAS UN RAPPEL RÉPÉTÉ — la même règle que les courriers d'abonnement :
// chacun dit quelque chose que le précédent ne disait pas. Le premier
// constate et laisse la porte ouverte (un virement en route, un oubli) ; le
// second dit ce qui suit si rien ne bouge — la mise en demeure, qui, elle,
// ne part jamais d'ici : c'est un recommandé, un geste du gérant.
//
// CE QUE NI L'UN NI L'AUTRE NE FAIT : accuser. Le ton est celui d'un
// gestionnaire qui prévient, pas d'un créancier qui réclame ; et chacun dit
// où régler et à qui écrire en cas de difficulté.
import { eur, formaterDate } from "@/lib/ged";
import { moisDeLaPeriode } from "@/lib/quittance-email";

export type NiveauRelanceAuto = "relance_1" | "relance_2";

export type RelanceLoyer = {
  niveau: NiveauRelanceAuto;
  prenom: string | null;
  emetteur: string;
  lot: string;
  /** « AAAA-MM-JJ » du terme relancé (le 1er du mois). */
  periode: string;
  dateEcheance: string;
  reste: number;
  /** Dette échue totale du bail (tous termes impayés), si connue. */
  totalDu?: number | null;
  /** Lien vers « Mes paiements » du locataire. */
  lien: string;
};

/**
 * Information de la caution (audit gestion du 29/09). Au niveau 2 de relance,
 * la caution du bail est informée de la défaillance du locataire (art. 2303 du
 * Code civil : information de la caution personne physique dès le premier
 * incident de paiement non régularisé dans le mois). Le courrier informe, il
 * ne met pas la caution en demeure de payer — ce geste reste au gérant.
 */
export type InformationCaution = {
  emetteur: string;
  locataire: string | null;
  lot: string;
  periode: string;
  dateEcheance: string;
  totalDu: number;
};

export function sujetInformationCaution(c: Pick<InformationCaution, "lot">): string {
  return `Information de la caution — loyer impayé (${c.lot})`;
}

export function corpsInformationCaution(c: InformationCaution): string {
  const mois = moisDeLaPeriode(c.periode);
  const qui = c.locataire?.trim() ? `<strong>${c.locataire.trim()}</strong>` : "le locataire dont vous êtes la caution";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>Information de la caution</h2>
      <p>Madame, Monsieur,</p>
      <p>En votre qualité de caution, nous vous informons que ${qui} n’a pas réglé le loyer de <strong>${mois}</strong>
        (échéance du ${formaterDate(c.dateEcheance)}) pour ${c.lot}, malgré une première relance.</p>
      <p>À ce jour, <strong>${eur(c.totalDu)}</strong> restent dus sur le bail, tous termes échus confondus.</p>
      <p>Ce message vous informe de l’incident de paiement ; il ne vous demande aucun règlement à ce stade.
        Pour toute question, écrivez au gestionnaire du bail.</p>
      <p>— ${c.emetteur}</p>
    </div>`;
}

export function sujetRelanceLoyer(r: Pick<RelanceLoyer, "niveau" | "periode">): string {
  const mois = moisDeLaPeriode(r.periode);
  return r.niveau === "relance_1"
    ? `Loyer de ${mois} — un règlement semble en attente`
    : `Seconde relance — loyer de ${mois} toujours en attente`;
}

export function corpsRelanceLoyer(r: RelanceLoyer): string {
  const mois = moisDeLaPeriode(r.periode);
  const salut = `<p>Bonjour${r.prenom ? " " + r.prenom : ""},</p>`;
  const constat = `<p>Sauf erreur de notre part, le loyer de <strong>${mois}</strong> (échéance du ${formaterDate(
    r.dateEcheance
  )}) pour ${r.lot} reste dû à hauteur de <strong>${eur(r.reste)}</strong>.</p>${
    // Audit du 27/09 : la relance dit la dette entière, comme l'avis
    // d'échéance (wiki « Quittancement des loyers » § 18/09, RM-3.6.3).
    r.totalDu != null && Number(r.totalDu) > Number(r.reste) + 0.004
      ? `<p>Au total, <strong>${eur(Number(r.totalDu))}</strong> restent dus à ce jour sur votre bail, tous termes échus confondus.</p>`
      : ""
  }`;
  const suite =
    r.niveau === "relance_1"
      ? `<p>Si votre règlement est parti ces derniers jours, merci de ne pas tenir compte de ce message. Sinon, vous pouvez le régler par virement à votre gestionnaire, aux coordonnées habituelles.</p>`
      : `<p>Ce message fait suite à une première relance restée sans effet. Sans règlement ni réponse de votre part dans les prochains jours, votre gestionnaire pourra vous adresser une mise en demeure par lettre recommandée — ce que nous préférons éviter.</p>`;
  const aide = `<p>Une difficulté de paiement ? Écrivez à votre gestionnaire : une solution se trouve toujours plus tôt que tard.</p>`;
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>${r.niveau === "relance_1" ? "Loyer en attente" : "Seconde relance"} — ${mois}</h2>
      ${salut}
      ${constat}
      ${suite}
      <p><a href="${r.lien}">Voir mes paiements</a></p>
      ${aide}
      <p>— ${r.emetteur}</p>
    </div>`;
}
