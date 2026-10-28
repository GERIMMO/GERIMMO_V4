"use client";

import { useActionState } from "react";
import { demanderDevis, type EtatDevis } from "@/app/actions/devis";
import { Spinner } from "@/components/ui/spinner";

// Formulaire de contact du site vitrine. Jusqu'au 13/10 il servait aux demandes
// de devis des agences ; la V1 publique n'a plus d'offre agence, c'est devenu le
// canal de contact général (et, tant que l'adresse de l'éditeur manque, celui des
// pages légales : voir FORMULAIRE_ACCUEIL). Champs volontairement courts ; le
// message est obligatoire, sans quoi la demande ne dit rien. Le nom du fichier
// et la table `demandes_devis` ne changent pas (les anciennes demandes restent).
//
// 24/09 : une seule convention dans les formulaires publics — « (facultatif) »
// sur les champs optionnels, rien sur les obligatoires. Deux astérisques sans
// légende et un seul « facultatif » sur quatre ne disaient rien de sûr.
// Libellés à 85 % et mention à 80 % : à 70 et 55 %, le texte se perdait dans
// le bleu foncé de fin de dégradé, sous le contraste de 4,5:1.
export function FormulaireDevisVitrine() {
  const [etat, action, enCours] = useActionState<EtatDevis, FormData>(demanderDevis, {});

  if (etat.succes) {
    return (
      <p className="rounded-lg bg-[var(--sur-encre)]/10 p-4 text-sm text-[var(--sur-encre)]">
        ✓ {etat.succes}
      </p>
    );
  }

  const libelle = "mb-1 block text-xs text-[var(--sur-encre)]/85";
  const champ =
    "h-10 w-full rounded-lg border border-[var(--sur-encre)]/25 bg-[var(--sur-encre)]/5 px-3 text-sm text-[var(--sur-encre)] placeholder:text-[var(--sur-encre)]/40";

  return (
    <form data-saisie-libre action={action} className="grid gap-3 sm:grid-cols-2">
      {/* Pot de miel anti-robot : invisible, doit rester vide */}
      <input
        type="text"
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />
      <div>
        <label htmlFor="devis-nom" className={libelle}>
          Votre nom
        </label>
        <input id="devis-nom" name="nom" required maxLength={200} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-email" className={libelle}>
          Votre e-mail
        </label>
        <input id="devis-email" name="email" type="email" required maxLength={320} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-telephone" className={libelle}>
          Téléphone (facultatif)
        </label>
        <input id="devis-telephone" name="telephone" type="tel" maxLength={40} className={champ} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="devis-message" className={libelle}>
          Votre message
        </label>
        <textarea
          id="devis-message"
          name="message"
          rows={4}
          required
          maxLength={4000}
          className={`${champ} h-auto py-2`}
        />
      </div>
      {/* Le message posé sur le bandeau bleu : une pastille blanche, sinon il
          se confondrait avec le fond et l'erreur passerait inaperçue. */}
      {etat.erreur && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--ivoire)] px-3 py-2 text-sm font-medium text-[var(--destructive)] sm:col-span-2"
        >
          {etat.erreur}
        </p>
      )}
      <div className="sm:col-span-2">
        {/* Le bandeau porte déjà le bouton doré « Créer mon compte » : un seul primaire par écran (audit final, UX-18). */}
        <button type="submit" disabled={enCours} className="btn-secondaire">
          {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Envoyer mon message"}
        </button>
        {/* Intégration des textes du 24/10 (finition conservation, M5) : la demande vit 24 mois (contact:devis) ; le
            suivi commercial d'un professionnel né de sa demande, trois ans après son dernier contact (contact:prospect).
            « uniquement à vous répondre » n'était donc plus exact pour un professionnel. */}
        <p className="mt-2 text-[13px] text-[var(--sur-encre)]/80">
          Ces informations servent à vous répondre au sujet de votre message —
          jamais cédées ni revendues. Le délai court à partir du dernier traitement de votre demande,
          ou de votre dernier contact pour le suivi commercial des professionnels.
          Les durées en vigueur figurent dans notre politique de confidentialité.{" "}
          <a href="/confidentialite" className="underline underline-offset-2">
            En savoir plus
          </a>
        </p>
      </div>
    </form>
  );
}
