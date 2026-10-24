import type { ReactNode } from "react";
import type { DureePublique } from "@/lib/conservation-publique";
import { dureeConservation, effetConservation } from "@/lib/conservation-reglages";

/** Les références V1 restent lisibles, sans annoncer une ancienne durée comme actuelle. */
export function ReferenceConservation({ children, modifiee }: { children: ReactNode; modifiee: boolean }) {
  return modifiee ? <details><summary className="cursor-pointer font-semibold">Référence initiale du 24 octobre 2026 — les modifications ci-dessus s’appliquent</summary><div className="mt-4 space-y-4">{children}</div></details> : <>{children}</>;
}

export function DureesActuelles({ regles, indisponible }: { regles: DureePublique[]; indisponible: boolean }) {
  const modifications = regles.filter(r => r.duree_mois !== r.duree_initiale_mois);
  return <div id="durees-actuelles" className="space-y-4 scroll-mt-8">
    {indisponible && <p role="status">Les réglages actuels sont momentanément indisponibles. Les durées ci-dessous sont celles de la publication du 24 octobre 2026 ; contactez Gerimmo pour confirmer une échéance.</p>}
    {!!modifications.length && <section className="rounded-lg border border-blue-200 bg-blue-50 p-4" aria-label="Durées modifiées depuis la V1"><h3 className="font-semibold">Durées en vigueur modifiées depuis le 24 octobre 2026</h3><p className="mt-2 text-sm">Ces durées remplacent les valeurs correspondantes de la référence initiale ci-dessous. Les contrats et archives déjà constitués restent soumis à leurs engagements propres.</p><ul className="mt-3 divide-y">{modifications.map(r => <li key={r.data_type} className="py-3"><p><strong>{r.libelle} : {dureeConservation(r.duree_mois)}</strong></p><p className="text-sm">À partir de : {r.declencheur}. {effetConservation(r)}</p></li>)}</ul></section>}
    {regles.some(r => !r.actif) && <details><summary className="cursor-pointer">Catégories dont le nettoyage automatique est désactivé</summary><p className="mt-2 text-sm">Les durées restent les références de traitement. Pour ces catégories, leur application demande une intervention ; un nettoyage automatique n’est pas confirmé.</p><ul className="mt-2 list-disc pl-5 text-sm">{regles.filter(r => !r.actif).map(r => <li key={r.data_type}>{r.libelle} · {dureeConservation(r.duree_mois)}</li>)}</ul></details>}
  </div>;
}
