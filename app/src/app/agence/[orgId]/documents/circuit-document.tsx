"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  annulerDemandeSignature,
  partagerDocument,
} from "@/app/actions/signature";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { afficherToast } from "@/components/ui/toast";
import { formaterDate } from "@/lib/ged";

export type DemandeDuDocument = {
  id: string;
  personNom: string;
  demandee_le: string;
  signee_le: string | null;
  document_retour_id: string | null;
  prestataire?: string | null;
  external_status?: string | null;
  preuve_document_id?: string | null;
};

// Partage et historique des anciennes demandes. Les nouveaux engagements
// utilisent le circuit Zoho de leur fiche ; aucun nouveau retour manuel.
// Ancien fonctionnement :
// — « Mettre à disposition » (RM-12 : la mise à disposition est un GESTE) rend
//   une quittance ou un courrier visible dans « Mes documents » du locataire ;
// — « Envoyer pour signature » (bail, courrier, quittance — jamais un EDL,
//   RM-13.1.6) le place dans « À signer » de son espace : il télécharge,
//   signe, dépose le signé, le retour vous alerte (Yousign : S10) ;
// — chaque demande s'affiche (en attente / signée) et s'annule.
const TYPES_PARTAGEABLES = ["quittance", "courrier"];

export function CircuitDocument({
  orgId,
  documentId,
  type,
  partageLe,
  signataires,
  demandes,
  lienFermer,
}: {
  orgId: string;
  documentId: string;
  type: string;
  partageLe: string | null;
  // Les personnes rattachées au document (signataires possibles)
  signataires: { id: string; nom: string }[];
  demandes: DemandeDuDocument[];
  lienFermer: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const partageable = TYPES_PARTAGEABLES.includes(type) && signataires.length > 0;
  if (!partageable && demandes.length === 0) return null;

  const agir = (action: () => Promise<{ erreur?: string; succes?: string }>) =>
    demarrer(async () => {
      const res = await action();
      setErreur(res.erreur ?? null);
      if (res.succes) afficherToast(res.succes);
    });

  return (
    <div className="mt-3 space-y-2.5 border-t border-border pt-3">
      {partageable && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {partageLe ? (
            <>
              <span className="text-muted-foreground">
                Mis à disposition du locataire le {formaterDate(partageLe)}.
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={enCours}
                onClick={() => agir(() => partagerDocument(orgId, documentId, false))}
              >
                {enCours && <Spinner />}
                Retirer de son espace
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enCours}
              onClick={() => agir(() => partagerDocument(orgId, documentId, true))}
            >
              {enCours && <Spinner />}
              Mettre à disposition du locataire
            </Button>
          )}
        </div>
      )}

      {demandes.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
          {d.signee_le ? (
            <>
              <span className="text-success-soft-foreground">
                ✓ Signé par {d.personNom} le {formaterDate(d.signee_le)}
              </span>
              {d.document_retour_id && (
                <Link
                  href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${d.document_retour_id}`}
                  className="lien-discret text-xs"
                >
                  Ouvrir le signé
                </Link>
              )}
              {d.preuve_document_id && (
                <Link
                  href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${d.preuve_document_id}`}
                  className="lien-discret text-xs"
                >
                  Dossier de preuve
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="text-warning-soft-foreground">
                En attente de {d.prestataire === "youtrust" ? "signature électronique" : "signature"} — {d.personNom}, demandée le{" "}
                {formaterDate(d.demandee_le)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={enCours}
                onClick={() => agir(() => annulerDemandeSignature(orgId, d.id))}
              >
                {enCours && <Spinner />}
                Annuler
              </Button>
            </>
          )}
        </div>
      ))}

      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
