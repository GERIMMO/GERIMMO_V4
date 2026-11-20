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
      <p role="status" className="public-contact-succes">
        ✓ {etat.succes}
      </p>
    );
  }

  // Champs du Design System : la règle commune des champs (44 px, filet, rayon) et `.public-contact` dans vitrine.css
  // les habillent ; aucune classe de couleur ou de hauteur n'est recopiée ici.
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
        <label htmlFor="agences-agence">
          Nom de l’agence
        </label>
        <input id="agences-agence" name="agence" required maxLength={BORNES_LISTE_ATTENTE.agence} autoComplete="organization" defaultValue={v.agence} />
      </div>
      <div>
        <label htmlFor="agences-contact">
          Votre nom
        </label>
        <input id="agences-contact" name="contact" required maxLength={BORNES_LISTE_ATTENTE.contact} autoComplete="name" defaultValue={v.contact} />
      </div>
      <div>
        <label htmlFor="agences-email">
          Votre e-mail professionnel
        </label>
        <input id="agences-email" name="email" type="email" required maxLength={BORNES_LISTE_ATTENTE.email} autoComplete="email" defaultValue={v.email} />
      </div>
      <div>
        <label htmlFor="agences-telephone">
          Téléphone (facultatif)
        </label>
        <input id="agences-telephone" name="telephone" type="tel" maxLength={BORNES_LISTE_ATTENTE.telephone} autoComplete="tel" defaultValue={v.telephone} />
      </div>
      <div>
        <label htmlFor="agences-code-postal">
          Code postal de l’agence
        </label>
        {/* Six caractères : cinq chiffres, et l'espace que l'on tape parfois (« 75 011 »), retiré par la validation. */}
        <input id="agences-code-postal" name="code_postal" required inputMode="numeric" maxLength={6} autoComplete="postal-code" defaultValue={v.code_postal} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="agences-nb-lots">
          Nombre de lots gérés
        </label>
        <select id="agences-nb-lots" name="nb_lots" required defaultValue={v.nb_lots ?? ""}>
          <option value="">Choisir</option>
          {TRANCHES_LOTS.map((t) => (
            <option key={t.code} value={t.code}>{t.libelle}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="agences-message">
          Votre message (facultatif)
        </label>
        <textarea
          id="agences-message"
          name="message"
          rows={3}
          maxLength={BORNES_LISTE_ATTENTE.message}
          defaultValue={v.message}
        />
      </div>
      {/* L'erreur, dans la carte du formulaire : fond et texte de l'état « erreur ». */}
      {etat.erreur && (
        <p
          role="alert"
          className="public-contact-erreur sm:col-span-2"
        >
          {etat.erreur}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={enCours} className="btn-or">
          {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Rejoindre la liste d’attente"}
        </button>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
          {/* Plan de conformité du 23/10 (lot 4, constat R44) : déclencheur « Inscription » et retrait traité dans le mois. */}
          Vos coordonnées servent uniquement à vous prévenir de l’ouverture de l’offre aux agences et à donner suite à
          vos réponses. Vous pouvez vous y opposer à tout moment, en répondant à l’un de nos messages ou en nous
          écrivant ; elles sont supprimées au terme du délai indiqué dans notre politique, compté depuis votre inscription, ou dans le mois de votre demande de
          retrait (voir notre{" "}
          <a href="/confidentialite" className="underline underline-offset-2">politique de confidentialité</a>).
        </p>
      </div>
    </form>
  );
}
