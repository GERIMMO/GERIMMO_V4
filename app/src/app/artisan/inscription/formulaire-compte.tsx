"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { useFormStatus } from "react-dom";
import { creerCompteArtisan, type EtatInscription } from "@/app/actions/auth";
import { adresseDepuisAncre, cheminInvitationArtisan } from "@/lib/invitations-artisan";
import { caseConditions } from "@/lib/conditions-acceptation";
import { CLASSE_BOUTON_PRINCIPAL, CLASSE_CHAMP, CLASSE_LIBELLE, Erreur } from "../ui";

/**
 * Première marche de l'artisan qui n'a pas de compte (audit du 27/09).
 *
 * L’adresse suffit ici. Le mot de passe et les conditions sont validés après
 * confirmation par e-mail, puis la fiche de l’entreprise peut être remplie.
 */
function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Création…" : "Créer mon compte"}
    </button>
  );
}

// L'ancre de l'adresse (#adresse=…) ne se lit que dans le navigateur : le serveur rend le champ vide.
const sAbonnerAucun = () => () => {};
const ancreDuNavigateur = () => window.location.hash;
const ancreDuServeur = () => "";

/**
 * `invitationId` (décision du 15/10/2026) : l'artisan arrive du lien d'une invitation. L'adresse invitée, portée par
 * l'ancre du lien, pré-remplit le champ ; le lien de confirmation (et la connexion) le ramènent ensuite sur
 * l'invitation pour l'accepter.
 */
export function FormulaireCompteArtisan({ invitationId }: { invitationId?: string } = {}) {
  const [etat, action] = useActionState<EtatInscription, FormData>(creerCompteArtisan, {});
  const ancre = useSyncExternalStore(sAbonnerAucun, ancreDuNavigateur, ancreDuServeur);
  const prerempli = invitationId ? adresseDepuisAncre(ancre) : "";
  const suite = invitationId ? cheminInvitationArtisan(invitationId) : "/artisan/inscription";
  const idEmail = useId();
  const caseArtisan = caseConditions("artisan");

  if (etat.message) {
    return (
      <p role="status" className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-4 text-base text-[var(--corps)]">
        {etat.message}
      </p>
    );
  }

  return (
    <form data-saisie-confirmee action={action} className="space-y-5">
      {invitationId && <input type="hidden" name="invitation" value={invitationId} />}
      <div className="space-y-1.5">
        <label htmlFor={idEmail} className={CLASSE_LIBELLE}>
          Adresse e-mail
        </label>
        <input
          // La clé change quand l'adresse de l'ancre est lue : le champ renaît pré-rempli, sans compter comme une saisie.
          key={prerempli || "vide"}
          id={idEmail}
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={etat.valeurs?.email ?? prerempli}
          className={CLASSE_CHAMP}
        />
        <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
          {invitationId
            ? "Utilisez l’adresse qui a reçu l’invitation\u00a0: c’est avec elle que vous pourrez l’accepter."
            : "Si un gestionnaire a déjà créé votre fiche, utilisez l’adresse qu’il a enregistrée pour vous\u00a0: c’est lui qui vous la rattache."}
        </p>
      </div>

      {/* Plan de conformité du 23/10 (R10) : les conditions de l'espace artisan dès leur publication, les conditions
          générales d'ici là (lib/conditions-acceptation.ts). */}
      <p className="text-sm text-[var(--texte-secondaire)]">
        Vous recevrez un lien pour confirmer votre adresse, choisir votre mot de passe et accepter les{" "}
        <Link href={caseArtisan.href} target="_blank" rel="noopener" className="lien-texte">{caseArtisan.lien}</Link>.
      </p>

      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

      <Envoyer />

      <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
        Déjà un compte ?{" "}
        <Link
          href={`/connexion?suite=${encodeURIComponent(suite)}`}
          className="inline-flex min-h-11 items-center font-medium text-[var(--encre)] underline underline-offset-4"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
