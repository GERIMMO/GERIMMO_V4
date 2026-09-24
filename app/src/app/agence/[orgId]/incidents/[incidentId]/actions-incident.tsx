"use client";

import { useActionState, useRef, useEffect, useId } from "react";
import {
  attribuerIncident,
  cloturerIncident,
  joindrePhotoIncident,
  qualifierIncident,
  rouvrirIncident,
  type EtatIncidentAction,
} from "@/app/actions/incidents";
import { compresserChampFichiers } from "@/lib/compresser-image";
import { RepereJuridique } from "../nouveau/formulaire-incident";
import { IMPUTATIONS_INCIDENT, MOTIFS_CLOTURE } from "@/lib/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// min-w-0 : en flex, un select natif refuse sinon de descendre sous sa plus
// longue option et fait déborder la ligne (audit mobile 09/09)
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

// Qualification / imputation (RM-7.2) : l'agent choisit — rien n'est
// pré-sélectionné (RM-7.2.1) — et justifie (opposable, RM-7.2.3).
// `apresSucces` : la pop-up de traitement (recette 22/08) se referme sur le
// geste abouti — la fiche, elle, reste en place.
//
// 24/09 : `imputation` / `justification` rechargent la décision EN PLACE quand
// on requalifie un dossier déjà qualifié. Ce n'est pas une proposition
// automatique (RM-7.2.1 vise un conseil déduit de la catégorie) : c'est la
// décision du gestionnaire lui-même, qu'il maintient ou corrige sans tout
// ressaisir. Un dossier à qualifier n'en passe pas : rien n'y est coché.
export function FormulaireQualification({
  orgId,
  incidentId,
  categorie,
  imputation,
  justification,
  apresSucces,
}: {
  orgId: string;
  incidentId: string;
  categorie: string;
  imputation?: string | null;
  justification?: string | null;
  apresSucces?: () => void;
}) {
  const actionLiee = qualifierIncident.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  useEffect(() => {
    if (etat.succes) apresSucces?.();
  }, [etat.succes, apresSucces]);

  return (
    <form action={action} className="space-y-3">
      <RepereJuridique slug={categorie} />
      <fieldset className="space-y-1.5">
        <legend className="libelle-champ">Qui prend en charge *</legend>
        {/* Décision opposable : rangées pleine largeur avec du padding — les
            radios natives de 13px se cochent mal au pouce */}
        {Object.entries(IMPUTATIONS_INCIDENT).map(([valeur, libelle]) => (
          <label key={valeur} className="flex items-center gap-2.5 py-2 text-sm">
            <input
              type="radio"
              name="imputation"
              value={valeur}
              required
              defaultChecked={(etat.valeurs?.imputation ?? imputation) === valeur}
              className="size-4 shrink-0 accent-[var(--encre)]"
            />
            {libelle}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="justification">Justification *</Label>
        <textarea
          id="justification"
          name="justification"
          required
          // 24/09 : trois lignes — l'aide tient sur trois lignes au téléphone
          // et la troisième était coupée à mi-hauteur.
          rows={3}
          defaultValue={etat.valeurs?.justification ?? justification ?? undefined}
          placeholder="Opposable au locataire — le fondement et le constat qui motivent votre décision."
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Qualification…">
        Qualifier l&apos;incident
      </BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        Le locataire est informé immédiatement — avant toute intervention, pas à la
        facture.
      </p>
    </form>
  );
}

export function FormulaireCloture({
  orgId,
  incidentId,
  motifs,
  apresSucces,
}: {
  orgId: string;
  incidentId: string;
  motifs: string[];
  apresSucces?: () => void;
}) {
  const actionLiee = cloturerIncident.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  useEffect(() => {
    if (etat.succes) apresSucces?.();
  }, [etat.succes, apresSucces]);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="motif">Motif *</Label>
        <select
          id="motif"
          name="motif"
          required
          defaultValue={etat.valeurs?.motif ?? ""}
          className={classeSelect}
        >
          <option value="" disabled>
            Choisissez…
          </option>
          {motifs.map((m) => (
            <option key={m} value={m}>
              {MOTIFS_CLOTURE[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="commentaire">Ce qui a été fait</Label>
        <textarea
          id="commentaire"
          name="commentaire"
          rows={2}
          defaultValue={etat.valeurs?.commentaire}
          placeholder="« Conseil téléphonique : purge du radiateur, chauffe rétablie. »"
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" enCoursTexte="Clôture…">
        Clôturer l&apos;incident
      </BoutonEnvoi>
    </form>
  );
}

export function FormulaireReouverture({
  orgId,
  incidentId,
}: {
  orgId: string;
  incidentId: string;
}) {
  const actionLiee = rouvrirIncident.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="motif-reouverture">Pourquoi rouvrir ? *</Label>
        <Input
          id="motif-reouverture"
          name="motif"
          required
          defaultValue={etat.valeurs?.motif}
          placeholder="Le désordre est réapparu…"
        />
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi variant="outline" enCoursTexte="Réouverture…">
        Rouvrir l&apos;incident
      </BoutonEnvoi>
      <p className="text-xs text-muted-foreground">
        L&apos;incident repasse par la qualification ; l&apos;historique de clôture est
        conservé dans la chronologie.
      </p>
    </form>
  );
}

// Attribution : le responsable choisit dans la liste ; un agent se saisit
// d'un dossier libre d'un clic (les règles fines sont défendues en base).
//
// 24/09 : un seul mot pour un dossier sans responsable, celui de la liste —
// « non attribué ». « Personne — pot commun » se lisait comme un nom de plus
// parmi les gestionnaires. Et le responsable a lui aussi son geste en un clic
// (« Me l'attribuer ») : se saisir d'un dossier ne doit pas demander d'ouvrir
// le sélecteur pour y chercher sa propre adresse.
export function FormulaireAttribution({
  orgId,
  incidentId,
  responsable,
  membres,
  monCompte,
  estResponsable,
}: {
  orgId: string;
  incidentId: string;
  responsable: string | null;
  membres: { account_id: string; email: string }[];
  monCompte: string;
  estResponsable: boolean;
}) {
  const actionLiee = attribuerIncident.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  if (!estResponsable) {
    // Agent : se saisir d'un dossier libre, ou rendre le sien
    if (responsable && responsable !== monCompte) return <Retour etat={etat} />;
    return (
      <form action={action} className="space-y-2">
        <input type="hidden" name="responsable" value={responsable ? "" : monCompte} />
        <Retour etat={etat} />
        <BoutonEnvoi variant="outline" size="sm">
          {responsable ? "Rendre le dossier" : "Je le prends en charge"}
        </BoutonEnvoi>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {responsable !== monCompte && (
          <form action={action}>
            <input type="hidden" name="responsable" value={monCompte} />
            <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
              Me l&apos;attribuer
            </BoutonEnvoi>
          </form>
        )}
        {/* `key` : le sélecteur est non contrôlé — sans remontage, il
            garderait l'ancien choix affiché après « Me l'attribuer ». */}
        <form
          key={responsable ?? ""}
          action={action}
          className="flex min-w-0 flex-1 basis-[240px] flex-wrap items-center gap-2"
        >
          {/* 24/09 : `flex-1 basis-[180px]` — en `w-full` seul, le sélecteur
              prenait toute la rangée et renvoyait « Attribuer » seul à la
              ligne, même sur bureau. */}
          <select
            name="responsable"
            defaultValue={responsable ?? ""}
            className={`${classeSelect} flex-1 basis-[180px]`}
            aria-label="Attribuer à"
          >
            <option value="">— Non attribué —</option>
            {membres.map((m) => (
              <option key={m.account_id} value={m.account_id}>
                {m.email}
              </option>
            ))}
          </select>
          <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
            Attribuer
          </BoutonEnvoi>
        </form>
      </div>
      <Retour etat={etat} />
    </div>
  );
}

export function FormulairePhotoIncident({
  orgId,
  incidentId,
}: {
  orgId: string;
  incidentId: string;
}) {
  const actionLiee = joindrePhotoIncident.bind(null, orgId, incidentId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);
  const idPhotos = useId();
  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Ligne compacte (champ + bouton) : libellé pour la seule synthèse vocale */}
        <Label htmlFor={idPhotos} className="sr-only">
          Photos à joindre
        </Label>
        <Input id={idPhotos} name="photos" type="file" accept="image/jpeg,image/png" multiple onChange={(e) => void compresserChampFichiers(e.currentTarget)} required />
        <BoutonEnvoi variant="outline" size="sm" enCoursTexte="…">
          Joindre
        </BoutonEnvoi>
      </div>
      <Retour etat={etat} />
    </form>
  );
}
