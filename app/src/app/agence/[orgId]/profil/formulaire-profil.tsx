"use client";

import { useActionState } from "react";
import {
  modifierProfilOrganisation,
  type EtatProfilOrganisation,
} from "@/app/actions/organisation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Organisation = {
  name: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  telephone: string | null;
  email_contact: string | null;
  siret: string | null;
};

export function FormulaireProfilOrganisation({
  orgId,
  organisation,
  lectureSeule,
  estProprietaire,
}: {
  orgId: string;
  organisation: Organisation;
  lectureSeule: boolean;
  estProprietaire: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatProfilOrganisation, FormData>(
    modifierProfilOrganisation.bind(null, orgId),
    {}
  );
  // En erreur, la saisie est reposée via etat.valeurs (convention React 19)
  const valeur = (nom: keyof Organisation) => etat.valeurs?.[nom] ?? organisation[nom] ?? "";

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pr-nom">{estProprietaire ? "Nom du parc" : "Nom de l'agence"}</Label>
        <Input id="pr-nom" name="name" required disabled={lectureSeule} defaultValue={valeur("name")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-adresse">Adresse</Label>
        <Input
          id="pr-adresse"
          name="address_line1"
          disabled={lectureSeule}
          defaultValue={valeur("address_line1")}
          placeholder="12 rue des Lilas"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-cp">Code postal</Label>
          <Input id="pr-cp" name="postal_code" disabled={lectureSeule} defaultValue={valeur("postal_code")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-ville">Ville</Label>
          <Input id="pr-ville" name="city" disabled={lectureSeule} defaultValue={valeur("city")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-tel">Téléphone</Label>
          <Input id="pr-tel" name="telephone" disabled={lectureSeule} defaultValue={valeur("telephone")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-email">Email de contact</Label>
          <Input
            id="pr-email"
            name="email_contact"
            type="email"
            disabled={lectureSeule}
            defaultValue={valeur("email_contact")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-siret">SIRET (facultatif)</Label>
        <Input id="pr-siret" name="siret" disabled={lectureSeule} defaultValue={valeur("siret")} />
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      {!lectureSeule && (
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
      )}
    </form>
  );
}
