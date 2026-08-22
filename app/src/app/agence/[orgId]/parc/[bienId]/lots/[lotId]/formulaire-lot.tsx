"use client";

import { useActionState } from "react";
import { modifierLot, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LotFormulaire = {
  id: string;
  nom: string;
  surface_m2: number | null;
  surface_carrez: number | null;
  pieces: number | null;
  meuble: boolean;
  etage: string | null;
  description: string | null;
  tantieme: number | null;
  identifiant_fiscal: string | null;
};

export function FormulaireLot({
  orgId,
  bienId,
  lot,
  verrouille,
}: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
}) {
  const actionLiee = modifierLot.bind(null, orgId, bienId, lot.id);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-4">
      {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe sur
          la saisie, pas sur les valeurs d'origine (recette 22/08). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lot-nom">Nom du lot</Label>
          <Input id="lot-nom" name="nom" required maxLength={120} defaultValue={etat.valeurs?.nom ?? lot.nom} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-etage">Étage</Label>
          <Input id="lot-etage" name="etage" maxLength={40} defaultValue={etat.valeurs?.etage ?? lot.etage ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lot-fiscal">Identifiant fiscal du logement</Label>
          <Input
            id="lot-fiscal"
            name="identifiant_fiscal"
            maxLength={20}
            defaultValue={etat.valeurs?.identifiant_fiscal ?? lot.identifiant_fiscal ?? ""}
            placeholder="13 chiffres (avis de taxe foncière) — obligatoire au bail"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-surface-form">Surface (m²)</Label>
          <Input
            id="lot-surface-form"
            name="surface_m2"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={etat.valeurs?.surface_m2 ?? lot.surface_m2 ?? ""}
            disabled={verrouille}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-carrez">Surface Carrez (m²)</Label>
          <Input
            id="lot-carrez"
            name="surface_carrez"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={etat.valeurs?.surface_carrez ?? lot.surface_carrez ?? ""}
            disabled={verrouille}
          />
          <p className="text-xs text-muted-foreground">
            Champ simple en V1 — sans date ni mesureur, pas de défense en cas de
            contestation au-delà de 5 % d&apos;écart.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-pieces-form">Pièces</Label>
          <Input
            id="lot-pieces-form"
            name="pieces"
            type="number"
            min={1}
            defaultValue={etat.valeurs?.pieces ?? lot.pieces ?? ""}
            disabled={verrouille}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-tantieme">Tantième de copropriété</Label>
          <Input
            id="lot-tantieme"
            name="tantieme"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={etat.valeurs?.tantieme ?? lot.tantieme ?? ""}
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input
            id="lot-meuble"
            name="meuble"
            type="checkbox"
            defaultChecked={etat.valeurs ? etat.valeurs.meuble === "on" : lot.meuble}
            className="size-4"
          />
          <Label htmlFor="lot-meuble">Meublé</Label>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lot-description">Description</Label>
        <textarea
          id="lot-description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={etat.valeurs?.description ?? lot.description ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
