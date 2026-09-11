"use client";
import { InputDateJour } from "@/components/input-date-jour";

import { useActionState, useId } from "react";
import {
  creerAppelCharges,
  ajouterPosteCharge,
  modifierPosteCharge,
  supprimerPosteCharge,
  validerVentilation,
  supprimerAppelCharges,
  type EtatAppel,
} from "@/app/actions/appels-charges";
import { LIBELLES_NATURE, type NatureCharge } from "@/lib/charges";
import { eur } from "@/lib/ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PosteCharge = {
  id: string;
  libelle: string;
  montant: number;
  nature: NatureCharge;
  fonds_alur: boolean;
  propose: boolean;
};
export type AppelCharge = {
  id: string;
  exercice: number;
  date_reception: string;
  total: number;
  statut: string;
  document_id: string | null;
  postes: PosteCharge[];
};

const COULEUR_NATURE: Record<NatureCharge, string> = {
  recuperable: "text-success-soft-foreground",
  non_recuperable: "text-muted-foreground",
  a_qualifier: "text-warning-soft-foreground",
};

export function AppelsCharges({
  orgId,
  bienId,
  lotId,
  appels,
  anneeCourante,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  appels: AppelCharge[];
  anneeCourante: number;
}) {
  return (
    <div className="space-y-4">
      {appels.map((a) => (
        <AppelBloc key={a.id} orgId={orgId} bienId={bienId} lotId={lotId} appel={a} />
      ))}
      <FormCreerAppel orgId={orgId} bienId={bienId} lotId={lotId} anneeCourante={anneeCourante} />
    </div>
  );
}

function AppelBloc({
  orgId,
  bienId,
  lotId,
  appel,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  appel: AppelCharge;
}) {
  const somme = appel.postes.reduce((s, p) => s + Number(p.montant), 0);
  const recup = appel.postes.filter((p) => p.nature === "recuperable").reduce((s, p) => s + Number(p.montant), 0);
  const nonRecup = appel.postes.filter((p) => p.nature === "non_recuperable").reduce((s, p) => s + Number(p.montant), 0);
  const aQualifier = appel.postes.filter((p) => p.nature === "a_qualifier").length;
  const modifiable = appel.statut === "brouillon";
  const ecartTotal = Math.round((somme - Number(appel.total)) * 100) / 100;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Exercice {appel.exercice}</span>
        <span className="text-sm text-muted-foreground">· total appel {eur(appel.total)}</span>
        <span className="badge-statut text-muted-foreground">
          {appel.statut === "brouillon" ? "Brouillon" : appel.statut === "ventile" ? "Ventilé" : "Figé"}
        </span>
        {appel.document_id && (
          <a
            href={`/agence/${orgId}/documents/${appel.document_id}`}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            appel du syndic
          </a>
        )}
        {modifiable && appel.postes.length === 0 && (
          <span className="ml-auto">
            <BoutonSupprimerAppel orgId={orgId} bienId={bienId} lotId={lotId} appelId={appel.id} />
          </span>
        )}
      </div>

      {appel.postes.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {appel.postes.map((p) => (
            <li key={p.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {p.libelle}
                  {p.fonds_alur && (
                    <span className="ml-1 rounded bg-secondary px-1 text-xs">fonds ALUR</span>
                  )}
                </span>
                <span className="w-24 text-right font-medium">{eur(p.montant)}</span>
                <span className={`w-52 text-right text-xs ${COULEUR_NATURE[p.nature]}`}>
                  {LIBELLES_NATURE[p.nature]}
                  {p.propose && p.nature !== "a_qualifier" ? " (proposé)" : ""}
                </span>
              </div>
              {modifiable && (
                <div className="flex flex-wrap items-center gap-2">
                  <FormQualifierPoste orgId={orgId} bienId={bienId} lotId={lotId} poste={p} />
                  <BoutonSupprimerPoste orgId={orgId} bienId={bienId} lotId={lotId} posteId={p.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modifiable ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Saisi : {eur(somme)} / {eur(appel.total)}</span>
            {ecartTotal !== 0 && (
              <span className="text-destructive">écart {eur(ecartTotal)} (doit être nul)</span>
            )}
            {aQualifier > 0 && <span className="text-warning-soft-foreground">{aQualifier} à qualifier</span>}
          </div>
          <FormAjouterPoste orgId={orgId} bienId={bienId} lotId={lotId} appelId={appel.id} />
          <BoutonValider orgId={orgId} bienId={bienId} lotId={lotId} appelId={appel.id} />
        </>
      ) : (
        <div className="flex flex-wrap gap-x-6 text-sm">
          <span>
            Récupérable (locataire) : <span className="font-medium text-success-soft-foreground">{eur(recup)}</span>
          </span>
          <span>
            Non récupérable (propriétaire) : <span className="font-medium">{eur(nonRecup)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function FormCreerAppel({
  orgId,
  bienId,
  lotId,
  anneeCourante,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  anneeCourante: number;
}) {
  const [etat, action] = useActionState<EtatAppel, FormData>(
    creerAppelCharges.bind(null, orgId, bienId, lotId),
    {}
  );
  const idDocument = useId();
  return (
    <form action={action} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium">Saisir un appel de charges</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="ac-ex" className="text-xs">Exercice</Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
          <Input id="ac-ex" name="exercice" type="number" min="2000" max="2100" defaultValue={etat.valeurs?.exercice ?? anneeCourante} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ac-date" className="text-xs">Reçu le</Label>
          <InputDateJour id="ac-date"   className="h-9" name="date_reception" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ac-total" className="text-xs">Total de l&apos;appel (€)</Label>
          <Input id="ac-total" name="total" type="number" step="0.01" min="0.01" defaultValue={etat.valeurs?.total} className="h-9 w-32" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {/* Les trois champs de la rangée du dessus portent un libellé visible :
            celui-ci fait de même, sur sa propre ligne, au-dessus du champ — le
            bouton reste à sa place. */}
        <div className="space-y-1">
          <Label htmlFor={idDocument} className="text-xs">
            Appel du syndic à joindre
          </Label>
          <Input id={idDocument} name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9 w-64 text-xs" />
        </div>
        <BoutonEnvoi size="sm" variant="outline" enCoursTexte="…">
          {"Créer l'appel"}
        </BoutonEnvoi>
      </div>
      <p className="text-xs text-muted-foreground">
        Puis saisissez chaque poste : la grille (décret 87-713) propose la nature, vous corrigez.
      </p>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

function FormAjouterPoste({
  orgId,
  bienId,
  lotId,
  appelId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  appelId: string;
}) {
  const [etat, action] = useActionState<EtatAppel, FormData>(
    ajouterPosteCharge.bind(null, orgId, bienId, lotId, appelId),
    {}
  );
  // Rangée compacte (deux champs + bouton) : un libellé visible la casserait,
  // les libellés n'existent donc que pour la synthèse vocale. Identifiants
  // tirés de useId() — la page aligne un formulaire par appel de charges.
  const idLibelle = useId();
  const idMontant = useId();
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
      <Label htmlFor={idLibelle} className="sr-only">
        Intitulé du poste de charge
      </Label>
      <Input id={idLibelle} name="libelle" placeholder="Poste (ex. ascenseur — entretien)" defaultValue={etat.valeurs?.libelle} className="h-9 w-64" />
      <Label htmlFor={idMontant} className="sr-only">
        Montant du poste, en euros
      </Label>
      <Input id={idMontant} name="montant" type="number" step="0.01" min="0.01" placeholder="€" defaultValue={etat.valeurs?.montant} className="h-9 w-24" />
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="…">
        Ajouter le poste
      </BoutonEnvoi>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function FormQualifierPoste({
  orgId,
  bienId,
  lotId,
  poste,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  poste: PosteCharge;
}) {
  const [etat, action] = useActionState<EtatAppel, FormData>(
    modifierPosteCharge.bind(null, orgId, bienId, lotId, poste.id),
    {}
  );
  // Identifiant tiré de useId() : cette ligne se répète une fois par poste.
  const idNature = useId();
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
      {/* Le poste entre dans le libellé : la page en aligne une par ligne, et
          la liste des contrôles d'un lecteur d'écran répétait « Nature de la
          charge » à l'identique, sans rien qui dise de quel poste il s'agit. */}
      <Label htmlFor={idNature} className="sr-only">
        Nature de la charge — {poste.libelle}
      </Label>
      <select
        id={idNature}
        name="nature"
        defaultValue={etat.valeurs?.nature ?? poste.nature}
        className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
      >
        <option value="recuperable">Récupérable</option>
        <option value="non_recuperable">Non récupérable</option>
        <option value="a_qualifier">À qualifier</option>
      </select>
      {/* Au tactile, c'est le label entier qui sert de cible (la case seule
          fait 14px — le socle n'agrandit pas les checkboxes) */}
      <label className="flex items-center gap-1 text-xs pointer-coarse:gap-2 pointer-coarse:py-3">
        <input type="checkbox" name="fonds_alur" defaultChecked={etat.valeurs ? etat.valeurs.fonds_alur === "on" : poste.fonds_alur} className="size-3.5 pointer-coarse:size-5" />
        fonds ALUR
      </label>
      <BoutonEnvoi size="sm" variant="ghost" className="h-7 text-xs">
        Qualifier
      </BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function BoutonValider({
  orgId,
  bienId,
  lotId,
  appelId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  appelId: string;
}) {
  const [etat, action] = useActionState<EtatAppel, FormData>(
    async () => validerVentilation(orgId, bienId, lotId, appelId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <BoutonEnvoi size="sm" enCoursTexte="…">
        Valider la ventilation
      </BoutonEnvoi>
      <span className="text-xs text-muted-foreground">
        Total des postes = total de l&apos;appel, aucun poste à qualifier.
      </span>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function BoutonSupprimerPoste({
  orgId,
  bienId,
  lotId,
  posteId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  posteId: string;
}) {
  const [, action] = useActionState(
    async () => supprimerPosteCharge(orgId, bienId, lotId, posteId),
    {}
  );
  return (
    <form action={action}>
      <BoutonEnvoi size="sm" variant="ghost" className="h-7 text-xs text-destructive">
        Retirer
      </BoutonEnvoi>
    </form>
  );
}

function BoutonSupprimerAppel({
  orgId,
  bienId,
  lotId,
  appelId,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  appelId: string;
}) {
  const [, action] = useActionState(
    async () => supprimerAppelCharges(orgId, bienId, lotId, appelId),
    {}
  );
  return (
    <form action={action}>
      <BoutonEnvoi size="sm" variant="ghost" className="text-xs text-destructive">
        Supprimer
      </BoutonEnvoi>
    </form>
  );
}
