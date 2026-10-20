"use client";

import { useActionState } from "react";
import { inscrireAgence, type EtatListeAttenteAgence } from "@/app/actions/liste-attente-agences";
import { BORNES_LISTE_ATTENTE, TRANCHES_LOTS } from "@/lib/liste-attente-agences";
import { Spinner } from "@/components/ui/spinner";

// Le formulaire de la liste d'attente des agences (20/10, page /agences), sur le modèle du formulaire de contact de
// l'accueil (formulaire-devis-vitrine.tsx) : mêmes classes de champs, même pot de miel, même pastille d'erreur, même
// bouton. Sept champs, courts : ce qu'il faut pour recontacter une agence et situer sa taille, rien de plus.
//
// Convention des formulaires publics (24/09) : « (facultatif) » sur les champs optionnels, rien sur les obligatoires.
// L'action serveur est passée telle quelle à useActionState : le navigateur sait envoyer ce formulaire sans script,
// le bouton n'attend donc pas l'hydratation (D30 B, même raison que /inscription). La saisie refusée est reposée dans
// les champs (`valeurs`) : React vide un <form action> après chaque action, erreur comprise.
export function FormulaireListeAttenteAgences() {
  const [etat, action, enCours] = useActionState<EtatListeAttenteAgence, FormData>(inscrireAgence, {});

  if (etat.succes) {
    return (
      <p role="status" className="rounded-lg bg-[var(--sur-encre)]/10 p-4 text-sm text-[var(--sur-encre)]">
        ✓ {etat.succes}
      </p>
    );
  }

  const libelle = "mb-1 block text-xs text-[var(--sur-encre)]/85";
  const champ =
    "h-10 w-full rounded-lg border border-[var(--sur-encre)]/25 bg-[var(--sur-encre)]/5 px-3 text-sm text-[var(--sur-encre)] placeholder:text-[var(--sur-encre)]/40";
  const v = etat.valeurs ?? {};
  // Après chaque action, React remet le formulaire à ses valeurs de montage (form.reset) PUIS applique les nouvelles
  // `defaultValue` : un champ texte retrouve la saisie reposée, mais un <select> garde l'option choisie au montage, donc
  // « Choisir », et la validation native bloque le renvoi. La clé change avec la saisie reposée : le formulaire est
  // remonté, chaque champ (select compris) part de la valeur que l'agence avait tapée (constaté sur le banc, 20/10).
  const cle = etat.valeurs ? JSON.stringify(etat.valeurs) : "vierge";

  return (
    <form key={cle} data-saisie-libre action={action} className="grid gap-3 sm:grid-cols-2">
      {/* Pot de miel anti-robot : invisible, doit rester vide */}
      <input
        type="text"
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />
      <div className="sm:col-span-2">
        <label htmlFor="agences-agence" className={libelle}>
          Nom de l’agence
        </label>
        <input id="agences-agence" name="agence" required maxLength={BORNES_LISTE_ATTENTE.agence} autoComplete="organization" defaultValue={v.agence} className={champ} />
      </div>
      <div>
        <label htmlFor="agences-contact" className={libelle}>
          Votre nom
        </label>
        <input id="agences-contact" name="contact" required maxLength={BORNES_LISTE_ATTENTE.contact} autoComplete="name" defaultValue={v.contact} className={champ} />
      </div>
      <div>
        <label htmlFor="agences-email" className={libelle}>
          Votre e-mail professionnel
        </label>
        <input id="agences-email" name="email" type="email" required maxLength={BORNES_LISTE_ATTENTE.email} autoComplete="email" defaultValue={v.email} className={champ} />
      </div>
      <div>
        <label htmlFor="agences-telephone" className={libelle}>
          Téléphone (facultatif)
        </label>
        <input id="agences-telephone" name="telephone" type="tel" maxLength={BORNES_LISTE_ATTENTE.telephone} autoComplete="tel" defaultValue={v.telephone} className={champ} />
      </div>
      <div>
        <label htmlFor="agences-code-postal" className={libelle}>
          Code postal de l’agence
        </label>
        {/* Six caractères : cinq chiffres, et l'espace que l'on tape parfois (« 75 011 »), retiré par la validation. */}
        <input id="agences-code-postal" name="code_postal" required inputMode="numeric" maxLength={6} autoComplete="postal-code" defaultValue={v.code_postal} className={champ} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="agences-nb-lots" className={libelle}>
          Nombre de lots gérés
        </label>
        <select id="agences-nb-lots" name="nb_lots" required defaultValue={v.nb_lots ?? ""} className={champ}>
          <option value="">Choisir</option>
          {TRANCHES_LOTS.map((t) => (
            <option key={t.code} value={t.code}>{t.libelle}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="agences-message" className={libelle}>
          Votre message (facultatif)
        </label>
        <textarea
          id="agences-message"
          name="message"
          rows={3}
          maxLength={BORNES_LISTE_ATTENTE.message}
          defaultValue={v.message}
          className={`${champ} h-auto py-2`}
        />
      </div>
      {/* Le message posé sur le bandeau bleu : une pastille claire, sinon il se confondrait avec le fond. */}
      {etat.erreur && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--ivoire)] px-3 py-2 text-sm font-medium text-[var(--destructive)] sm:col-span-2"
        >
          {etat.erreur}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={enCours} className="btn-or">
          {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Rejoindre la liste d’attente"}
        </button>
        <p className="mt-2 text-[13px] text-[var(--sur-encre)]/80">
          Vos coordonnées servent uniquement à vous prévenir de l’ouverture de l’offre aux agences. Vous pouvez en
          demander la suppression à tout moment (voir notre{" "}
          <a href="/confidentialite" className="underline underline-offset-2">politique de confidentialité</a>).
        </p>
      </div>
    </form>
  );
}
