"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  attribuerIncident,
  cloturerIncident,
  joindrePhotoIncident,
  qualifierIncident,
  rouvrirIncident,
  type EtatIncidentAction,
} from "@/app/actions/incidents";
import { RepereJuridique } from "../nouveau/formulaire-incident";
import { IMPUTATIONS_INCIDENT, MOTIFS_CLOTURE } from "@/lib/incidents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
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
export function FormulaireQualification({
  orgId,
  incidentId,
  categorie,
}: {
  orgId: string;
  incidentId: string;
  categorie: string;
}) {
  const actionLiee = qualifierIncident.bind(null, orgId, incidentId);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-3">
      <RepereJuridique slug={categorie} />
      <fieldset className="space-y-1.5">
        <legend className="libelle-champ">Qui prend en charge *</legend>
        {Object.entries(IMPUTATIONS_INCIDENT).map(([valeur, libelle]) => (
          <label key={valeur} className="flex items-center gap-2 text-sm">
            <input type="radio" name="imputation" value={valeur} required />
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
          rows={2}
          placeholder="Opposable au locataire — le fondement et le constat qui motivent votre décision."
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <Button type="submit" disabled={enCours}>
        {enCours ? "Qualification…" : "Qualifier l'incident"}
      </Button>
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
}: {
  orgId: string;
  incidentId: string;
  motifs: string[];
}) {
  const actionLiee = cloturerIncident.bind(null, orgId, incidentId);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="motif">Motif *</Label>
        <select id="motif" name="motif" required defaultValue="" className={classeSelect}>
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
          placeholder="« Conseil téléphonique : purge du radiateur, chauffe rétablie. »"
          className={classeTextarea}
        />
      </div>
      <Retour etat={etat} />
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "Clôture…" : "Clôturer l'incident"}
      </Button>
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
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="motif-reouverture">Pourquoi rouvrir ? *</Label>
        <Input
          id="motif-reouverture"
          name="motif"
          required
          placeholder="Le désordre est réapparu…"
        />
      </div>
      <Retour etat={etat} />
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "Réouverture…" : "Rouvrir l'incident"}
      </Button>
      <p className="text-xs text-muted-foreground">
        L&apos;incident repasse par la qualification ; l&apos;historique de clôture est
        conservé dans la chronologie.
      </p>
    </form>
  );
}

// Attribution : le responsable choisit dans la liste ; un agent se saisit
// d'un dossier libre d'un clic (les règles fines sont défendues en base).
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
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});

  if (!estResponsable) {
    // Agent : se saisir d'un dossier libre, ou rendre le sien
    if (responsable && responsable !== monCompte) return <Retour etat={etat} />;
    return (
      <form action={action} className="space-y-2">
        <input type="hidden" name="responsable" value={responsable ? "" : monCompte} />
        <Retour etat={etat} />
        <Button type="submit" variant="outline" size="sm" disabled={enCours}>
          {responsable ? "Remettre au pot commun" : "Je le prends en charge"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          name="responsable"
          defaultValue={responsable ?? ""}
          className={classeSelect}
          aria-label="Attribuer à"
        >
          <option value="">Personne — pot commun</option>
          {membres.map((m) => (
            <option key={m.account_id} value={m.account_id}>
              {m.email}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={enCours}>
          {enCours ? "…" : "Attribuer"}
        </Button>
      </div>
      <Retour etat={etat} />
    </form>
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
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input name="photos" type="file" accept="image/jpeg,image/png" multiple required />
        <Button type="submit" variant="outline" size="sm" disabled={enCours}>
          {enCours ? "…" : "Joindre"}
        </Button>
      </div>
      <Retour etat={etat} />
    </form>
  );
}
