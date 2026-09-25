"use client";

import { useActionState } from "react";
import {
  retournerDocumentSigne,
  type EtatRetourSignature,
} from "@/app/actions/signature-locataire";
import { formaterDate } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { ChampFichier } from "@/components/champ-fichier";
import { buttonVariants } from "@/components/ui/button";

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
          href={`/locataire/${orgId}/documents/${demande.document_id}/fichier?mode=telechargement`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Télécharger ${demande.titre ?? "le document"}`}
          className={`pointer-coarse:min-h-10 ${buttonVariants({ variant: "outline", size: "sm" })}`}
        >
          Télécharger
        </a>
      </div>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        {/* Champ fichier en français (25/09, D10) */}
        <ChampFichier
          id={`signature-${demande.id}`}
          name="fichier"
          required
          accept=".pdf,.jpg,.jpeg,.png"
          aria-label={`Document signé — ${demande.titre ?? "document"}`}
          className="w-full sm:w-auto sm:max-w-72"
        />
        <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
          Déposer le signé
        </BoutonEnvoi>
      </form>
      {etat.erreur && (
        <p className="err mt-1.5 !mb-0" role="alert">
          {etat.erreur}
        </p>
      )}
    </div>
  );
}
