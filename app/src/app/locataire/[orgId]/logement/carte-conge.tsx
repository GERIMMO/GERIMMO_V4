"use client";

import { useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { donnerMonConge, type EtatConge } from "@/app/actions/conge-locataire";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formaterDate } from "@/lib/ged";
import { interlocuteurMajuscule, type InterlocuteurLocataire } from "@/lib/interlocuteur-locataire";

// « Vous quittez le logement ? » — le congé se donne par lettre recommandée
// (elle seule fait courir le préavis, RM-A3) ; l'espace sert à prévenir le
// gestionnaire tout de suite (intention de congé) et à suivre la suite.
export function CarteConge({
  orgId,
  enPreavis,
  dateFin,
  preavisMois,
  zoneTendue = false,
  intentionDu,
  interlocuteur,
}: {
  orgId: string;
  // Le bail est déjà en préavis : le congé est enregistré, on montre la suite
  enPreavis: boolean;
  dateFin: string | null;
  // 1 (meublé) ou 3 — indicatif, calculé par la page depuis le bail
  preavisMois: number;
  /** Lot T1 : logement nu en zone tendue — un mois seulement si la lettre de congé le précise et le justifie. */
  zoneTendue?: boolean;
  // Une intention déjà transmise, pas encore confirmée par le gestionnaire
  intentionDu: string | null;
  /** Lot 47 : « gestionnaire » dans un espace d'agence, « bailleur » chez un propriétaire. */
  interlocuteur: InterlocuteurLocataire;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState<EtatConge, FormData>(
    donnerMonConge.bind(null, orgId),
    {}
  );

  if (enPreavis) {
    return (
      <div className="loc-carte">
        <h2 className="titre-carte text-base font-medium">Votre congé est enregistré</h2>
        <div className="mt-2.5">
          <div className="loc-etape f">
            <span className="pt" />
            <span>
              Congé confirmé par votre {interlocuteur}
              {dateFin ? ` — fin de bail le ${formaterDate(dateFin)}` : ""}
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              État des lieux de sortie le jour de la remise des clés — votre{" "}
              {interlocuteur} convient de la date avec vous
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              {/* Lot T3 (R11-A3) : le critère de l'article 22 est la conformité de l'état des lieux de sortie à celui
                  d'entrée, pas l'existence de retenues (« 2 mois si des retenues sont justifiées »). */}
              Dépôt de garantie restitué sous 1 mois après un état des lieux de
              sortie conforme à celui d’entrée (2 mois sinon)
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (intentionDu || etat.succes) {
    return (
      <div className="loc-carte">
        <h2 className="titre-carte text-base font-medium">Votre départ est annoncé</h2>
        <div className="mt-2.5">
          <div className="loc-etape f">
            <span className="pt" />
            <span>
              {interlocuteurMajuscule(interlocuteur)} prévenu
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
              à votre {interlocuteur} — c&apos;est elle qui fait courir votre
              préavis, à compter de sa réception effective
            </span>
          </div>
          <div className="loc-etape">
            <span className="pt" />
            <span>
              À réception, votre {interlocuteur} confirme la date de fin de bail —
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
          <h2 className="titre-carte text-base font-medium">Vous quittez le logement ?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Prévenez votre {interlocuteur} ici, puis envoyez votre congé par lettre
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
        <form data-saisie-confirmee action={action}>
          <h2 className="titre-carte text-base font-medium">Annoncer votre départ</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Votre préavis sera d&apos;environ{" "}
            <b className="font-semibold">{preavisMois} mois</b>
            {preavisMois === 1 ? " (logement meublé)" : ""} : il
            court à compter de la réception effective de votre{" "}
            <b className="font-semibold">lettre recommandée</b> — l&apos;annonce
            faite ici prévient votre {interlocuteur}, elle ne remplace pas le
            courrier.
          </p>
          {/* Les motifs qui réduisent le préavis (audit du 27/09) : le champ
              suggérait « Mutation… » sans dire que la mutation ramène le
              préavis à un mois — à condition de le justifier ([[Bail]],
              RM-1.10.5 : justificatif obligatoire). */}
          {preavisMois > 1 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Certaines situations ramènent le préavis à <b className="font-semibold">1 mois</b>{" "}
              : {zoneTendue ? "logement en zone tendue (c’est le cas du vôtre), " : ""}mutation, perte d&apos;emploi,
              bénéficiaire du RSA ou de l&apos;AAH, état de santé, violences conjugales… Indiquez-la dans votre
              lettre et joignez-y le justificatif — sans cela, le préavis reste de 3 mois.
            </p>
          )}
          <Label htmlFor="conge-motif" className="mt-3">
            Un mot pour votre {interlocuteur} (facultatif)
          </Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (audit 09/09) */}
          <input
            id="conge-motif"
            name="motif"
            defaultValue={etat.valeurs?.motif}
            placeholder="Mutation, achat, déménagement…"
            className="mt-1 h-11 w-full rounded-[var(--rayon-champ)] border border-input bg-transparent px-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
              Prévenir mon {interlocuteur}
            </BoutonEnvoi>
            <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
          {etat.erreur && (
            <p className="err mt-2 !mb-0" role="alert">
              {etat.erreur}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
