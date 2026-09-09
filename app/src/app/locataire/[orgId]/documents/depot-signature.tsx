"use client";

import { useActionState } from "react";
import {
  retournerDocumentSigne,
  type EtatRetourSignature,
} from "@/app/actions/signature-locataire";
import { formaterDate } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

// Une demande de signature : télécharger le document, le signer, déposer le
// signé — la demande se solde toute seule et le gestionnaire est prévenu.
export function DepotSignature({
  orgId,
  demande,
}: {
  orgId: string;
  demande: { id: string; document_id: string; titre: string | null; demandee_le: string };
}) {
  const [etat, action] = useActionState<EtatRetourSignature, FormData>(
    retournerDocumentSigne.bind(null, orgId, demande.id),
    {}
  );

  if (etat.succes) {
    return (
      <div className="py-2.5 text-sm text-success-soft-foreground">
        ✓ {demande.titre ?? "Document"} signé et déposé — votre gestionnaire est
        prévenu.
      </div>
    );
  }

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">
          <b className="font-medium">{demande.titre ?? "Document"}</b>
          <small className="block text-muted-foreground">
            demandé le {formaterDate(demande.demandee_le)} — téléchargez,
            signez, puis déposez le signé
          </small>
        </span>
        <a
          href={`/locataire/${orgId}/documents/${demande.document_id}/fichier`}
          target="_blank"
          rel="noreferrer"
          className="lien-discret text-sm"
        >
          Télécharger
        </a>
      </div>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="fichier"
          required
          accept=".pdf,.jpg,.jpeg,.png"
          aria-label={`Document signé — ${demande.titre ?? "document"}`}
          className="text-sm"
        />
        <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
          Déposer le signé
        </BoutonEnvoi>
      </form>
      {etat.erreur && <p className="mt-1.5 text-sm text-destructive">{etat.erreur}</p>}
    </div>
  );
}
