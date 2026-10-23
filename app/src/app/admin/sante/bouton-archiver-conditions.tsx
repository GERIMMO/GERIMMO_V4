"use client";

import { archiverConditionsEnVigueur, type EtatArchivageConditions } from "@/app/actions/conditions-versions";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";

/** Le bouton d'archivage et le compte rendu de chaque document (24/10, plan de conformité R12). */
export function BoutonArchiverConditions({ autorise }: { autorise: boolean }) {
  const [etat, action, enCours] = useActionState<EtatArchivageConditions, FormData>(archiverConditionsEnVigueur, {});
  return (
    <div className="space-y-2">
      <form action={action} data-saisie-confirmee>
        <BoutonEnvoi variant="outline" enCours={enCours} enCoursTexte="Archivage…" disabled={!autorise}>
          Archiver la version en vigueur des conditions
        </BoutonEnvoi>
      </form>
      {!autorise && (
        <p className="text-sm text-[var(--texte-secondaire)]">
          Réservé au compte de supervision permanent, avec second facteur.
        </p>
      )}
      {etat.erreur && <p role="alert" className="err text-sm">{etat.erreur}</p>}
      {etat.resultats && (
        <ul role="status" className="space-y-1 text-sm [overflow-wrap:anywhere]">
          {etat.resultats.map((r) => (
            <li key={`${r.document}-${r.version}`} className={r.statut === "empreinte_differente" || r.statut === "echec" ? "err" : undefined}>
              {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
