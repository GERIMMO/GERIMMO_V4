"use client";

import { useState, useActionState } from "react";
import { donnerMonConge, type EtatConge } from "@/app/actions/conge-locataire";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { formaterDate } from "@/lib/ged";

// « Vous quittez le logement ? » — le congé se donne par lettre recommandée
// (elle seule fait courir le préavis, RM-A3) ; l'espace sert à prévenir le
// gestionnaire tout de suite (intention de congé) et à suivre la suite.
export function CarteConge({
  orgId,
  enPreavis,
  dateFin,
  preavisMois,
  intentionDu,
}: {
  orgId: string;
  // Le bail est déjà en préavis : le congé est enregistré, on montre la suite
  enPreavis: boolean;
  dateFin: string | null;
  // 1 (meublé ou zone tendue) ou 3 — indicatif, calculé par la page depuis le bail
  preavisMois: number;
  // Une intention déjà transmise, pas encore confirmée par le gestionnaire
  intentionDu: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState<EtatConge, FormData>(
    donnerMonConge.bind(null, orgId),
    {}
  );

  if (enPreavis) {
    return (
      <div className="loc-carte">
        <h3 className="text-base font-medium">Votre congé est enregistré</h3>
        <div className="mt-2.5">
          <div className="loc-etape f">
            <span className="pt" />
            <span>
              Congé confirmé par votre gestionnaire
              {dateFin ? ` — fin de bail le ${formaterDate(dateFin)}` : ""}
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              État des lieux de sortie le jour de la remise des clés — votre
              gestionnaire convient de la date avec vous
            </span>
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

  if (intentionDu || etat.succes) {
    return (
      <div className="loc-carte">
        <h3 className="text-base font-medium">Votre départ est annoncé</h3>
        <div className="mt-2.5">
          <div className="loc-etape f">
            <span className="pt" />
            <span>
              Gestionnaire prévenu
              {intentionDu ? ` le ${formaterDate(intentionDu)}` : ""}
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              <b className="font-semibold">
                Envoyez votre congé par lettre recommandée avec accusé de
                réception
              </b>{" "}
              à votre gestionnaire — c&apos;est elle qui fait courir votre
              préavis, à compter de sa première présentation
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              À réception, votre gestionnaire confirme la date de fin de bail —
              vous la verrez ici
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
            Prévenez votre gestionnaire ici, puis envoyez votre congé par lettre
            recommandée — tout ce qui suit (état des lieux, dépôt de garantie)
            s&apos;organise ensuite.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setOuvert(true)}
          >
            Annoncer mon départ
          </Button>
        </>
      ) : (
        <form action={action}>
          <h3 className="text-base font-medium">Annoncer votre départ</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Votre préavis sera d&apos;environ{" "}
            <b className="font-semibold">{preavisMois} mois</b>
            {preavisMois === 1 ? " (logement meublé ou zone tendue)" : ""} : il
            court à compter de la première présentation de votre{" "}
            <b className="font-semibold">lettre recommandée</b> — l&apos;annonce
            faite ici prévient votre gestionnaire, elle ne remplace pas le
            courrier.
          </p>
          <label htmlFor="conge-motif" className="mt-3 block text-xs text-muted-foreground">
            Un mot pour votre gestionnaire (facultatif)
          </label>
          {/* En erreur, la saisie est reposée via etat.valeurs (audit 09/09) */}
          <input
            id="conge-motif"
            name="motif"
            defaultValue={etat.valeurs?.motif}
            placeholder="Mutation, achat, déménagement…"
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
              Prévenir mon gestionnaire
            </BoutonEnvoi>
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
