"use client";

import { useActionState } from "react";
import {
  ajouterEcriture,
  passerContreEcriture,
  cloturerMois,
  type EtatCompta,
} from "@/app/actions/compta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireEcriture({ orgId }: { orgId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    ajouterEcriture.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="ec-sens" className="text-xs">Sens</Label>
        <select id="ec-sens" name="sens" defaultValue="depense" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="recette">Recette</option>
          <option value="depense">Dépense</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-cat" className="text-xs">Catégorie</Label>
        <Input id="ec-cat" name="categorie" placeholder="travaux, charges…" className="h-9 w-36" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-montant" className="text-xs">Montant (€)</Label>
        <Input id="ec-montant" name="montant" type="number" step="0.01" min="0.01" className="h-9 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-piece" className="text-xs">Date pièce</Label>
        <Input id="ec-piece" name="date_piece" type="date" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ec-imput" className="text-xs">Imputation</Label>
        <Input id="ec-imput" name="date_imputation" type="date" className="h-9" />
      </div>
      <Input name="libelle" placeholder="Libellé (facultatif)" className="h-9 w-40" />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Ajouter l'écriture"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

export function FormulaireCloture({ orgId, moisCourant }: { orgId: string; moisCourant: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    cloturerMois.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="clot-mois" className="text-xs">Mois</Label>
        <Input id="clot-mois" name="mois" type="month" defaultValue={moisCourant} className="h-9" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Clôturer le mois"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function BoutonContre({ orgId, ecritureId }: { orgId: string; ecritureId: string }) {
  const [etat, action, enCours] = useActionState<EtatCompta, FormData>(
    passerContreEcriture.bind(null, orgId, ecritureId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-1">
      <Input name="motif" placeholder="motif" className="h-7 w-28 text-xs" />
      <Button type="submit" size="sm" variant="ghost" disabled={enCours}>
        Contre-écriture
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}
