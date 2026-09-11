// Le corps de l'e-mail de quittance, écrit une seule fois.
//
// Deux chemins l'envoient : le bouton du gérant (`envoyerQuittance`, action
// serveur, avec sa session) et la tâche planifiée (`/api/cron/quittances`, sans
// session). Écrit deux fois, le message divergerait — et c'est un document que
// le locataire conserve : deux mises en forme pour la même quittance selon que
// l'agence a cliqué ou non ne s'expliquent pas.

import { eur } from "@/lib/ged";

export type Quittance = {
  estQuittance: boolean;
  periode: string;
  loyerHc: number;
  charges: number;
  montant: number;
  emetteur: string;
  prenom?: string | null;
  lien: string;
};

/** « septembre 2026 ». UTC : la période est une date sans heure. */
export function moisDeLaPeriode(periode: string): string {
  return new Date(periode).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Quittance ou reçu : les deux mots ne sont pas interchangeables. La quittance
 * atteste d'un paiement INTÉGRAL et libère le locataire pour la période ; le
 * reçu constate un versement partiel et laisse le solde dû (RM-3.4.2).
 */
export function titreQuittance(estQuittance: boolean): string {
  return estQuittance ? "Quittance de loyer" : "Reçu de paiement";
}

export function sujetQuittance(q: Pick<Quittance, "estQuittance" | "periode">): string {
  return `${titreQuittance(q.estQuittance)} — ${moisDeLaPeriode(q.periode)}`;
}

export function corpsQuittance(q: Quittance): string {
  const mois = moisDeLaPeriode(q.periode);
  const titre = titreQuittance(q.estQuittance);
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>${titre} — ${mois}</h2>
      <p>Bonjour${q.prenom ? " " + q.prenom : ""},</p>
      <p>Veuillez trouver votre ${titre.toLowerCase()} de <strong>${mois}</strong> :</p>
      <ul>
        <li>Loyer hors charges : ${eur(q.loyerHc)}</li>
        <li>Provision pour charges : ${eur(q.charges)}</li>
        <li><strong>Total : ${eur(q.montant)}</strong></li>
      </ul>
      <p><a href="${q.lien}">Consulter / imprimer le document</a></p>
      <p>— ${q.emetteur}</p>
    </div>`;
}
