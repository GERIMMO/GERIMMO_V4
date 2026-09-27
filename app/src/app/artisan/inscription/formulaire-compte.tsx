"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { creerCompteArtisan, type EtatInscription } from "@/app/actions/auth";
import { CLASSE_BOUTON_PRINCIPAL, CLASSE_CHAMP, CLASSE_LIBELLE, Erreur } from "../ui";

/**
 * Première marche de l'artisan qui n'a pas de compte (audit du 27/09).
 *
 * Trois champs et une case : l'adresse, le mot de passe deux fois, les
 * conditions. Rien de l'entreprise ici — la fiche (SIRET, métiers, mobile)
 * se remplit juste après, sur la même page, une fois le compte ouvert. Le
 * compte naît sans organisation et marqué « artisan » : il ne peut pas
 * glisser vers un espace propriétaire.
 */
function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Création…" : "Créer mon compte"}
    </button>
  );
}

export function FormulaireCompteArtisan() {
  const [etat, action] = useActionState<EtatInscription, FormData>(creerCompteArtisan, {});
  const idEmail = useId();
  const idMdp = useId();
  const idConfirmation = useId();
  const idCgu = useId();

  if (etat.message) {
    return (
      <p role="status" className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-4 text-base text-[var(--corps)]">
        {etat.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={idEmail} className={CLASSE_LIBELLE}>
          Adresse e-mail
        </label>
        <input
          id={idEmail}
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={etat.valeurs?.email}
          className={CLASSE_CHAMP}
        />
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
          Si une agence a déjà créé votre fiche, utilisez l&apos;adresse qu&apos;elle
          a enregistrée pour vous : c&apos;est elle qui vous la rattache.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idMdp} className={CLASSE_LIBELLE}>
          Mot de passe
        </label>
        <input
          id={idMdp}
          name="mot_de_passe"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={CLASSE_CHAMP}
        />
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">12 caractères minimum.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={idConfirmation} className={CLASSE_LIBELLE}>
          Confirmer le mot de passe
        </label>
        <input
          id={idConfirmation}
          name="confirmation"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={CLASSE_CHAMP}
        />
      </div>

      <label htmlFor={idCgu} className="flex min-h-12 items-center gap-3 text-base text-[var(--corps)]">
        <input
          id={idCgu}
          type="checkbox"
          name="cgu"
          value="1"
          required
          defaultChecked={etat.valeurs?.cgu === "1"}
          className="size-6 shrink-0 accent-[var(--encre)]"
        />
        <span>
          J&apos;accepte les{" "}
          <Link href="/conditions" target="_blank" rel="noopener" className="lien-texte">
            conditions générales d&apos;utilisation
          </Link>
        </span>
      </label>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />

      <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
        Déjà un compte ?{" "}
        <Link
          href="/connexion?suite=%2Fartisan%2Finscription"
          className="inline-flex min-h-11 items-center font-medium text-[var(--encre)] underline underline-offset-4"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
