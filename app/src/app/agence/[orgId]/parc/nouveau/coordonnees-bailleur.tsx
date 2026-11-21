"use client";

import Link from "next/link";
import { useId } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { completerCoordonneesBailleur, type EtatProfilOrganisation } from "@/app/actions/organisation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * « Ajouter un bien », profil incomplet (20/11/2026) : les quatre coordonnées qui désignent le bailleur, sur place.
 *
 * D29 B : l'adresse se demande à la création du premier bien, pas à l'inscription. Le détour par le profil complet
 * (nom de l'espace, téléphone, relances, trois étapes) arrêtait des propriétaires avant leur premier bien : on ne
 * demande ici que ce qui manque. Les valeurs déjà connues sont reprises ; l'e-mail de contact propose celui du compte,
 * que le propriétaire peut changer. Une fois enregistrées, la page se recharge et le formulaire du bien apparaît.
 */
export function CoordonneesBailleur({
  orgId,
  manquants,
  initiales,
  lienProfil,
}: {
  orgId: string;
  manquants: string[];
  initiales: { address_line1: string; postal_code: string; city: string; email_contact: string };
  lienProfil: string;
}) {
  const [etat, action] = useActionState<EtatProfilOrganisation, FormData>(completerCoordonneesBailleur.bind(null, orgId), {});
  const id = useId();
  const valeur = (nom: keyof typeof initiales) => etat.valeurs?.[nom] ?? initiales[nom];

  return (
    <section className="loc-carte" aria-labelledby={`${id}-titre`}>
      <h2 id={`${id}-titre`} className="text-lg font-semibold">
        D&apos;abord, vos coordonnées de bailleur
      </h2>
      <p className="mesure-lecture mt-1.5 text-sm text-muted-foreground">
        Il manque {manquants.join(" et ")}. Ils vous désignent comme bailleur dans le bail, les quittances et les avis
        d&apos;échéance : renseignez-les ici, puis créez votre bien.
      </p>
      {/* Saisie suivie : quitter la page avec une adresse à moitié écrite avertit, comme sur le profil. */}
      <form data-saisie-confirmee action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-adresse`}>Votre adresse</Label>
          <Input id={`${id}-adresse`} name="address_line1" required maxLength={200} autoComplete="street-address" defaultValue={valeur("address_line1")} />
        </div>
        <div>
          <Label htmlFor={`${id}-cp`}>Code postal</Label>
          <Input id={`${id}-cp`} name="postal_code" required maxLength={20} autoComplete="postal-code" inputMode="numeric" defaultValue={valeur("postal_code")} />
        </div>
        <div>
          <Label htmlFor={`${id}-ville`}>Ville</Label>
          <Input id={`${id}-ville`} name="city" required maxLength={100} autoComplete="address-level2" defaultValue={valeur("city")} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-email`}>E-mail de contact</Label>
          <Input id={`${id}-email`} name="email_contact" type="email" required maxLength={320} autoComplete="email" defaultValue={valeur("email_contact")} aria-describedby={`${id}-email-aide`} />
          <p id={`${id}-email-aide`} className="mt-1 text-xs text-muted-foreground">
            Celui que vos locataires verront sur les documents. Vous pouvez le changer.
          </p>
        </div>
        {etat.erreur && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {etat.erreur}
          </p>
        )}
        {etat.succes && (
          <p role="status" className="text-sm sm:col-span-2">
            {etat.succes}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <BoutonEnvoi className="btn-or" enCoursTexte="Enregistrement…">
            Enregistrer et créer mon bien
          </BoutonEnvoi>
          <Link href={lienProfil} className="text-sm underline underline-offset-2">
            Compléter tout mon profil
          </Link>
        </div>
      </form>
    </section>
  );
}
