// Le corps de l'e-mail de quittance, écrit une seule fois.
//
// Deux chemins l'envoient : le bouton du gérant (`envoyerQuittance`, action
// serveur, avec sa session) et la tâche planifiée (`/api/cron/equipes?mission=quittances`, sans
// session). Écrit deux fois, le message divergerait — et c'est un document que
// le locataire conserve : deux mises en forme pour la même quittance selon que
// l'agence a cliqué ou non ne s'expliquent pas.

import { eur } from "@/lib/ged";
import { particuleDe } from "@/lib/elision";
import { libelleCharges } from "@/lib/documents/modeles/communs";

/**
 * Toute valeur SAISIE (prénom, nom de lot, émetteur…) interpolée dans le HTML
 * d'un e-mail passe par ici (audit agence 27/09) : un « <a href=…> » saisi en
 * prénom devenait un lien dans le message que le locataire reçoit.
 */
export function echapperHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type Quittance = {
  estQuittance: boolean;
  periode: string;
  loyerHc: number;
  charges: number;
  /** Le montant que le document atteste : le terme entier pour une quittance, le versement pour un reçu. */
  montant: number;
  /** `baux.charges_mode` : « forfait » ou « provision ». Le libellé des charges suit, comme sur le document. */
  chargesMode?: string | null;
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

/**
 * Les lignes du détail. Quittance : loyer, charges et le total du terme. Reçu partiel : le terme entier, ce qui a été
 * encaissé et ce qui reste dû — comme le document conforme (audit final du 27/10, LOY-02 : « Loyer 800 € / Charges
 * 100 € / Total 400 € » laissait croire à une erreur). Le libellé des charges suit le mode du bail (forfait ou provision).
 */
export function lignesQuittance(q: Pick<Quittance, "estQuittance" | "loyerHc" | "charges" | "montant" | "chargesMode">): string[] {
  const terme = Math.round((q.loyerHc + q.charges) * 100) / 100;
  if (q.estQuittance) {
    return [
      `Loyer hors charges : ${eur(q.loyerHc)}`,
      `${libelleCharges(q.chargesMode)} : ${eur(q.charges)}`,
      `<strong>Total du terme : ${eur(q.montant)}</strong>`,
    ];
  }
  return [
    `Total du terme (loyer ${eur(q.loyerHc)}, ${libelleCharges(q.chargesMode).toLowerCase()} ${eur(q.charges)}) : ${eur(terme)}`,
    `Montant encaissé : ${eur(q.montant)}`,
    `<strong>Solde restant dû : ${eur(Math.max(0, Math.round((terme - q.montant) * 100) / 100))}</strong>`,
  ];
}

export function corpsQuittance(q: Quittance): string {
  const mois = moisDeLaPeriode(q.periode);
  const titre = titreQuittance(q.estQuittance);
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2>${titre} — ${mois}</h2>
      <p>Bonjour${q.prenom ? " " + echapperHtml(q.prenom) : ""},</p>
      <p>Veuillez trouver votre ${titre.toLowerCase()} ${particuleDe(mois)}<strong>${mois}</strong> :</p>
      <ul>
        ${lignesQuittance(q).map((l) => `<li>${l}</li>`).join("\n        ")}
      </ul>
      <p><a href="${echapperHtml(q.lien)}">Consulter / imprimer le document</a></p>
      <p>— ${echapperHtml(q.emetteur)}</p>
    </div>`;
}
