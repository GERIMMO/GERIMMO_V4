"use client";

import { useState, useTransition } from "react";
import { lancerPurge, type ResultatPurge } from "@/app/actions/retention";
import { Spinner } from "@/components/ui/spinner";

// Les journaux nettoyés, dans les mots de la page plutôt que par leur nom de
// table.
const JOURNAUX: Record<string, string> = {
  tech_log: "historique du service",
  acces_pieces_log: "accès aux pièces",
  audit_log: "journal d’audit",
  alertes: "alertes traitées",
  demandes_devis: "demandes de devis",
  intentions_conge: "intentions de congé",
  demandes_signature: "demandes de signature",
};

// 25/09 (audit C11) : le nettoyage est un geste destructif. Il n'est plus le
// bouton principal du bandeau : bouton secondaire, deuxième clic de
// confirmation qui dit ce qui sera supprimé (les fichiers en attente comptés
// ici, les documents et journaux échus selon les règles de conservation).
export function BoutonPurge({ fichiersEnAttente }: { fichiersEnAttente: number }) {
  const [resultat, setResultat] = useState<ResultatPurge | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, demarrer] = useTransition();

  function nettoyer() {
    setResultat(null);
    setConfirmation(false);
    demarrer(async () => {
      setResultat(await lancerPurge());
    });
  }

  return (
    <div className="space-y-2">
      {!confirmation ? (
        <button type="button" onClick={() => setConfirmation(true)} disabled={enCours} className="btn-secondaire">
          {enCours ? <><Spinner /> Nettoyage en cours…</> : "Lancer le nettoyage maintenant"}
        </button>
      ) : (
        <div role="group" aria-label="Confirmer le nettoyage" className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning-soft-foreground)]">
          <p>
            Le nettoyage supprime définitivement {fichiersEnAttente} fichier{fichiersEnAttente > 1 ? "s" : ""} en attente
            et applique les règles de conservation aux documents et journaux arrivés à échéance. Cette action est irréversible.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={nettoyer} className="btn-or">Confirmer le nettoyage</button>
            <button type="button" onClick={() => setConfirmation(false)} className="btn-secondaire">Annuler</button>
          </div>
        </div>
      )}
      {resultat?.erreur && (
        <p role="alert" className="text-sm text-destructive">{resultat.erreur}</p>
      )}
      {resultat && !resultat.erreur && (
        <p role="status" className="text-sm text-success-soft-foreground">
          Nettoyage effectué : {resultat.documents_purges} document(s) supprimé(s),{" "}
          {resultat.fichiers_supprimes} fichier(s) supprimé(s) définitivement,
          journaux nettoyés (
          {Object.entries(resultat.journaux ?? {})
            .map(([k, v]) => `${JOURNAUX[k] ?? "autres traces"} : ${v}`)
            .join(", ")}
          ).
        </p>
      )}
    </div>
  );
}
