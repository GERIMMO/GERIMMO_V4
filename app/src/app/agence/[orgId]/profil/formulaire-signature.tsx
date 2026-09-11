"use client";

import { useActionState, useState, useTransition } from "react";
import {
  enregistrerSignature,
  retirerSignature,
  type EtatSignature,
} from "@/app/actions/signature";
import { Button } from "@/components/ui/button";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modale } from "@/components/ui/modale";
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
  const [etat, action] = useActionState<EtatSignature, FormData>(
    enregistrerSignature.bind(null, orgId),
    {}
  );
  const [retraitEnCours, demarrerRetrait] = useTransition();
  // Relevé 11/09 : « Retirer » partait au premier tap — un geste qui vide la
  // zone de signature de TOUS les documents à venir — et son `res.erreur`
  // était jeté : quand le retrait échouait, l'écran ne bougeait pas et la
  // signature semblait retirée. Confirmation d'abord, échec dit ensuite.
  const [confirmeRetrait, setConfirmeRetrait] = useState(false);
  const [erreurRetrait, setErreurRetrait] = useState<string | null>(null);

  const retirer = () => {
    setConfirmeRetrait(false);
    setErreurRetrait(null);
    demarrerRetrait(async () => {
      const res = await retirerSignature(orgId);
      if (res.erreur) setErreurRetrait(res.erreur);
      else if (res.succes) afficherToast(res.succes);
    });
  };

  return (
    <div className="space-y-3">
      {apercu ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={apercu}
            alt="Signature enregistrée"
            className="max-h-16 rounded border border-border bg-[var(--ivoire)] p-2"
          />
          {!lectureSeule && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retraitEnCours}
              onClick={() => setConfirmeRetrait(true)}
            >
              {retraitEnCours ? (
                <>
                  <Spinner /> Retrait…
                </>
              ) : (
                "Retirer"
              )}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune signature enregistrée — la zone de signature reste vierge sur
          les documents générés.
        </p>
      )}

      {erreurRetrait && (
        <p role="alert" className="text-sm text-destructive">
          {erreurRetrait}
        </p>
      )}

      {confirmeRetrait && (
        <Modale
          titre="Retirer la signature"
          surtitre="Tous les documents à venir"
          variante="critique"
          fermer={() => setConfirmeRetrait(false)}
          pied={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmeRetrait(false)}
              >
                Annuler
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={retirer}>
                Retirer
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            La zone de signature restera vierge sur TOUS les documents émis
            ensuite — quittances, reçus, courriers. Les documents déjà générés
            ne changent pas, et vous pourrez déposer une nouvelle signature à
            tout moment.
          </p>
        </Modale>
      )}

      {!lectureSeule && (
        <form action={action} className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="sig-fichier">
              {apercu ? "Remplacer la signature" : "Déposer une signature"} (PNG/JPEG, 1 Mo max)
            </Label>
            <Input id="sig-fichier" name="fichier" type="file" accept=".png,.jpg,.jpeg" required />
          </div>
          <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Enregistrement…">
            Enregistrer
          </BoutonEnvoi>
          {etat.erreur && (
            <p role="alert" className="text-sm text-destructive">
              {etat.erreur}
            </p>
          )}
          {etat.succes && (
            <p role="status" className="text-sm text-success-soft-foreground">
              {etat.succes}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
