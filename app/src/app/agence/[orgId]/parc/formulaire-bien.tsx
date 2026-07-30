"use client";

import { useActionState } from "react";
import { creerBien, modifierBien, type EtatParc } from "@/app/actions/parc";
import { TYPES_BIEN } from "@/lib/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BienFormulaire = {
  id: string;
  nom: string;
  type: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  annee_construction: number | null;
  copropriete: boolean;
};

// Création (avec surface/pièces du lot unique) ou édition d'un bien existant.
export function FormulaireBien({
  orgId,
  bien,
}: {
  orgId: string;
  bien?: BienFormulaire;
}) {
  const actionLiee = bien
    ? modifierBien.bind(null, orgId, bien.id)
    : creerBien.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bien-nom">Référence interne</Label>
          <Input
            id="bien-nom"
            name="nom"
            required
            maxLength={120}
            defaultValue={bien?.nom}
            placeholder="12 rue des Lilas"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bien-type">Type</Label>
          {bien ? (
            // Le type conditionne les diagnostics attendus : figé après création
            <Input disabled value={TYPES_BIEN[bien.type] ?? bien.type} />
          ) : (
            <select
              id="bien-type"
              name="type"
              defaultValue="appartement"
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {Object.entries(TYPES_BIEN).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bien-adresse1">Adresse</Label>
        <Input
          id="bien-adresse1"
          name="address_line1"
          required
          maxLength={200}
          defaultValue={bien?.address_line1}
          placeholder="N° et voie"
        />
        <Input
          name="address_line2"
          maxLength={200}
          defaultValue={bien?.address_line2 ?? ""}
          placeholder="Complément (facultatif)"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bien-cp">Code postal</Label>
          <Input
            id="bien-cp"
            name="postal_code"
            required
            maxLength={12}
            defaultValue={bien?.postal_code}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bien-ville">Ville</Label>
          <Input
            id="bien-ville"
            name="city"
            required
            maxLength={120}
            defaultValue={bien?.city}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bien-annee">Année de construction</Label>
          <Input
            id="bien-annee"
            name="annee_construction"
            type="number"
            min={1000}
            max={2100}
            defaultValue={bien?.annee_construction ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Elle déduit les diagnostics attendus (plomb avant 1949, amiante
            avant 1997…).
          </p>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            id="bien-copro"
            name="copropriete"
            type="checkbox"
            defaultChecked={bien?.copropriete}
            className="size-4"
          />
          <Label htmlFor="bien-copro">En copropriété</Label>
        </div>
      </div>

      {!bien && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lot-surface">Surface du lot unique (m²)</Label>
            <Input
              id="lot-surface"
              name="surface_m2"
              type="number"
              step="0.01"
              min="0.01"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lot-pieces">Nombre de pièces</Label>
            <Input id="lot-pieces" name="pieces" type="number" min={1} />
          </div>
        </div>
      )}

      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" disabled={enCours}>
        {enCours
          ? "Enregistrement…"
          : bien
            ? "Enregistrer"
            : "Créer le bien et son lot unique"}
      </Button>
    </form>
  );
}
