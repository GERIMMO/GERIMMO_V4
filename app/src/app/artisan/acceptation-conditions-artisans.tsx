"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { accepterConditionsArtisans, type EtatAcceptationConditions } from "@/app/actions/acceptation-conditions";
import { CASE_CONDITIONS_ARTISANS } from "@/lib/conditions-acceptation";
import { CLASSE_BOUTON_PRINCIPAL, Carte, Erreur, Succes, TitreSection } from "./ui";

function Valider() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Enregistrement…" : "Continuer vers mon espace"}
    </button>
  );
}

/**
 * La garde de l'espace artisan (plan de conformité du 23/10/2026, R10) : une fois les conditions de l'espace artisan
 * publiées, l'artisan les accepte avant d'utiliser son espace. Affichée par src/app/artisan/layout.tsx à la place de la
 * page demandée ; l'en-tête reste (compte, déconnexion, aide). Inactive tant que CONDITIONS_ARTISANS_VERSION vaut null.
 */
export function AcceptationConditionsArtisans({ version, date }: { version: string; date: string | null }) {
  const [etat, action] = useActionState<EtatAcceptationConditions, FormData>(accepterConditionsArtisans, {});
  return (
    <Carte>
      <TitreSection>Conditions de l’espace artisan</TitreSection>
      <p className="text-base text-[var(--corps)]">
        Votre espace artisan est régi par ses propres conditions{date ? `, dans leur version du ${date}` : ""}. Lisez-les,
        puis acceptez-les pour continuer.
      </p>
      {etat.succes ? (
        <Succes>{etat.succes}</Succes>
      ) : (
        <form data-saisie-libre action={action} className="space-y-4">
          <input type="hidden" name="cgu_version" value={version} />
          <label className="flex min-h-11 items-center gap-3 text-base text-[var(--corps)]">
            <input type="checkbox" name="cgu" required className="size-6 shrink-0" />
            <span>
              {CASE_CONDITIONS_ARTISANS.avant}
              <Link href={CASE_CONDITIONS_ARTISANS.href} target="_blank" rel="noopener" className="lien-texte">
                {CASE_CONDITIONS_ARTISANS.lien}
              </Link>
              {CASE_CONDITIONS_ARTISANS.apres}
            </span>
          </label>
          {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
          <Valider />
        </form>
      )}
    </Carte>
  );
}
