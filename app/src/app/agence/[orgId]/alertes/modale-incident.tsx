"use client";

import Link from "next/link";
import { Modale } from "@/components/ui/modale";
import { formaterDate } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import {
  COULEURS_ETAT_INCIDENT,
  ETATS_INCIDENT,
  IMPUTATIONS_INCIDENT,
  MOTIFS_CLOTURE_PAR_ETAT,
  categorieIncident,
  titreIncident,
  type EtatIncident,
} from "@/lib/incidents";
import {
  FormulaireQualification,
  FormulaireCloture,
} from "../incidents/[incidentId]/actions-incident";

export type IncidentPourModale = {
  id: string;
  numero: string;
  categorie: string;
  description: string | null;
  piece: string | null;
  urgence: string;
  etat: string;
  imputation: string | null;
  imputation_contestation: string | null;
  created_at: string;
  lot: { nom: string } | null;
  declarant: { nom: string; prenom: string | null } | null;
};

// Pop-up de traitement d'un incident (recette 22/08) : « Traiter » sur une
// alerte incident ouvre CE contenu — celui de la fiche incident (qualification,
// clôture) — dans la modale unique de la charte, où qu'on soit (tableau de
// bord, cloche, page Alertes). Le design est celui de la maquette
// (modaleAlerte) ; le fond de dossier reste accessible d'un lien.
export function ModaleIncident({
  orgId,
  incident,
  critique,
  fermer,
  basculerGenerique,
}: {
  orgId: string;
  incident: IncidentPourModale;
  critique: boolean;
  fermer: () => void;
  // Confier/déléguer l'alerte : on repasse par la modale générique
  basculerGenerique?: () => void;
}) {
  // Revue 23/08 : un incident QUALIFIÉ se requalifie aussi — c'est la réponse
  // à une contestation (maintenir ou changer l'imputation, justification
  // opposable) et cela solde l'alerte « contestée » en base.
  const aQualifier =
    incident.etat === "declare" ||
    incident.etat === "rouvert" ||
    incident.etat === "qualifie";
  const motifsCloture = MOTIFS_CLOTURE_PAR_ETAT[incident.etat as EtatIncident] ?? [];

  return (
    <Modale
      titre={`${titreIncident(incident.categorie)}${incident.lot ? ` — ${incident.lot.nom}` : ""}`}
      surtitre={`Incident ${incident.numero}${incident.urgence === "urgente" ? " · urgent" : ""}`}
      variante={critique ? "critique" : "encre"}
      large
      fermer={fermer}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={COULEURS_ETAT_INCIDENT[incident.etat] ?? "puce puce-grise"}>
          {ETATS_INCIDENT[incident.etat] ?? incident.etat}
        </span>
        {incident.urgence === "urgente" && <span className="puce puce-rouge">Urgent</span>}
      </div>

      {incident.description && (
        <p className="text-sm text-muted-foreground">{incident.description}</p>
      )}

      <div>
        <div className="ligne-info">
          <span>Catégorie</span>
          <span>{categorieIncident(incident.categorie)?.libelle ?? incident.categorie}</span>
        </div>
        {incident.declarant && (
          <div className="ligne-info">
            <span>Déclaré par</span>
            <span>{nomComplet(incident.declarant)}</span>
          </div>
        )}
        <div className="ligne-info">
          <span>Déclaré le</span>
          <span>{formaterDate(incident.created_at)}</span>
        </div>
        {incident.piece && (
          <div className="ligne-info">
            <span>Pièce</span>
            <span>{incident.piece}</span>
          </div>
        )}
        {incident.imputation && (
          <div className="ligne-info">
            <span>Imputation actuelle</span>
            <span>{IMPUTATIONS_INCIDENT[incident.imputation] ?? incident.imputation}</span>
          </div>
        )}
      </div>

      {/* La contestation en toutes lettres : c'est à elle que l'agent répond */}
      {incident.imputation_contestation && (
        <div className="border-l-[3px] border-l-warning bg-warning-soft p-3 text-sm">
          <p className="font-medium">Le locataire conteste l&apos;imputation :</p>
          <p className="mt-1 text-muted-foreground">« {incident.imputation_contestation} »</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requalifiez pour répondre — maintenir l&apos;imputation vaut réponse,
            l&apos;alerte se solde.
          </p>
        </div>
      )}

      {/* Le contenu de traitement de la fiche incident, tel quel */}
      {aQualifier && (
        <div className="border-t border-border pt-4">
          <FormulaireQualification
            orgId={orgId}
            incidentId={incident.id}
            categorie={incident.categorie}
            apresSucces={fermer}
          />
        </div>
      )}
      {/* Un incident déclaré peut aussi se classer sans suite / partir au
          syndic — les motifs suivent l'état, comme sur la fiche */}
      {motifsCloture.length > 0 && (
        <div className="border-t border-border pt-4">
          <FormulaireCloture
            orgId={orgId}
            incidentId={incident.id}
            motifs={motifsCloture}
            apresSucces={fermer}
          />
        </div>
      )}

      {/* Aucun geste possible ici (clos, ou état intermédiaire à venir) :
          le dire plutôt qu'une pop-up muette */}
      {!aQualifier && motifsCloture.length === 0 && (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          {incident.etat === "clos"
            ? "Cet incident est clos — rien à traiter ici."
            : "Cet incident est entre deux étapes — le traitement se poursuit depuis sa fiche."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          href={`/agence/${orgId}/incidents/${incident.id}`}
          className="text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
        >
          Ouvrir la fiche complète (photos, chronologie, attribution)
        </Link>
        <span className="flex items-center gap-3">
          {basculerGenerique && (
            <button
              type="button"
              onClick={basculerGenerique}
              className="text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
            >
              Confier l&apos;alerte…
            </button>
          )}
          <button
            type="button"
            onClick={fermer}
            className="text-sm text-muted-foreground hover:underline"
          >
            Fermer
          </button>
        </span>
      </div>
    </Modale>
  );
}
