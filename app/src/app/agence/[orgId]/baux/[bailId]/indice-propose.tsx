"use client";

import { useState, useTransition } from "react";
import { chercherIndiceRevision, type RetourPropositionIndice } from "@/app/actions/indice-revision";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formaterDate } from "@/lib/ged";
import { indiceEnClair, memeIndice } from "@/lib/indice-revision";
import { URL_SERIE_INSEE_IRL } from "@/lib/outils/irl";
import { AIDE_BOUTON_EN_ATTENTE, useHydrate } from "@/lib/use-hydrate";

const LienSerie = ({ children }: { children: string }) => (
  <a className="underline underline-offset-2" href={URL_SERIE_INSEE_IRL} target="_blank" rel="noreferrer">{children}</a>
);

/**
 * « Chercher l'indice publié par l'Insee » (audit palier 1, P1-13) : le bailleur n'a plus à relever l'indice à la main.
 *
 * Le geste lit la série officielle, propose l'indice du trimestre du bail et le reporte dans le formulaire — où il
 * reste modifiable. Il dit d'où vient la valeur et quand elle a été lue. Quand l'Insee ne répond pas, ou que le bail ne
 * dit pas quel trimestre chercher, il le dit et la saisie à la main reste possible : rien n'est jamais supposé.
 */
export function IndicePropose({
  orgId,
  bailId,
  dateDemande,
  surProposition,
}: {
  orgId: string;
  bailId: string;
  /** La date de la demande saisie dans le formulaire : elle dit de quelle date de révision on cherche l'indice. */
  dateDemande?: string;
  /** Reporte la proposition dans les champs du formulaire de révision. */
  surProposition: (p: { valeur: number; trimestre: number; annee: number; precedent: number | null }) => void;
}) {
  const pret = useHydrate();
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<RetourPropositionIndice | null>(null);

  const chercher = () => demarrer(async () => {
    try {
      const r = await chercherIndiceRevision(orgId, bailId, dateDemande);
      setRetour(r);
      if ("proposition" in r && r.proposition.etat === "propose") {
        surProposition({ valeur: r.proposition.valeur, trimestre: r.proposition.trimestre, annee: r.proposition.annee, precedent: r.proposition.precedent?.valeur ?? null });
      }
    } catch {
      setRetour({ erreur: "La recherche n’a pas abouti. Saisissez l’indice vous-même." });
    }
  });

  return (
    <div className="w-full space-y-1.5" data-indice-propose>
      <Button type="button" size="sm" variant="outline" disabled={!pret || enCours} aria-busy={enCours || undefined}
        title={pret ? undefined : AIDE_BOUTON_EN_ATTENTE} onClick={chercher}>
        {enCours && <Spinner />}
        {enCours ? "Lecture de la série de l’Insee…" : "Chercher l’indice publié par l’Insee"}
      </Button>
      <MessageIndicePropose retour={retour} />
    </div>
  );
}

/** Ce que la recherche a rendu, dit en clair : l'indice et sa source, ou pourquoi il n'y a rien à proposer. */
export function MessageIndicePropose({ retour }: { retour: RetourPropositionIndice | null }) {
  const p = retour && "proposition" in retour ? retour.proposition : null;
  return (
      <div role="status" aria-live="polite" className="space-y-1 text-sm">
        {retour && "erreur" in retour && <p className="text-destructive">{retour.erreur}</p>}
        {p?.etat === "propose" && retour && "luLe" in retour && (
          <>
            <p data-indice-etat="propose">
              <strong>Indice du T{p.trimestre} {p.annee} publié par l’Insee : {indiceEnClair(p.valeur)}.</strong>{" "}
              Il est reporté dans le formulaire : vérifiez-le avant de réviser.
            </p>
            {/* Troisième reprise du lot D2 : l'indice proposé est celui de la date de révision, pas le dernier publié. */}
            <p className="text-muted-foreground" data-indice-echeance>
              C’est l’indice de la révision prévue le {formaterDate(p.echeance)}.
            </p>
            <p className="text-muted-foreground">
              Source : <LienSerie>série n° 001515333 de l’Insee</LienSerie> (indice de référence des loyers), lue le{" "}
              {formaterDate(retour.luLe)}.
            </p>
            {/* Reprise du lot D2 : une révision non faite n'est pas rattrapée, calcul sur un an. Troisième reprise : même
                phrase que le formulaire et la base, qui savent seulement qu'aucune révision n'est enregistrée. */}
            {p.precedent && (
              <p className="text-warning-soft-foreground" data-indice-annee-sautee>
                Aucune révision n’est enregistrée pour l’année de bail précédente, ou l’indice de référence de ce bail est
                plus ancien. Une révision qui n’a pas été faite n’est pas rattrapée : le loyer se révise sur un an, avec
                l’indice du T{p.trimestre}{" "}
                {p.precedent.annee}
                {p.precedent.valeur !== null
                  ? ` (${indiceEnClair(p.precedent.valeur)} selon l’Insee, reporté dans le formulaire : vérifiez-le).`
                  : ", que l’Insee ne publie pas dans cette série : saisissez-le vous-même."}
              </p>
            )}
            {p.referencePubliee !== null && p.referenceBail !== null && !memeIndice(p.referencePubliee, p.referenceBail) && (
              <p className="text-warning-soft-foreground" data-indice-ecart>
                Attention : pour le T{p.trimestre} {p.anneeReference}, l’Insee publie {indiceEnClair(p.referencePubliee)},
                alors que l’indice de référence de ce bail est {indiceEnClair(p.referenceBail)}. Vérifiez-le avant de réviser.
              </p>
            )}
          </>
        )}
        {p?.etat === "pas_encore_publie" && (
          <p data-indice-etat="pas_encore_publie">
            L’indice du T{p.trimestre} {p.annee} n’est pas dans la série publiée par l’Insee : il n’y a rien à proposer
            pour l’instant.
          </p>
        )}
        {p?.etat === "deja_applique" && (
          <p data-indice-etat="deja_applique">
            L’indice de la révision prévue le {formaterDate(p.echeance)} (T{p.trimestre} {p.annee}) est déjà l’indice de
            référence de ce bail : il n’y a rien à réviser pour cette date.
          </p>
        )}
        {p?.etat === "sans_reference" && (
          <p data-indice-etat="sans_reference">
            Le trimestre de l’indice de référence ne se lit pas sur ce bail : saisissez l’indice vous-même.
          </p>
        )}
        {p?.etat === "indisponible" && (
          <p data-indice-etat="indisponible">
            L’Insee ne répond pas pour le moment. Saisissez l’indice vous-même : il se lit sur{" "}
            <LienSerie>la série officielle de l’Insee</LienSerie>.
          </p>
        )}
      </div>
  );
}
