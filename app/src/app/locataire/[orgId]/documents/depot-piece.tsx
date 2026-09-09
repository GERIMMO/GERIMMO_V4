"use client";

import { useActionState } from "react";
import { deposerMaPiece, type EtatPieceDemandee } from "@/app/actions/pieces-demandees";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { formaterDate } from "@/lib/ged";

export type DemandePiece = {
  id: string;
  type: string;
  libelle: string;
  note: string | null;
  demandee_le: string;
  relancee_le: string | null;
};

// Une pièce réclamée par le gestionnaire : la ligne porte son dépôt —
// choisir le fichier, envoyer, c'est réglé (RM-0b.2.5).
export function DepotPiece({ orgId, demande }: { orgId: string; demande: DemandePiece }) {
  const [etat, action] = useActionState<EtatPieceDemandee, FormData>(
    deposerMaPiece.bind(null, orgId, demande.id),
    {}
  );

  if (etat.succes) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
        <span className="min-w-0 flex-1">
          <b className="font-medium">{demande.libelle}</b>
        </span>
        <span className="loc-tag vert">✓ Déposée — votre agence est notifiée</span>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <b className="font-medium">{demande.libelle}</b>
        <small className="block text-muted-foreground">
          demandée le {formaterDate(demande.demandee_le)}
          {demande.relancee_le ? ` · relancée le ${formaterDate(demande.relancee_le)}` : ""}
          {demande.note ? ` · ${demande.note}` : ""} — une photo lisible suffit
        </small>
      </span>
      <input
        type="file"
        name="fichier"
        accept=".pdf,.jpg,.jpeg,.png"
        required
        aria-label={`Fichier pour ${demande.libelle}`}
        className="max-w-48 text-xs"
      />
      <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
        Déposer
      </BoutonEnvoi>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}
