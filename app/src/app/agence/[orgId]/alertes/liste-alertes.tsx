"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { estConfieeAMoi } from "@/lib/alertes";
import { afficherEcheance } from "@/lib/echeances";
import { CRITICITES, formaterDateHeure } from "@/lib/ged";
import { Button, buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import {
  ModaleAlerte,
  nomAssignation,
  type AlerteRang,
  type Membre,
} from "./modale-alerte";

export type { AlerteRang } from "./modale-alerte";

// Liste des alertes ouvertes (revue recette 08/08) : les miennes (nominatives
// ou « tout le monde ») actives en haut ; celles confiées à quelqu'un d'autre
// grisées en bas — on ne peut rien faire dessus. Le responsable garde la main
// partout. Le traitement passe par la modale (maquette) — SAUF les alertes
// incident : un incident se traite dans l'onglet Incidents, « Traiter » y
// emmène, positionné sur le dossier (recette 24/08).
// « Traiter » emmène là où le geste se fait : un message se lit sur la fiche
// de la personne, une intention de congé se confirme sur le bail.
function cheminFiche(a: AlerteRang, orgId: string): string | null {
  if (
    (a.type === "message_locataire" || a.type === "piece_deposee") &&
    typeof a.details?.person_id === "string"
  ) {
    return `/agence/${orgId}/personnes/${a.details.person_id}`;
  }
  if (
    (a.type === "conge_intention" || a.type === "edl_sortie") &&
    typeof a.details?.bail_id === "string"
  ) {
    return `/agence/${orgId}/baux/${a.details.bail_id}`;
  }
  // Un document signé retourné se contrôle puis se classe sur sa fiche GED
  if (a.type === "signature_retournee" && typeof a.details?.document_id === "string") {
    return `/agence/${orgId}/documents?sel=${a.details.document_id}`;
  }
  return null;
}

export function ListeAlertes({
  orgId,
  alertes,
  membres,
  monCompte,
  estResponsable,
  ouvrirAlerteId,
}: {
  orgId: string;
  alertes: AlerteRang[];
  membres: Membre[];
  monCompte: string;
  estResponsable: boolean;
  // « Traiter » une alerte générique depuis un lien : la pop-up s'ouvre
  // d'emblée sur cette alerte.
  ouvrirAlerteId?: string;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<string>("toutes");
  const [ouverte, setOuverte] = useState<AlerteRang | null>(null);
  const incidentDe = (a: AlerteRang) =>
    typeof a.details?.incident_id === "string" ? a.details.incident_id : null;
  const ficheDe = (a: AlerteRang) => cheminFiche(a, orgId);
  // L'auto-ouverture se consomme UNE fois, puis le paramètre est retiré de
  // l'URL : sans cela, la revalidation qui suit le traitement remontait le
  // composant avec ?traiter= encore présent et rouvrait une modale périmée
  // (recette 23/08, constaté en production). Réinitialisation pilotée par
  // l'URL, pas un état dérivé du rendu — même idiome que l'assistant personnes.
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
    window.history.replaceState(null, "", window.location.pathname);
    if (!cible) return;
    // Une alerte qui a un lieu de traitement (incident, fiche, bail) y emmène
    // — sinon le lien profond depuis « Mes espaces » ne faisait plus rien
    // (audit de vérification 06/09) ; les autres ouvrent la modale.
    const incident = incidentDe(cible);
    const fiche = cheminFiche(cible, orgId);
    if (incident) {
      router.push(`/agence/${orgId}/incidents?sel=${incident}`);
      return;
    }
    if (fiche) {
      router.push(fiche);
      return;
    }
    if (estConfieeAMoi(cible, monCompte) || estResponsable) {
      setOuverte(cible);
    }
  }, [ouvrirAlerteId, alertes, monCompte, estResponsable, orgId, router]);
  // Le geste abouti solde l'alerte en base et la revalidation arrive dans le
  // MÊME commit React que le succès : la règle sûre est qu'une alerte qui a
  // quitté la liste ferme sa modale (recette 23/08, constaté en production).
  useEffect(() => {
    if (ouverte && !alertes.some((a) => a.id === ouverte.id)) setOuverte(null);
  }, [alertes, ouverte]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtrees =
    filtre === "toutes" ? alertes : alertes.filter((a) => a.criticite === filtre);
  const miennes = filtrees.filter((a) => estConfieeAMoi(a, monCompte));
  const autres = filtrees.filter((a) => !estConfieeAMoi(a, monCompte));

  // Le compte vit sur la pastille : on n'ouvre pas un filtre pour découvrir
  // qu'il ne contient rien.
  const pastille = (cle: string, libelle: string) => {
    const nb =
      cle === "toutes" ? alertes.length : alertes.filter((a) => a.criticite === cle).length;
    return (
      <button
        type="button"
        className={`filtre ${filtre === cle ? "actif" : ""}`}
        aria-pressed={filtre === cle}
        onClick={() => setFiltre(cle)}
      >
        {libelle} <span className="mono-discret">{nb}</span>
      </button>
    );
  };

  const rang = (a: AlerteRang, grisee: boolean) => {
    const echeance = afficherEcheance(a.echeance);
    const incidentId = incidentDe(a);
    const fiche = ficheDe(a);
    return (
      <div
        key={a.id}
        className={`rang-alerte flex-wrap gap-y-2 ${grisee ? "grisee" : a.criticite === "critique" ? "critique" : a.criticite === "normale" ? "normale" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <div className="niveau">
            {CRITICITES[a.criticite] ?? a.criticite} · confiée à{" "}
            {nomAssignation(a, membres)}
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
            rouvrir pour la réassigner ou la traiter à la place d'un absent.
            Une alerte incident emmène au dossier, dans l'onglet Incidents. */}
        {(!grisee || estResponsable) &&
          ((incidentId || fiche) && !grisee ? (
            <span className="flex shrink-0 items-center gap-2.5">
              <Link
                href={incidentId ? `/agence/${orgId}/incidents?sel=${incidentId}` : (fiche as string)}
                className={buttonVariants({
                  variant: a.criticite === "critique" ? "destructive" : "outline",
                  size: "sm",
                  // Un <a> échappe au min-height tactile posé sur button/select
                  className: "pointer-coarse:min-h-10",
                })}
              >
                Traiter
                <IndicateurLien />
              </Link>
              {/* La modale reste atteignable : confier à quelqu'un, ou fermer
                  une alerte dont le geste n'aura jamais lieu (LRAR jamais
                  envoyée, pièce vérifiée hors ligne…) — audit 06/09.
                  Libellé visible : le title ne se découvre pas au tactile. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Assigner ou fermer l'alerte"
                title="Assigner ou fermer"
                onClick={() => setOuverte(a)}
              >
                Assigner
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant={!grisee && a.criticite === "critique" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setOuverte(a)}
            >
              {grisee ? "Réassigner" : "Traiter"}
            </Button>
          ))}
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

      {miennes.length === 0 && autres.length === 0 ? (
        <div className="vide-guide">
          <p className="titre">
            {filtre === "toutes"
              ? "Aucune alerte ouverte"
              : "Aucune alerte à ce niveau"}
          </p>
          <p className="explication">
            {filtre === "toutes"
              ? "Gerimmo pose les alertes tout seul : diagnostic périmé, état des lieux à faire, rapport à valider. Celles que vous créez à la main servent à ce qui ne rentre pas dans ces cases."
              : "Le filtre est peut-être trop étroit — les autres niveaux, eux, ont peut-être de quoi faire."}
          </p>
          {filtre !== "toutes" && (
            <span className="geste">
              <Button type="button" variant="outline" size="sm" onClick={() => setFiltre("toutes")}>
                Voir toutes les alertes
              </Button>
            </span>
          )}
        </div>
      ) : (
        <div className="colonne-liste">
          {miennes.map((a) => rang(a, false))}
          {autres.length > 0 && (
            <div className="tete-groupe">
              <span className="libelle-champ">Confiées à d&apos;autres</span>
              <span className="libelle-champ">{autres.length}</span>
            </div>
          )}
          {autres.map((a) => rang(a, true))}
        </div>
      )}

      <p className="mt-3.5 text-xs text-muted-foreground">
        Une alerte critique non traitée sous 7 jours remonte au responsable de
        l&apos;agence, une normale sous 15 jours. Les informatives ne remontent
        jamais.
      </p>

      {ouverte && (
        <ModaleAlerte
          orgId={orgId}
          alerte={ouverte}
          membres={membres}
          estResponsable={estResponsable}
          fermer={() => setOuverte(null)}
        />
      )}
    </div>
  );
}
