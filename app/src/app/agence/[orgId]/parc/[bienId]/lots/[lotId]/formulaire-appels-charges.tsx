"use client";

import { useActionState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const eur = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;

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
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
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
  const [etat, action, enCours] = useActionState<EtatAppel, FormData>(
    creerAppelCharges.bind(null, orgId, bienId, lotId),
    {}
  );
  return (
    <form action={action} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium">Saisir un appel de charges</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="ac-ex" className="text-xs">Exercice</Label>
          <Input id="ac-ex" name="exercice" type="number" min="2000" max="2100" defaultValue={anneeCourante} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ac-date" className="text-xs">Reçu le</Label>
          <Input id="ac-date" name="date_reception" type="date" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ac-total" className="text-xs">Total de l&apos;appel (€)</Label>
          <Input id="ac-total" name="total" type="number" step="0.01" min="0.01" className="h-9 w-32" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9 w-64 text-xs" />
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "…" : "Créer l'appel"}
        </Button>
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
  const [etat, action, enCours] = useActionState<EtatAppel, FormData>(
    ajouterPosteCharge.bind(null, orgId, bienId, lotId, appelId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Input name="libelle" placeholder="Poste (ex. ascenseur — entretien)" className="h-9 w-64" />
      <Input name="montant" type="number" step="0.01" min="0.01" placeholder="€" className="h-9 w-24" />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Ajouter le poste"}
      </Button>
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
  const [etat, action, enCours] = useActionState<EtatAppel, FormData>(
    modifierPosteCharge.bind(null, orgId, bienId, lotId, poste.id),
    {}
  );
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <select
        name="nature"
        defaultValue={poste.nature}
        className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
      >
        <option value="recuperable">Récupérable</option>
        <option value="non_recuperable">Non récupérable</option>
        <option value="a_qualifier">À qualifier</option>
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="fonds_alur" defaultChecked={poste.fonds_alur} className="size-3.5" />
        fonds ALUR
      </label>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours} className="h-7 text-xs">
        Qualifier
      </Button>
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
  const [etat, action, enCours] = useActionState<EtatAppel, FormData>(
    async () => validerVentilation(orgId, bienId, lotId, appelId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "…" : "Valider la ventilation"}
      </Button>
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
  const [, action, enCours] = useActionState(
    async () => supprimerPosteCharge(orgId, bienId, lotId, posteId),
    {}
  );
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours} className="h-7 text-xs text-destructive">
        Retirer
      </Button>
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
  const [, action, enCours] = useActionState(
    async () => supprimerAppelCharges(orgId, bienId, lotId, appelId),
    {}
  );
  return (
    <form action={action}>
      <Button type="submit" size="sm" variant="ghost" disabled={enCours} className="text-xs text-destructive">
        Supprimer
      </Button>
    </form>
  );
}
