"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import {
  escaladerAlerte,
  fermerAlerte,
  type EtatAlerte,
} from "@/app/actions/alertes";
import { ASSIGNATION_TOUS, estConfieeAMoi } from "@/lib/alertes";
import { afficherEcheance } from "@/lib/echeances";
import { CRITICITES, formaterDateHeure } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { ModaleIncident, type IncidentPourModale } from "./modale-incident";

export type AlerteRang = {
  id: string;
  criticite: string;
  titre: string;
  echeance: string | null;
  created_at: string;
  assignee_account_id: string | null;
  assigned_all: boolean;
  escalades: unknown;
  details: Record<string, unknown> | null;
};

type Membre = { account_id: string; email: string; role: string };

const NIVEAUX: Record<string, string> = {
  critique: "CRITIQUE",
  normale: "NORMALE",
  informative: "INFORMATIVE",
};

// Liste des alertes ouvertes (revue recette 08/08) : les miennes (nominatives
// ou « tout le monde ») actives en haut ; celles confiées à quelqu'un d'autre
// grisées en bas — on ne peut rien faire dessus. Le responsable garde la main
// partout. Le traitement passe par une modale (maquette) : confier, ou marquer
// traitée en disant ce qui a été fait.
export function ListeAlertes({
  orgId,
  alertes,
  membres,
  monCompte,
  estResponsable,
  ouvrirAlerteId,
  incidents,
}: {
  orgId: string;
  alertes: AlerteRang[];
  membres: Membre[];
  monCompte: string;
  estResponsable: boolean;
  // « Traiter » depuis le tableau de bord ou la cloche (recette 22/08) : la
  // pop-up de traitement s'ouvre d'emblée sur cette alerte.
  ouvrirAlerteId?: string;
  // Les incidents liés aux alertes qui en transportent un (details.incident_id) :
  // « Traiter » ouvre alors la pop-up incident, pas la modale d'alerte générique.
  incidents?: IncidentPourModale[];
}) {
  const [filtre, setFiltre] = useState<string>("toutes");
  const [ouverte, setOuverte] = useState<AlerteRang | null>(null);
  // Une alerte incident s'ouvre en pop-up incident ; « Confier » et
  // « Réassigner » repassent par la modale générique (revue 23/08 — le
  // routage forcé avait fait disparaître la délégation des alertes incident).
  const [forcerGenerique, setForcerGenerique] = useState(false);
  // L'auto-ouverture se consomme UNE fois, puis le paramètre est retiré de
  // l'URL : sans cela, la revalidation qui suit le traitement remontait le
  // composant avec ?traiter= encore présent et rouvrait une modale périmée
  // (recette 23/08, constaté en production).
  // Réinitialisation pilotée par l'URL, pas un état dérivé du rendu — même
  // idiome que l'assistant personnes.
  /* eslint-disable react-hooks/set-state-in-effect */
  const consomme = useRef<string | null>(null);
  useEffect(() => {
    if (!ouvrirAlerteId) {
      consomme.current = null;
      return;
    }
    if (consomme.current === ouvrirAlerteId) return;
    consomme.current = ouvrirAlerteId;
    const cible = alertes.find((a) => a.id === ouvrirAlerteId);
    // On n'ouvre que ce qu'on a le droit de traiter (grisée = intouchable)
    if (cible && (estConfieeAMoi(cible, monCompte) || estResponsable)) {
      setOuverte(cible);
      setForcerGenerique(false);
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [ouvrirAlerteId, alertes, monCompte, estResponsable]);
  // Le geste abouti solde l'alerte en base et la revalidation arrive dans le
  // MÊME commit React que le succès : la pop-up incident peut être démontée
  // avant son propre `apresSucces` et retomber sur la modale générique avec
  // un objet périmé (recette 23/08, constaté en production). La règle sûre :
  // une alerte qui a quitté la liste ferme sa modale.
  useEffect(() => {
    if (ouverte && !alertes.some((a) => a.id === ouverte.id)) setOuverte(null);
  }, [alertes, ouverte]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const emailParCompte = new Map(membres.map((m) => [m.account_id, m.email]));
  const nomAssignation = (a: AlerteRang) =>
    a.assigned_all
      ? "tout le monde"
      : (emailParCompte.get(a.assignee_account_id ?? "") ?? "—");

  const filtrees =
    filtre === "toutes" ? alertes : alertes.filter((a) => a.criticite === filtre);
  const miennes = filtrees.filter((a) => estConfieeAMoi(a, monCompte));
  const autres = filtrees.filter((a) => !estConfieeAMoi(a, monCompte));

  const pastille = (cle: string, libelle: string) => (
    <button
      type="button"
      className={`filtre ${filtre === cle ? "actif" : ""}`}
      onClick={() => setFiltre(cle)}
    >
      {libelle}
    </button>
  );

  const rang = (a: AlerteRang, grisee: boolean) => {
    const echeance = afficherEcheance(a.echeance);
    return (
      <div
        key={a.id}
        className={`rang-alerte ${grisee ? "grisee" : a.criticite === "critique" ? "critique" : a.criticite === "normale" ? "normale" : ""}`}
      >
        <div className="min-w-0">
          <div className="niveau">
            {NIVEAUX[a.criticite] ?? a.criticite} · confiée à {nomAssignation(a)}
          </div>
          <div className="mt-0.5 text-sm">{a.titre}</div>
          {/* Le contexte que l'alerte transporte (recette 21/08 : treize
              « État des lieux à réaliser » identiques, illisibles) */}
          {typeof a.details?.libelle === "string" && (
            <div className="truncate text-xs text-muted-foreground">
              {a.details.libelle}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            créée le {formaterDateHeure(a.created_at)}
            {echeance && (
              <span className={`ml-2 ${echeance.classe}`}>{echeance.texte}</span>
            )}
          </div>
        </div>
        {/* Une alerte grisée est intouchable — seul le responsable peut la
            rouvrir pour la réassigner ou la traiter à la place d'un absent */}
        {(!grisee || estResponsable) && (
          <Button
            type="button"
            variant={!grisee && a.criticite === "critique" ? "destructive" : "outline"}
            size="sm"
            onClick={() => {
              setOuverte(a);
              // « Réassigner » = geste de délégation : modale générique,
              // même si l'alerte transporte un incident.
              setForcerGenerique(grisee);
            }}
          >
            {grisee ? "Réassigner" : "Traiter"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {pastille("toutes", "Toutes")}
        {pastille("critique", "Critiques")}
        {pastille("normale", "Normales")}
        {pastille("informative", "Informatives")}
      </div>

      <div className="border border-border bg-card">
        {miennes.length === 0 && autres.length === 0 ? (
          <div className="vide">
            Aucune alerte à ce niveau. Rien ne vous attend ici.
          </div>
        ) : (
          <>
            {miennes.map((a) => rang(a, false))}
            {autres.length > 0 && (
              <div className="border-t border-border bg-muted px-4 py-2">
                <p className="eyebrow">Confiées à d&apos;autres</p>
              </div>
            )}
            {autres.map((a) => rang(a, true))}
          </>
        )}
      </div>

      <p className="mt-3.5 text-xs text-muted-foreground">
        Une alerte critique non traitée sous 7 jours remonte au responsable de
        l&apos;agence, une normale sous 15 jours. Les informatives ne remontent
        jamais.
      </p>

      {ouverte &&
        (() => {
          const incident = (incidents ?? []).find(
            (i) => i.id === ouverte.details?.incident_id
          );
          return incident && !forcerGenerique ? (
            <ModaleIncident
              orgId={orgId}
              incident={incident}
              critique={ouverte.criticite === "critique"}
              fermer={() => setOuverte(null)}
              basculerGenerique={() => setForcerGenerique(true)}
            />
          ) : (
            <ModaleAlerte
              orgId={orgId}
              alerte={ouverte}
              membres={membres}
              estResponsable={estResponsable}
              nomAssignation={nomAssignation(ouverte)}
              fermer={() => setOuverte(null)}
            />
          );
        })()}
    </div>
  );
}

// Modale de traitement (maquette « Traiter l'alerte ») : tête colorée par la
// criticité, deux gestes — confier à quelqu'un, ou marquer traitée en disant
// ce qui a été fait (obligatoire), puis valider.
function ModaleAlerte({
  orgId,
  alerte,
  membres,
  estResponsable,
  nomAssignation,
  fermer,
}: {
  orgId: string;
  alerte: AlerteRang;
  membres: Membre[];
  estResponsable: boolean;
  nomAssignation: string;
  fermer: () => void;
}) {
  const confierLiee = escaladerAlerte.bind(null, orgId, alerte.id);
  const traiterLiee = fermerAlerte.bind(null, orgId, alerte.id);
  const [etatConfier, actionConfier, confierEnCours] = useActionState<
    EtatAlerte,
    FormData
  >(confierLiee, {});
  const [etatTraiter, actionTraiter, traiterEnCours] = useActionState<
    EtatAlerte,
    FormData
  >(traiterLiee, {});

  // Le geste a abouti : la modale se referme, la liste se recharge d'elle-même
  useEffect(() => {
    if (etatConfier.succes || etatTraiter.succes) fermer();
  }, [etatConfier.succes, etatTraiter.succes, fermer]);

  const echeance = afficherEcheance(alerte.echeance);
  const nbEscalades = Array.isArray(alerte.escalades)
    ? alerte.escalades.length
    : 0;

  return (
    <Modale
      titre={alerte.titre}
      surtitre={`${CRITICITES[alerte.criticite] ?? alerte.criticite} · confiée à ${nomAssignation}`}
      variante={alerte.criticite === "critique" ? "critique" : "encre"}
      fermer={fermer}
    >
          <div className="text-sm text-muted-foreground">
            {echeance ? (
              <p>
                Échéance :{" "}
                <span className={echeance.classe}>{echeance.texte}</span>
              </p>
            ) : (
              <p>Sans échéance.</p>
            )}
            {nbEscalades > 0 && <p>Transmise {nbEscalades} fois.</p>}
          </div>

          {alerte.criticite !== "informative" && (
            <form action={actionConfier} className="space-y-1.5">
              <label htmlFor="confier-vers" className="libelle-champ">
                Confier à
              </label>
              <select
                id="confier-vers"
                name="vers"
                required
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="" disabled>
                  — Choisir —
                </option>
                {/* Seul le responsable peut assigner à tout le monde */}
                {estResponsable && !alerte.assigned_all && (
                  <option value={ASSIGNATION_TOUS}>Tout le monde</option>
                )}
                {membres
                  .filter((m) => m.account_id !== alerte.assignee_account_id)
                  .map((m) => (
                    <option key={m.account_id} value={m.account_id}>
                      {m.email}
                    </option>
                  ))}
              </select>
              {/* Recette 13/08 : on ne confie jamais sans un mot au destinataire */}
              <label htmlFor="confier-message" className="libelle-champ">
                Message au destinataire
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id="confier-message"
                  name="message"
                  required
                  rows={2}
                  placeholder="Pourquoi vous lui confiez cette alerte…"
                  className="w-full flex-1 rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
                />
                <Button variant="outline" size="sm" type="submit" disabled={confierEnCours}>
                  {confierEnCours ? "…" : "Confier"}
                </Button>
              </div>
              {etatConfier.erreur && (
                <p className="text-sm text-destructive">{etatConfier.erreur}</p>
              )}
            </form>
          )}

          <form action={actionTraiter} className="space-y-1.5">
            <label htmlFor="traiter-action" className="libelle-champ">
              Marquer traitée — ce qui a été fait
            </label>
            <textarea
              id="traiter-action"
              name="action_effectuee"
              required
              rows={2}
              placeholder="Ce que vous avez fait…"
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
            />
            {etatTraiter.erreur && (
              <p className="text-sm text-destructive">{etatTraiter.erreur}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={fermer}>
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={traiterEnCours}>
                {traiterEnCours ? "Validation…" : "Valider"}
              </Button>
            </div>
          </form>
    </Modale>
  );
}
