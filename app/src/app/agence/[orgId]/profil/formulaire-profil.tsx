"use client";

import { useActionState } from "react";
import {
  modifierProfilOrganisation,
  type EtatProfilOrganisation,
} from "@/app/actions/organisation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
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
  carte_pro: string | null;
  garantie_financiere: string | null;
  iban: string | null;
  quittances_envoi_auto: boolean;
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
  const [etat, action] = useActionState<EtatProfilOrganisation, FormData>(
    modifierProfilOrganisation.bind(null, orgId),
    {}
  );
  // En erreur, la saisie est reposée via etat.valeurs (convention React 19)
  const valeur = (nom: Exclude<keyof Organisation, "quittances_envoi_auto">) =>
    etat.valeurs?.[nom] ?? organisation[nom] ?? "";

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
          <Input
            id="pr-cp"
            name="postal_code"
            inputMode="numeric"
            autoComplete="postal-code"
            disabled={lectureSeule}
            defaultValue={valeur("postal_code")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-ville">Ville</Label>
          <Input id="pr-ville" name="city" disabled={lectureSeule} defaultValue={valeur("city")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-tel">Téléphone</Label>
          {/* Au doigt, `tel` ouvre le pavé numérique plutôt que le clavier
              complet — acquis mobile du 10/09, les contrôles restent à 16 px */}
          <Input
            id="pr-tel"
            name="telephone"
            type="tel"
            autoComplete="tel"
            disabled={lectureSeule}
            defaultValue={valeur("telephone")}
          />
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
      {!estProprietaire && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pr-carte-pro">Carte professionnelle (n° et CCI)</Label>
            <Input
              id="pr-carte-pro"
              name="carte_pro"
              disabled={lectureSeule}
              defaultValue={valeur("carte_pro")}
              placeholder="CPI 7501 2026 000 000 000 — CCI de Paris"
            />
            <p className="text-xs text-muted-foreground">
              Reportée sur le bail et le mandat de gestion.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-garantie">Garantie financière (organisme, montant)</Label>
            <Input
              id="pr-garantie"
              name="garantie_financiere"
              disabled={lectureSeule}
              defaultValue={valeur("garantie_financiere")}
              placeholder="Galian, 120 000 €"
            />
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="pr-iban">IBAN (modalités de paiement des documents)</Label>
        <Input
          id="pr-iban"
          name="iban"
          disabled={lectureSeule}
          defaultValue={valeur("iban")}
          placeholder="FR76 …"
        />
        <p className="text-xs text-muted-foreground">
          Reporté sur les avis d&apos;échéance.
        </p>
      </div>
      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Envoi des quittances</legend>
        <label
          htmlFor="pr-envoi-auto"
          className="flex min-h-12 items-center gap-3 text-sm"
        >
          <input
            id="pr-envoi-auto"
            type="checkbox"
            name="quittances_envoi_auto"
            disabled={lectureSeule}
            defaultChecked={organisation.quittances_envoi_auto}
            className="size-5 shrink-0 accent-[var(--encre)]"
          />
          Envoyer automatiquement les quittances et reçus aux locataires
        </label>
        <p className="text-xs text-muted-foreground">
          Une fois par jour, les quittances émises depuis moins de 45 jours et
          jamais envoyées partent au locataire, sans qu&apos;il y ait à cliquer.
          Cocher cette case vaut validation permanente de leur envoi. Décochée,
          rien ne part sans votre geste — l&apos;envoi groupé reste disponible
          depuis la comptabilité.
        </p>
      </fieldset>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat.succes && (
        <p role="status" className="text-sm text-success-soft-foreground">
          {etat.succes}
        </p>
      )}
      {!lectureSeule && (
        <BoutonEnvoi enCoursTexte="Enregistrement…">Enregistrer</BoutonEnvoi>
      )}
    </form>
  );
}
