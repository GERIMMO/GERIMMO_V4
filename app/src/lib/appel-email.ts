// Le corps de l'avis d'échéance, écrit une seule fois.
//
// Même raison que pour la quittance (`quittance-email.ts`) : deux chemins
// peuvent l'envoyer — la tâche planifiée, et demain un bouton du gérant. Écrit
// deux fois, le message divergerait.
//
// CE QUE CET E-MAIL EST, ET CE QU'IL N'EST PAS. C'est un AVIS D'ÉCHÉANCE : il
// annonce ce qui sera dû, et à quelle date. Ce n'est ni une quittance (qui
// atteste d'un paiement et libère), ni une relance (qui constate un retard et
// engage un circuit). Le vocabulaire les sépare, parce que le droit les sépare.

import { eur } from "@/lib/ged";
import { moisDeLaPeriode } from "@/lib/quittance-email";

export type AvisEcheance = {
  periode: string;
  loyerHc: number;
  charges: number;
  /** Ce qui reste dû sur CE terme — égal au montant appelé tant que rien n'est versé. */
  resteDu: number;
  dateEcheance: string;
  /** Terme partiel : entrée ou sortie en cours de mois. */
  prorata: boolean;
  /** Ce qui restait dû sur les termes antérieurs. Zéro si le locataire est à jour. */
  arriere: number;
  emetteur: string;
  prenom?: string | null;
  lien: string;
};

/** « 4 octobre 2026 ». UTC : l'échéance est une date sans heure. */
export function jourDeLEcheance(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function sujetAvisEcheance(a: Pick<AvisEcheance, "periode">): string {
  return `Avis d'échéance — ${moisDeLaPeriode(a.periode)}`;
}

export function corpsAvisEcheance(a: AvisEcheance): string {
  const mois = moisDeLaPeriode(a.periode);
  // Le prorata s'annonce : un locataire qui voit un montant inhabituel sans
  // explication appelle son agence, ou pire, se croit surfacturé.
  const mentionProrata = a.prorata
    ? `<p style="color:#5b6478">Ce terme est calculé au prorata : votre bail ne couvre
       qu'une partie du mois.</p>`
    : "";
  // L'arriéré est dit, jamais réclamé deux fois : le total à régler additionne
  // le terme et ce qui traîne, et l'e-mail montre le détail des deux.
  const mentionArriere =
    a.arriere > 0
      ? `<p style="color:#a12a2a"><strong>Solde antérieur restant dû :
         ${eur(a.arriere)}.</strong> En le réglant avec ce terme, vous
         solderez votre compte, soit ${eur(a.resteDu + a.arriere)} au total.</p>`
      : "";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#151b2b">
      <h2 style="color:#0f2352">Avis d'échéance — ${mois}</h2>
      <p>Bonjour${a.prenom ? " " + a.prenom : ""},</p>
      <p>Voici le détail de votre échéance de <strong>${mois}</strong>,
         à régler pour le <strong>${jourDeLEcheance(a.dateEcheance)}</strong> :</p>
      <ul>
        <li>Loyer hors charges : ${eur(a.loyerHc)}</li>
        <li>Provision pour charges : ${eur(a.charges)}</li>
        <li><strong>Montant de l'échéance : ${eur(a.resteDu)}</strong></li>
      </ul>
      ${mentionProrata}
      ${mentionArriere}
      <p><a href="${a.lien}">Consulter mes loyers et mes quittances</a></p>
      <p style="color:#5b6478;font-size:12px">
        Votre quittance vous sera adressée une fois le terme intégralement réglé.
        Si votre paiement s'est croisé avec cet avis, merci de ne pas en tenir
        compte.
      </p>
      <p>— ${a.emetteur}</p>
    </div>`;
}
