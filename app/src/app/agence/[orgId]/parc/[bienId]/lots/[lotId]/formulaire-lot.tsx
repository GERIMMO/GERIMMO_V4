"use client";

import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { modifierLot, type EtatParc } from "@/app/actions/parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
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
  chauffage: string | null;
  eau_chaude: string | null;
  locaux_privatifs: string | null;
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
  const { etat, soumettre: action, enCours } = useActionFormulaire<EtatParc>(actionLiee);

  return (
    <form onSubmit={action} className="space-y-4">
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
          <Label htmlFor="lot-fiscal">Identifiant fiscal du logement *</Label>
          <Input
            id="lot-fiscal"
            name="identifiant_fiscal"
            maxLength={20}
            required
            defaultValue={etat.valeurs?.identifiant_fiscal ?? lot.identifiant_fiscal ?? ""}
            placeholder="13 chiffres (avis de taxe foncière) — obligatoire au bail"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-surface-form">Surface (m²) *</Label>
          <Input
            id="lot-surface-form"
            name="surface_m2"
            type="number"
            step="0.01"
            min="0.01"
            required
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
            Reprenez la surface privative indiquée sur l’attestation Carrez, si le logement est concerné.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-pieces-form">Pièces *</Label>
          <Input
            id="lot-pieces-form"
            name="pieces"
            type="number"
            min={1}
            required
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
        {/* Régimes de chauffage/eau chaude et accessoires : repris tels quels
            dans la désignation du bail (art. 3 loi 89-462) */}
        <div className="space-y-2">
          <Label htmlFor="lot-chauffage">Chauffage *</Label>
          <Input
            id="lot-chauffage"
            name="chauffage"
            maxLength={200}
            required
            defaultValue={etat.valeurs?.chauffage ?? lot.chauffage ?? ""}
            placeholder="Individuel — électricité"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lot-eau-chaude">Eau chaude *</Label>
          <Input
            id="lot-eau-chaude"
            name="eau_chaude"
            maxLength={200}
            required
            defaultValue={etat.valeurs?.eau_chaude ?? lot.eau_chaude ?? ""}
            placeholder="Individuelle — ballon électrique"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="lot-locaux-privatifs">Locaux privatifs *</Label>
          <Input
            id="lot-locaux-privatifs"
            name="locaux_privatifs"
            maxLength={300}
            required
            defaultValue={etat.valeurs?.locaux_privatifs ?? lot.locaux_privatifs ?? ""}
            placeholder="Cave n° 4, parking n° 12…"
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
        <Label htmlFor="lot-description">Autres parties du logement *</Label>
        <textarea
          id="lot-description"
          name="description"
          rows={3}
          maxLength={2000}
          required
          placeholder="Balcon, terrasse, jardin… ou Néant"
          defaultValue={etat.valeurs?.description ?? lot.description ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…">
        Enregistrer
      </BoutonEnvoi>
    </form>
  );
}
