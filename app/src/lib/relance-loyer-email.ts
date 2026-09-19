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
  /** Lien vers « Mes paiements » du locataire. */
  lien: string;
};

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
  )}) pour ${r.lot} reste dû à hauteur de <strong>${eur(r.reste)}</strong>.</p>`;
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
