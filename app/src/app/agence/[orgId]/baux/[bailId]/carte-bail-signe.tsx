"use client";

import { useState, useTransition } from "react";
import { corrigerBail, envoyerBailSigne } from "@/app/actions/baux";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { afficherToast } from "@/components/ui/toast";
import { formaterDateHeure } from "@/lib/ged";

// Bail signé déposé (sprint « Alertes & documents ») : prévisualisation dans
// la modale unique, puis « Envoyer » au locataire renseigné ou « Corriger »
// (retour au brouillon tant qu'aucun loyer n'a été appelé). Le toast se
// déclenche à la résolution de l'action, jamais dans un effet.
export function CarteBailSigne({
  orgId,
  bailId,
  documentId,
  envoyeLe,
  locataireEmail,
  corrigeable,
  actif = true,
}: {
  orgId: string;
  bailId: string;
  documentId: string;
  envoyeLe: string | null;
  locataireEmail: string | null;
  corrigeable: boolean;
  // Un vieux brouillon peut porter un PDF sans être actif (données d'avant le
  // 30/08) : le texte ne doit pas mentir sur l'état du bail.
  actif?: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [confirmerCorrection, setConfirmerCorrection] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const fichier = `/agence/${orgId}/documents/${documentId}/fichier`;

  function envoyer() {
    setErreur(null);
    demarrer(async () => {
      const res = await envoyerBailSigne(orgId, bailId);
      if (res.erreur) setErreur(res.erreur);
      else {
        afficherToast(res.succes ?? "Bail envoyé.");
        setOuverte(false);
      }
    });
  }

  function corriger() {
    setErreur(null);
    demarrer(async () => {
      const res = await corrigerBail(orgId, bailId);
      if (res.erreur) setErreur(res.erreur);
      else {
        afficherToast(res.succes ?? "Bail remis en brouillon.");
        setOuverte(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-success-soft-foreground">
        {actif ? "Bail signé déposé — le bail est actif." : "Un PDF signé est déposé, mais le bail est resté en brouillon : redéposez-le pour l'activer, ou corrigez le brouillon."}
        {envoyeLe && (
          <span className="text-muted-foreground"> Envoyé au locataire le {formaterDateHeure(envoyeLe)}.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOuverte(true)}>
          Prévisualiser
        </Button>
        <a href={fichier} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Ouvrir dans un onglet
        </a>
      </div>

      {ouverte && (
        <Modale
          titre="Bail signé"
          surtitre={locataireEmail ? `Locataire : ${locataireEmail}` : "Locataire sans email"}
          large
          haut
          fermer={() => setOuverte(false)}
          pied={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {erreur && <p className="w-full text-sm text-destructive">{erreur}</p>}
              {corrigeable &&
                (confirmerCorrection ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Le bail revient en brouillon, le lot redevient disponible, le PDF est détaché.
                    </span>
                    <Button type="button" size="sm" variant="destructive" disabled={enCours} onClick={corriger}>
                      Confirmer la correction
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={enCours}
                    onClick={() => setConfirmerCorrection(true)}
                  >
                    Corriger
                  </Button>
                ))}
              <Button type="button" size="sm" disabled={enCours || !locataireEmail} onClick={envoyer}>
                {enCours ? "…" : envoyeLe ? "Renvoyer" : "Envoyer au locataire"}
              </Button>
            </div>
          }
        >
          {/* Le PDF déposé, tel que le locataire le verra dans « Mes documents » */}
          <iframe
            src={fichier}
            title="Aperçu du bail signé"
            className="h-[60vh] w-full border border-border bg-muted"
          />
        </Modale>
      )}
    </div>
  );
}
