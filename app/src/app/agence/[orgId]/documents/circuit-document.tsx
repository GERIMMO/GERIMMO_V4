"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  annulerDemandeSignature,
  envoyerPourSignature,
  partagerDocument,
} from "@/app/actions/signature";
import { Button } from "@/components/ui/button";
import { afficherToast } from "@/components/ui/toast";
import { formaterDate } from "@/lib/ged";

export type DemandeDuDocument = {
  id: string;
  personNom: string;
  demandee_le: string;
  signee_le: string | null;
  document_retour_id: string | null;
};

// Ce que le document peut vivre depuis sa fiche (audit 09/09) :
// — « Mettre à disposition » (RM-12 : la mise à disposition est un GESTE) rend
//   une quittance ou un courrier visible dans « Mes documents » du locataire ;
// — « Envoyer pour signature » (bail, courrier, quittance — jamais un EDL,
//   RM-13.1.6) le place dans « À signer » de son espace : il télécharge,
//   signe, dépose le signé, le retour vous alerte (Yousign : S10) ;
// — chaque demande s'affiche (en attente / signée) et s'annule.
const TYPES_PARTAGEABLES = ["quittance", "courrier"];
const TYPES_SIGNABLES = ["bail", "courrier", "quittance"];

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
  const [choix, setChoix] = useState(signataires[0]?.id ?? "");

  const partageable = TYPES_PARTAGEABLES.includes(type) && signataires.length > 0;
  const enAttente = demandes.filter((d) => !d.signee_le);
  const signable =
    TYPES_SIGNABLES.includes(type) && signataires.length > 0 && enAttente.length === 0;

  if (!partageable && !signable && demandes.length === 0) return null;

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
            </>
          ) : (
            <>
              <span className="text-warning-soft-foreground">
                En attente de signature — {d.personNom}, demandée le{" "}
                {formaterDate(d.demandee_le)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={enCours}
                onClick={() => agir(() => annulerDemandeSignature(orgId, d.id))}
              >
                Annuler
              </Button>
            </>
          )}
        </div>
      ))}

      {signable && (
        <div className="flex flex-wrap items-center gap-2">
          {signataires.length > 1 && (
            <select
              value={choix}
              onChange={(e) => setChoix(e.target.value)}
              aria-label="Signataire"
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {signataires.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={enCours || !choix}
            onClick={() => agir(() => envoyerPourSignature(orgId, documentId, choix))}
          >
            {enCours ? "Envoi…" : "Envoyer pour signature"}
          </Button>
        </div>
      )}

      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
