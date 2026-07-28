"use client";

import { useState, useTransition } from "react";
import { lancerPurge, type ResultatPurge } from "@/app/actions/retention";
import { Button } from "@/components/ui/button";

export function BoutonPurge({ fichiersEnAttente }: { fichiersEnAttente: number }) {
  const [resultat, setResultat] = useState<ResultatPurge | null>(null);
  const [enCours, demarrer] = useTransition();

  function purger() {
    setResultat(null);
    demarrer(async () => {
      setResultat(await lancerPurge());
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <Button onClick={purger} disabled={enCours}>
        {enCours ? "Purge en cours…" : "Lancer la purge maintenant"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Applique les règles de conservation (documents échus, journaux,
        alertes) puis supprime physiquement les fichiers en file
        {fichiersEnAttente > 0 && ` (${fichiersEnAttente} en attente)`}.
      </p>
      {resultat?.erreur && (
        <p className="w-full text-sm text-destructive">{resultat.erreur}</p>
      )}
      {resultat && !resultat.erreur && (
        <p className="w-full text-sm text-emerald-700 dark:text-emerald-400">
          Purge effectuée : {resultat.documents_purges} document(s) purgé(s),{" "}
          {resultat.fichiers_supprimes} fichier(s) supprimé(s) physiquement,
          journaux nettoyés (
          {Object.entries(resultat.journaux ?? {})
            .map(([k, v]) => `${k} : ${v}`)
            .join(", ")}
          ).
        </p>
      )}
    </div>
  );
}
