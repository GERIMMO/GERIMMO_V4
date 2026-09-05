"use client";

import { useState, useActionState } from "react";
import { donnerMonConge, type EtatConge } from "@/app/actions/conge-locataire";
import { Button } from "@/components/ui/button";
import { formaterDate } from "@/lib/ged";

// « Vous quittez le logement ? » (maquette v10) : le congé se donne ici en
// deux minutes — préavis annoncé avant l'envoi, suivi par étapes ensuite.
export function CarteConge({
  orgId,
  enPreavis,
  dateFin,
  preavisMois,
}: {
  orgId: string;
  // Le bail est déjà en préavis : on montre la suite, pas le formulaire
  enPreavis: boolean;
  dateFin: string | null;
  // 1 (meublé ou zone tendue) ou 3 — calculé par la page depuis le bail
  preavisMois: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatConge, FormData>(
    donnerMonConge.bind(null, orgId),
    {}
  );
  const finAffichee = etat.dateFin ?? dateFin;

  if (enPreavis || etat.succes) {
    return (
      <div className="loc-carte">
        <h3 className="text-base font-medium">Votre congé est enregistré</h3>
        <div className="mt-2.5">
          <div className="loc-etape f">
            <span className="pt" />
            <span>
              Congé reçu — préavis de {preavisMois} mois
              {finAffichee ? `, fin de bail le ${formaterDate(finAffichee)}` : ""}
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>État des lieux de sortie à planifier — votre gestionnaire vous propose des créneaux</span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              Dépôt de garantie restitué sous 1 mois après un état des lieux
              conforme (2 mois si des retenues sont justifiées)
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="loc-carte">
      {!ouvert ? (
        <>
          <h3 className="text-base font-medium">Vous quittez le logement ?</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Le congé se donne ici en deux minutes — et tout ce qui suit (état
            des lieux, dépôt de garantie) s&apos;organise pour vous.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setOuvert(true)}
          >
            Donner mon congé
          </Button>
        </>
      ) : (
        <form action={action}>
          <h3 className="text-base font-medium">Donner votre congé</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Votre préavis est de <b className="font-semibold">{preavisMois} mois</b>
            {preavisMois === 1 ? " (logement meublé ou zone tendue)" : ""} : il
            court à compter d&apos;aujourd&apos;hui, jour de sa remise par votre
            espace. Votre bail prendra fin dans {preavisMois} mois — l&apos;envoi
            est définitif, seul votre gestionnaire pourra l&apos;annuler avec vous.
          </p>
          <label htmlFor="conge-motif" className="mt-3 block text-xs text-muted-foreground">
            Un mot pour votre gestionnaire (facultatif)
          </label>
          <input
            id="conge-motif"
            name="motif"
            placeholder="Mutation, achat, déménagement…"
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? "Envoi…" : "Envoyer mon congé"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
          {etat.erreur && <p className="mt-2 text-sm text-destructive">{etat.erreur}</p>}
        </form>
      )}
    </div>
  );
}
