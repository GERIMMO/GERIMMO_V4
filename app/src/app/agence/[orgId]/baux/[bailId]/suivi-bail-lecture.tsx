import Link from "next/link";
import { eur, formaterDate } from "@/lib/ged";
import { STATUTS_APPEL_LOYER } from "@/lib/baux";
import type { ReactNode } from "react";
import type { LigneEcheance, Encaissement } from "./formulaire-loyers";

const etatsEdl: Record<string, string> = { signe: "Signé", en_cours: "En cours", brouillon: "Brouillon", conteste: "Contesté" };

/** Consultation de supervision : données présentes, aucune commande de gestion. */
export function SuiviBailLecture({ base, bailId, echeances, encaissements, edls, indisponibles, historique }: {
  base: string; bailId: string; historique?: ReactNode;
  echeances: LigneEcheance[]; encaissements: Encaissement[];
  edls: { id: string; type: string; etat: string }[];
  indisponibles: { loyers: boolean; encaissements: boolean; edls: boolean };
}) {
  return <div className="space-y-5">
    <section className="rounded-xl border bg-card p-4" aria-labelledby="lecture-loyers">
      <h2 id="lecture-loyers" className="text-base font-semibold">Échéancier enregistré</h2>
      {indisponibles.loyers ? <p role="alert">Les loyers sont indisponibles.</p> : echeances.length ?
        <ul className="divide-y">{echeances.map(e => <li key={e.appel_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span>{formaterDate(e.date_echeance)} · {STATUTS_APPEL_LOYER[e.statut] ?? "État à vérifier"}</span>
          <span>{eur(e.montant_couvert)} réglés sur {eur(e.montant_du)}</span>
        </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Aucune échéance enregistrée.</p>}
    </section>
    <section className="rounded-xl border bg-card p-4" aria-labelledby="lecture-encaissements">
      <h2 id="lecture-encaissements" className="text-base font-semibold">Encaissements déclarés</h2>
      {indisponibles.encaissements ? <p role="alert">Les encaissements sont indisponibles.</p> : encaissements.length ?
        <ul className="divide-y">{encaissements.map(e => <li key={e.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{formaterDate(e.date_paiement)}</span><strong>{eur(e.montant)}</strong></div>{e.note && <p>{e.note}</p>}</li>)}</ul>
        : <p className="mt-2 text-sm text-muted-foreground">Aucun encaissement déclaré.</p>}
    </section>
    <section className="rounded-xl border bg-card p-4" aria-labelledby="lecture-edls">
      <h2 id="lecture-edls" className="text-base font-semibold">États des lieux</h2>
      {indisponibles.edls ? <p role="alert">Les états des lieux sont indisponibles.</p> : edls.length ?
        <ul className="divide-y">{edls.map(e => <li key={e.id}><Link className="inline-flex min-h-11 items-center text-sm underline" href={`${base}/baux/${bailId}/edl/${e.id}`}>{e.type === "entree" ? "Entrée" : e.type === "sortie" ? "Sortie" : "Intermédiaire"} · {etatsEdl[e.etat] ?? "État à vérifier"}</Link></li>)}</ul>
        : <p className="mt-2 text-sm text-muted-foreground">Aucun état des lieux enregistré.</p>}
    </section>
    {historique}
  </div>;
}

/** Les données secondaires restent consultables sans alourdir le premier écran. */
export function HistoriqueBailLecture({ titre, erreur, children }: { titre: string; erreur?: boolean; children: ReactNode }) {
  return <details className="rounded-xl border bg-card p-4">
    <summary className="cursor-pointer font-semibold">{titre}</summary>
    <div className="mt-3 space-y-3 text-sm">{erreur ? <p role="alert">Ces informations sont indisponibles. Rechargez la page.</p> : children}</div>
  </details>;
}
