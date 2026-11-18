import { dateParis, euros, formuleParCode, parPeriode } from "@/lib/tarifs";
import { formaterDateParis } from "@/lib/heure-paris";

/** Présentation de données déjà lues. Aucun état contractuel ni montant n'est modifié. */
export type SituationAbonnement = {
  status: string; essai_fin: string | null; stripe_statut: string | null;
  formule: string | null; periodicite: string | null; montant_periode_cents: number | null;
  periode_fin: string | null; annulation_demandee: boolean; paiement_en_defaut_depuis: string | null;
};
export function presentationAbonnement(a: SituationAbonnement, aujourdHui: string) {
  const etats: Record<string, string> = { active: "Abonnement actif", trialing: "Essai avec souscription", past_due: "Paiement en retard", unpaid: "Impayé", incomplete: "Paiement en attente", incomplete_expired: "Souscription expirée", canceled: "Abonnement résilié", paused: "Abonnement en pause" };
  const essaiGratuit = !a.stripe_statut && a.status === "essai";
  const essaiTermine = essaiGratuit && !!a.essai_fin && a.essai_fin.slice(0, 10) < aujourdHui;
  const termine = ["canceled", "incomplete_expired"].includes(a.stripe_statut ?? "");
  const finProgrammee = a.annulation_demandee && ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(a.stripe_statut ?? "");
  const date = essaiGratuit || a.stripe_statut === "trialing" ? a.essai_fin ?? a.periode_fin : a.periode_fin;
  const montant = a.montant_periode_cents !== null && Number.isSafeInteger(a.montant_periode_cents) && a.montant_periode_cents >= 0 ? euros(a.montant_periode_cents) : null;
  return {
    statut: a.stripe_statut ? etats[a.stripe_statut] ?? "État à vérifier" : essaiGratuit ? essaiTermine ? "Essai terminé" : "Essai gratuit" : "Sans souscription payante",
    formule: a.formule ? formuleParCode(a.formule)?.nom ?? "Formule à vérifier" : null,
    montant, periode: a.periodicite === "mensuel" || a.periodicite === "annuel" ? parPeriode(a.periodicite) : null,
    date: date ? formaterDateParis(date) : null,
    dateLibelle: finProgrammee ? "Fin prévue" : essaiGratuit || a.stripe_statut === "trialing" ? "Fin de l’essai" : termine ? "Dernière période" : "Prochaine échéance",
    finProgrammee,
    aSuivre: ["past_due", "unpaid", "incomplete"].includes(a.stripe_statut ?? "") || !!a.paiement_en_defaut_depuis,
  };
}

export function ResumeAbonnementClient({ situation, erreur, taxe, facturesHref }: {
  situation: SituationAbonnement; erreur: boolean; taxe: string | null; facturesHref?: string;
}) {
  const p = presentationAbonnement(situation, dateParis(new Date()));
  return <section className="loc-carte mb-5 space-y-4" aria-labelledby="abonnement-client-titre">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="abonnement-client-titre" className="text-xl">Abonnement</h2>{!erreur && <span className={`puce ${p.aSuivre ? "puce-rouge" : situation.stripe_statut === "active" ? "puce-loue" : "puce-prep"}`}>{p.statut}</span>}</div>
    {erreur ? <p role="alert">Abonnement indisponible : rechargez la fiche pour vérifier sa situation.</p> : <>
      <dl className="grid gap-4 sm:grid-cols-3">
        {p.formule && <div><dt className="libelle-champ">Formule</dt><dd className="font-medium">{p.formule}</dd></div>}
        {situation.stripe_statut && <div><dt className="libelle-champ">{["canceled", "incomplete_expired"].includes(situation.stripe_statut) ? "Dernier montant contractuel connu" : "Montant du contrat"}</dt><dd className="font-medium">{p.montant ? `${p.montant}${taxe ? ` ${taxe}` : ""}${p.periode ? ` ${p.periode}` : ""}` : "À vérifier"}</dd></div>}
        {p.date && <div><dt className="libelle-champ">{p.dateLibelle}</dt><dd className="font-medium">{p.date}</dd></div>}
      </dl>
      {!situation.stripe_statut && situation.status === "essai" && <p className="text-sm text-muted-foreground">Sans carte bancaire ni conversion automatique en abonnement payant.</p>}
      {p.finProgrammee && <p className="text-sm">Résiliation programmée{p.date ? ` : fin prévue le ${p.date}.` : " ; date de fin à vérifier."}</p>}
      {situation.paiement_en_defaut_depuis && <p role="status" className="text-sm">Paiement à suivre depuis le {formaterDateParis(situation.paiement_en_defaut_depuis)}. Le montant du contrat n’est pas le solde de la dette.</p>}
      {facturesHref && <a href={facturesHref} className={p.aSuivre ? "btn-or inline-flex" : "lien-discret inline-flex min-h-11 items-center"}>{p.aSuivre ? "Examiner le paiement et les factures" : "Factures et historique"}</a>}
    </>}
  </section>;
}
