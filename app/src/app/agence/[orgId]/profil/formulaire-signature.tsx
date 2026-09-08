"use client";

import { useActionState, useTransition } from "react";
import {
  enregistrerSignature,
  retirerSignature,
  type EtatSignature,
} from "@/app/actions/signature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { afficherToast } from "@/components/ui/toast";

export function FormulaireSignature({
  orgId,
  // La signature actuelle, en data-URI (préparée côté serveur) — null : aucune
  apercu,
  lectureSeule,
}: {
  orgId: string;
  apercu: string | null;
  lectureSeule: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatSignature, FormData>(
    enregistrerSignature.bind(null, orgId),
    {}
  );
  const [retraitEnCours, demarrerRetrait] = useTransition();

  return (
    <div className="space-y-3">
      {apercu ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={apercu}
            alt="Signature enregistrée"
            className="max-h-16 rounded border border-border bg-white p-2"
          />
          {!lectureSeule && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retraitEnCours}
              onClick={() =>
                demarrerRetrait(async () => {
                  const res = await retirerSignature(orgId);
                  if (res.succes) afficherToast(res.succes);
                })
              }
            >
              {retraitEnCours ? "…" : "Retirer"}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune signature enregistrée — la zone de signature reste vierge sur
          les documents générés.
        </p>
      )}

      {!lectureSeule && (
        <form action={action} className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="sig-fichier">
              {apercu ? "Remplacer la signature" : "Déposer une signature"} (PNG/JPEG, 1 Mo max)
            </Label>
            <Input id="sig-fichier" name="fichier" type="file" accept=".png,.jpg,.jpeg" required />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
          {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
        </form>
      )}
    </div>
  );
}
