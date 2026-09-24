"use client";

import { useState, useTransition } from "react";
import { lancerPurge, type ResultatPurge } from "@/app/actions/retention";
import { Spinner } from "@/components/ui/spinner";

// L'en-tête de la page et son action principale ne font plus qu'un (24/09) :
// le bouton vivait dans une boîte à part sous le titre. Le composant porte
// l'en-tête pour que le résultat du nettoyage s'affiche juste dessous.
// « Nettoyage » partout : le bouton disait « purge », la carte des règles et
// le journal d'audit « nettoyage ».
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

export function BoutonPurge({
  fichiersEnAttente,
  children,
}: {
  fichiersEnAttente: number;
  children: React.ReactNode;
}) {
  const [resultat, setResultat] = useState<ResultatPurge | null>(null);
  const [enCours, demarrer] = useTransition();

  function nettoyer() {
    setResultat(null);
    demarrer(async () => {
      setResultat(await lancerPurge());
    });
  }

  return (
    <>
      <div className="entete-page mb-6">
        <div className="min-w-0 flex-[1_1_20rem]">
          {children}
          <p className="mt-2 text-sm text-muted-foreground">
            Applique les règles de conservation (documents échus, journaux,
            alertes) puis supprime les fichiers en attente de suppression
            {fichiersEnAttente > 0 && ` (${fichiersEnAttente} en attente)`}.
          </p>
        </div>
        <button type="button" onClick={nettoyer} disabled={enCours} className="btn-or">
          {enCours ? <><Spinner /> Nettoyage en cours…</> : "Lancer le nettoyage maintenant"}
        </button>
      </div>
      {resultat?.erreur && (
        <p role="alert" className="mb-6 text-sm text-destructive">{resultat.erreur}</p>
      )}
      {resultat && !resultat.erreur && (
        <p role="status" className="mb-6 text-sm text-success-soft-foreground">
          Nettoyage effectué : {resultat.documents_purges} document(s) supprimé(s),{" "}
          {resultat.fichiers_supprimes} fichier(s) supprimé(s) définitivement,
          journaux nettoyés (
          {Object.entries(resultat.journaux ?? {})
            .map(([k, v]) => `${JOURNAUX[k] ?? "autres traces"} : ${v}`)
            .join(", ")}
          ).
        </p>
      )}
    </>
  );
}
