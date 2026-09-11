"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  contesterImputation,
  signalerProblemePersiste,
  type EtatIncidentAction,
} from "@/app/actions/incidents";
import { formaterDate } from "@/lib/ged";
import {
  COULEURS_ETAT_LOCATAIRE,
  libelleEtatLocataire,
  titreIncident,
} from "@/lib/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import { LectureImpossible } from "./panne-lecture";
import { tagLocataire } from "./pastille-locataire";
import {
  SuiviInterventionLocataire,
  type CreneauPropose,
  type SuiviIntervention,
} from "./demandes/suivi-intervention";

export type IncidentLocataire = {
  id: string;
  numero: string;
  categorie: string;
  piece: string | null;
  urgence: string;
  etat: string;
  imputation: string | null;
  imputation_justification: string | null;
  imputation_contestee_le: string | null;
  clos_le: string | null;
  declare_le: string;
  nb_photos: number;
  est_declarant: boolean;
};

// « Qui prend en charge », dans les mots du locataire (maquette)
function priseEnCharge(i: IncidentLocataire): string | null {
  if (!i.imputation) return i.etat === "clos" ? null : "Votre gestionnaire l'examine";
  if (i.imputation === "proprietaire") return "Le propriétaire — vous n'avancez rien";
  return "Vous — réparation à votre charge";
}

function PetitFormulaire({
  action,
  nomChamp,
  libelle,
  placeholder,
  bouton,
  valeurInitiale,
}: {
  action: (formData: FormData) => void;
  nomChamp: string;
  // Ce que la zone attend, dit en toutes lettres : le placeholder n'est
  // qu'un exemple, et il s'efface à la première frappe.
  libelle: string;
  placeholder: string;
  bouton: string;
  // Saisie reposée après un refus (conservation des saisies, recette 22/08)
  valeurInitiale?: string;
}) {
  const idChamp = useId();
  return (
    <form action={action} className="mt-2 flex items-start gap-2">
      {/* Ligne compacte (zone + bouton) : libellé pour la seule synthèse vocale */}
      <Label htmlFor={idChamp} className="sr-only">
        {libelle}
      </Label>
      <textarea
        id={idChamp}
        name={nomChamp}
        required
        rows={2}
        placeholder={placeholder}
        defaultValue={valeurInitiale}
        className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
      />
      <BoutonEnvoi enCoursTexte="…" variant="outline" size="sm">
        {bouton}
      </BoutonEnvoi>
    </form>
  );
}

function CarteIncident({
  orgId,
  incident,
  suivi,
  creneaux,
  peutAgir,
}: {
  orgId: string;
  incident: IncidentLocataire;
  // Le suivi de l'intervention, quand il y en a une : l'état de l'incident
  // seul ne dit pas si l'on cherche encore un artisan ou si le rendez-vous
  // est pris (voir demandes/suivi-intervention.tsx).
  suivi?: SuiviIntervention;
  creneaux: CreneauPropose[];
  peutAgir: boolean;
}) {
  const [ouvert, setOuvert] = useState<"contester" | "persiste" | null>(null);
  const [etatContestation, actionContestation] = useActionState<
    EtatIncidentAction,
    FormData
  >(contesterImputation.bind(null, orgId, incident.id), {});
  const [etatPersiste, actionPersiste] = useActionState<
    EtatIncidentAction,
    FormData
  >(signalerProblemePersiste.bind(null, orgId, incident.id), {});

  const charge = priseEnCharge(incident);
  // Contestation et réouverture : réservées au déclarant (les colocataires
  // sont informés mais les fonctions en base n'acceptent que lui)
  const peutContester =
    incident.est_declarant &&
    (incident.imputation === "locataire" || incident.imputation === "degradation_fautive") &&
    !incident.imputation_contestee_le &&
    incident.etat !== "clos";
  const peutRouvrir = incident.est_declarant && incident.etat === "clos";

  // Liseré gauche façon maquette pLocIncidents : vert = clos, ambre = une
  // décision ou une action côté locataire (à sa charge, intervention
  // terminée), encre = le dossier avance côté agence. Même épaisseur que les
  // autres cartes à liseré de la zone (4 px).
  const liser =
    incident.etat === "clos"
      ? "border-l-[var(--success)]"
      : (incident.etat === "qualifie" && incident.imputation !== "proprietaire") ||
          incident.etat === "termine" ||
          // Un créneau attend son choix : c'est la seule chose qu'on lui
          // demande de tout le cycle, elle mérite le liseré d'action.
          (suivi?.etape === "creneau_a_choisir" && peutAgir)
        ? "border-l-[var(--warning)]"
        : "border-l-[var(--encre)]";

  return (
    <div className={`loc-carte space-y-1.5 border-l-4 text-sm ${liser}`}>
      <div className="entete-carte !mb-0">
        <h3 className="text-base font-medium">{titreIncident(incident.categorie)}</h3>
        <span className={tagLocataire(COULEURS_ETAT_LOCATAIRE[incident.etat])}>
          {libelleEtatLocataire(incident.etat, incident.imputation)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {incident.numero} · déclaré le {formaterDate(incident.declare_le)}
        {incident.piece ? ` · ${incident.piece}` : ""}
        {incident.nb_photos > 0
          ? ` · ${incident.nb_photos} photo${incident.nb_photos > 1 ? "s" : ""}`
          : ""}
      </p>

      {charge && (
        <div className="ligne-info">
          <span>Qui prend en charge</span>
          <span className="text-right">
            {charge}
            {incident.imputation_justification
              ? ` (${incident.imputation_justification})`
              : ""}
          </span>
        </div>
      )}

      {suivi && (
        <SuiviInterventionLocataire
          orgId={orgId}
          suivi={suivi}
          creneaux={creneaux}
          peutAgir={peutAgir}
        />
      )}

      {incident.imputation_contestee_le && (
        <p className="text-xs text-muted-foreground">
          Votre contestation du {formaterDate(incident.imputation_contestee_le)} est
          transmise — elle ne suspend pas la réparation.
        </p>
      )}

      {etatContestation.erreur && (
        <p className="err !mb-0" role="alert">
          {etatContestation.erreur}
        </p>
      )}
      {etatContestation.succes && (
        <p className="text-success-soft-foreground">{etatContestation.succes}</p>
      )}
      {etatPersiste.erreur && (
        <p className="err !mb-0" role="alert">
          {etatPersiste.erreur}
        </p>
      )}
      {etatPersiste.succes && (
        <p className="text-success-soft-foreground">{etatPersiste.succes}</p>
      )}

      <div className="flex flex-wrap gap-3">
        {peutContester &&
          !etatContestation.succes &&
          (ouvert === "contester" ? null : (
            <button
              type="button"
              onClick={() => setOuvert("contester")}
              className="lien-discret"
            >
              Contester cette imputation
            </button>
          ))}
        {peutRouvrir &&
          !etatPersiste.succes &&
          (ouvert === "persiste" ? null : (
            <button
              type="button"
              onClick={() => setOuvert("persiste")}
              className="lien-discret"
            >
              Le problème persiste
            </button>
          ))}
      </div>

      {ouvert === "contester" && peutContester && !etatContestation.succes && (
        <PetitFormulaire
          action={actionContestation}
          nomChamp="message"
          libelle="Motif de votre contestation"
          placeholder="Expliquez pourquoi — votre message est transmis à l'agence."
          bouton="Envoyer"
          valeurInitiale={etatContestation.valeurs?.message}
        />
      )}
      {ouvert === "persiste" && peutRouvrir && !etatPersiste.succes && (
        <PetitFormulaire
          action={actionPersiste}
          nomChamp="motif"
          libelle="Précisions sur le problème"
          placeholder="Qu'est-ce qui ne va toujours pas ?"
          bouton="Rouvrir"
          valeurInitiale={etatPersiste.valeurs?.motif}
        />
      )}
    </div>
  );
}

// Liste « Mes demandes » (onglet dédié depuis la recette 22/08) : le statut de
// chaque signalement, dans les mots du locataire (RM-19.2.3). Le CTA
// « Signaler un problème » vit dans l'en-tête de la page.
export function IncidentsLocataire({
  orgId,
  incidents,
  suivis = [],
  creneaux = [],
  peutAgir = true,
  lectureEnEchec = false,
}: {
  orgId: string;
  incidents: IncidentLocataire[];
  /** Une ligne par incident parvenu au stade de l'artisan (sprint 7). */
  suivis?: SuiviIntervention[];
  /** Les créneaux que l'artisan propose, toutes demandes confondues. */
  creneaux?: CreneauPropose[];
  /** Adhésion active : bail terminé, la lecture reste, les gestes non. */
  peutAgir?: boolean;
  // La lecture a échoué : « Rien en cours » serait un mensonge rassurant
  lectureEnEchec?: boolean;
}) {
  if (lectureEnEchec) {
    return (
      <div className="loc-carte">
        <LectureImpossible quoi="vos demandes" />
      </div>
    );
  }
  if (incidents.length === 0) {
    return (
      <div className="vide-guide rounded-[14px]">
        <p className="titre">Rien en cours.</p>
        <p className="explication">
          Un problème dans le logement ? Signalez-le : vous saurez qui prend la
          réparation en charge avant toute intervention, et vous suivrez chaque
          étape ici.
        </p>
        <span className="geste">
          <Link href={`/locataire/${orgId}/incident`} className="btn-or">
            Signaler un problème
          </Link>
        </span>
      </div>
    );
  }
  const suiviDe = new Map(suivis.map((s) => [s.incident_id, s]));
  return (
    <div className="space-y-3">
      {incidents.map((i) => {
        const suivi = suiviDe.get(i.id);
        return (
          <CarteIncident
            key={i.id}
            orgId={orgId}
            incident={i}
            suivi={suivi}
            creneaux={creneaux.filter((c) => c.intervention_id === suivi?.intervention_id)}
            peutAgir={peutAgir}
          />
        );
      })}
    </div>
  );
}
