"use client";

import { useActionState, useId } from "react";
import {
  annulerMission,
  evaluerArtisan,
  fixerRendezVous,
  ouvrirConsultation,
  retenirDevis,
  reviserImputation,
  solliciterArtisan,
  type EtatIncidentAction,
} from "@/app/actions/incidents";
import { IMPUTATIONS_INCIDENT } from "@/lib/incidents";
import {
  decennaleRequise,
  METIERS_ARTISAN,
  NATURES_TRAVAUX,
} from "../artisans/referentiel";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Les gestes d'affectation, côté agence. Chaque champ porte un libellé
// VISIBLE : le placeholder disparaît à la première frappe, ce n'est pas un nom
// accessible (e2e/a11y.spec.ts le vérifie).

const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm";
const classeTextarea =
  "w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm";

function Retour({ etat }: { etat: EtatIncidentAction }) {
  return (
    <>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </>
  );
}

// Ouverture de la mise en concurrence.
//
// LE MÉTIER N'EST PAS PRÉ-SÉLECTIONNÉ, et c'est délibéré. RM-8.3 dit « métier
// déduit de la catégorie de l'incident », mais aucune source ne donne la table
// de correspondance, et « humidité / infiltration » n'a pas de métier évident
// (couverture ? maçonnerie ? plomberie ?). Plutôt que d'inventer une
// correspondance qui s'imposerait ensuite comme une règle, l'écran rappelle la
// catégorie déclarée et laisse l'agent trancher — dans l'esprit de RM-7.2.1,
// « la cause ne se déduit pas de la catégorie ».
export function FormulaireConsultation({
  orgId,
  incidentId,
  categorieLibelle,
}: {
  orgId: string;
  incidentId: string;
  categorieLibelle: string;
}) {
  const actionLiee = ouvrirConsultation.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const idMetier = useId();
  const idNature = useId();
  const idValidite = useId();
  const idUnique = useId();

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={idMetier}>Métier recherché *</Label>
          <select
            id={idMetier}
            name="metier"
            required
            defaultValue={etat.valeurs?.metier ?? ""}
            className={classeSelect}
          >
            <option value="" disabled>
              Choisissez…
            </option>
            {Object.entries(METIERS_ARTISAN).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Signalé comme « {categorieLibelle} ». Le métier n&apos;en est pas déduit
            automatiquement : à vous de dire qui doit intervenir.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idNature}>Nature des travaux *</Label>
          <select
            id={idNature}
            name="nature"
            required
            defaultValue={etat.valeurs?.nature ?? ""}
            className={classeSelect}
          >
            <option value="" disabled>
              Choisissez…
            </option>
            {Object.entries(NATURES_TRAVAUX).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
                {decennaleRequise(valeur) ? " — décennale exigée" : " — sans décennale"}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            C&apos;est la nature, pas le métier, qui décide si l&apos;attestation
            décennale est exigée. Le filtre ne se désactive pas.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idValidite}>Validité demandée aux devis (jours)</Label>
        <Input
          id={idValidite}
          name="validite"
          type="number"
          min={1}
          max={365}
          defaultValue={etat.valeurs?.validite ?? "30"}
          className="max-w-[10rem]"
        />
      </div>

      {/* Tranché le 2026-07-25 : le devis unique EST autorisé, mais il porte un
          drapeau VISIBLE disant qu'il n'y a pas eu de mise en concurrence —
          l'interrupteur caché du code V1 devient un signal affiché. */}
      <label htmlFor={idUnique} className="flex items-start gap-2.5 py-2 text-sm">
        <input
          id={idUnique}
          type="checkbox"
          name="devis_unique"
          defaultChecked={etat.valeurs?.devis_unique === "on"}
          className="mt-0.5 size-4 shrink-0 accent-[var(--encre)]"
        />
        <span>
          J&apos;assume un devis unique
          <span className="block text-xs text-muted-foreground">
            Un seul artisan sollicité, donc pas de mise en concurrence. Le dossier
            le signalera — au propriétaire aussi.
          </span>
        </span>
      </label>

      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Ouverture…">Ouvrir la mise en concurrence</BoutonEnvoi>
    </form>
  );
}

export function BoutonSolliciter({
  orgId,
  consultationId,
  artisanId,
  raisonSociale,
}: {
  orgId: string;
  consultationId: string;
  artisanId: string;
  raisonSociale: string;
}) {
  const actionLiee = solliciterArtisan.bind(null, orgId, consultationId, artisanId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-1.5">
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Envoi…">
        {/* Le nom de l'artisan COMPLÈTE le libellé visible, il ne le remplace
            pas : dans une liste de cinq artisans, « Demander un devis » seul ne
            dit pas lequel — mais un nom accessible qui ne contient pas le texte
            affiché casse la commande vocale (WCAG 2.5.3). */}
        Demander un devis
        <span className="sr-only"> à {raisonSociale}</span>
      </BoutonEnvoi>
      <Retour etat={etat} />
    </form>
  );
}

export function BoutonRetenirDevis({
  orgId,
  devisId,
  raisonSociale,
}: {
  orgId: string;
  devisId: string;
  raisonSociale: string;
}) {
  const actionLiee = retenirDevis.bind(null, orgId, devisId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-1.5">
      <BoutonEnvoi enCoursTexte="Sélection…">
        Retenir ce devis
        <span className="sr-only"> — celui de {raisonSociale}</span>
      </BoutonEnvoi>
      <Retour etat={etat} />
    </form>
  );
}

// RM-10.4.1 : l'arbitrage du gérant. Le rendez-vous a été réglé au téléphone ;
// il ne reste qu'à l'inscrire. Les heures sont lues à l'heure de Paris côté
// serveur (voir instantParis) — le serveur, lui, tourne en UTC.
export function FormulaireRendezVous({
  orgId,
  interventionId,
}: {
  orgId: string;
  interventionId: string;
}) {
  const actionLiee = fixerRendezVous.bind(null, orgId, interventionId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const idDebut = useId();
  const idFin = useId();
  const idMotif = useId();

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={idDebut}>Début du rendez-vous *</Label>
          <Input
            id={idDebut}
            name="debut"
            type="datetime-local"
            required
            defaultValue={etat.valeurs?.debut}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idFin}>Fin *</Label>
          <Input
            id={idFin}
            name="fin"
            type="datetime-local"
            required
            defaultValue={etat.valeurs?.fin}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={idMotif}>Ce qui a été convenu</Label>
        <Input
          id={idMotif}
          name="motif"
          defaultValue={etat.valeurs?.motif}
          placeholder="Accord téléphonique du 12/09 avec Mme Dupont et l'artisan."
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" enCoursTexte="Enregistrement…">
        Inscrire le rendez-vous
      </BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        Heure de Paris. Les créneaux encore en attente deviennent caducs ; ceux
        déjà refusés restent au dossier — un refus persistant est opposable.
      </p>
    </form>
  );
}

// RM-7.5.3 : l'artisan SIGNALE une cause différente, l'agent RÉVISE. Le
// formulaire propose l'imputation suggérée par l'artisan mais ne la coche pas :
// il signale, il ne requalifie pas.
export function FormulaireRevisionImputation({
  orgId,
  incidentId,
}: {
  orgId: string;
  incidentId: string;
}) {
  const actionLiee = reviserImputation.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const idJustification = useId();

  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="libelle-champ">Qui prend en charge, après diagnostic *</legend>
        {Object.entries(IMPUTATIONS_INCIDENT).map(([valeur, libelle]) => (
          <label key={valeur} className="flex items-center gap-2.5 py-2 text-sm">
            <input
              type="radio"
              name="imputation"
              value={valeur}
              required
              defaultChecked={etat.valeurs?.imputation === valeur}
              className="size-4 shrink-0 accent-[var(--encre)]"
            />
            {libelle}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={idJustification}>Justification *</Label>
        <textarea
          id={idJustification}
          name="justification"
          required
          rows={2}
          defaultValue={etat.valeurs?.justification}
          placeholder="Ce que le diagnostic de l'artisan a établi, et ce que vous en concluez."
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Révision…">Réviser l&apos;imputation</BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        À faire avant la facturation : c&apos;est cette décision qui dira qui paie.
        Le locataire en est informé, et peut la contester sans que cela suspende
        quoi que ce soit.
      </p>
    </form>
  );
}

export function FormulaireAnnulationMission({
  orgId,
  interventionId,
}: {
  orgId: string;
  interventionId: string;
}) {
  const actionLiee = annulerMission.bind(null, orgId, interventionId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const idMotif = useId();

  return (
    <form action={action} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={idMotif}>Motif d&apos;annulation *</Label>
        <Input
          id={idMotif}
          name="motif"
          required
          defaultValue={etat.valeurs?.motif}
          placeholder="Le propriétaire fait réaliser les travaux par son propre artisan."
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Annulation…">
        Annuler la mission
      </BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        L&apos;incident revient en attente d&apos;affectation ; les créneaux
        deviennent caducs. Impossible sur une mission déjà terminée.
      </p>
    </form>
  );
}

const CRITERES: { cle: string; libelle: string }[] = [
  { cle: "qualite", libelle: "Qualité du travail" },
  { cle: "delai", libelle: "Respect du délai" },
  { cle: "prix", libelle: "Rapport qualité-prix" },
];

// Module 11 : trois critères, parce que le gérant est « le seul à voir
// l'ensemble » — le locataire, lui, ne juge ni le prix ni la technique.
export function FormulaireEvaluation({
  orgId,
  interventionId,
}: {
  orgId: string;
  interventionId: string;
}) {
  const actionLiee = evaluerArtisan.bind(null, orgId, interventionId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const idCommentaire = useId();

  return (
    <form action={action} className="space-y-3">
      {CRITERES.map((c) => (
        <fieldset key={c.cle} className="space-y-1">
          <legend className="libelle-champ">{c.libelle} *</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[1, 2, 3, 4, 5].map((n) => (
              // Rangée large, cible au pouce : une radio native fait 13 px
              <label key={n} className="flex items-center gap-1.5 py-1.5 text-sm">
                <input
                  type="radio"
                  name={c.cle}
                  value={n}
                  required
                  defaultChecked={etat.valeurs?.[c.cle] === String(n)}
                  className="size-4 shrink-0 accent-[var(--encre)]"
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor={idCommentaire}>Commentaire — privé à votre agence</Label>
        <textarea
          id={idCommentaire}
          name="commentaire"
          rows={2}
          defaultValue={etat.valeurs?.commentaire}
          placeholder="« Ponctuel, a nettoyé derrière lui, a prévenu du retard de livraison. »"
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Envoi…">Noter l&apos;artisan</BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        Votre note pèse la moitié de son score ; le locataire en apporte un quart.
        L&apos;artisan verra sa moyenne, jamais votre commentaire ni le détail de
        qui a noté quoi. Une seule note par intervention.
      </p>
    </form>
  );
}
