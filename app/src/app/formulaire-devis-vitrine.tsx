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
// Design System « Maison » (20/11) : le formulaire est une carte blanche posée sur le panneau bleu nuit
// (`.public-contact form`, vitrine.css). Libellés et mention s'y lisent en encre, le bouton principal est bleu nuit.
export function FormulaireDevisVitrine() {
  const [etat, action, enCours] = useActionState<EtatDevis, FormData>(demanderDevis, {});

  if (etat.succes) {
    return (
      <p className="public-contact-succes">
        ✓ {etat.succes}
      </p>
    );
  }

  // Champs du Design System : la règle commune des champs (44 px, filet, rayon) et `.public-contact` dans vitrine.css
  // les habillent ; aucune classe de couleur ou de hauteur n'est recopiée ici.

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
        <label htmlFor="devis-nom">
          Votre nom
        </label>
        <input id="devis-nom" name="nom" required maxLength={200} />
      </div>
      <div>
        <label htmlFor="devis-email">
          Votre e-mail
        </label>
        <input id="devis-email" name="email" type="email" required maxLength={320} />
      </div>
      <div>
        <label htmlFor="devis-telephone">
          Téléphone (facultatif)
        </label>
        <input id="devis-telephone" name="telephone" type="tel" maxLength={40} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="devis-message">
          Votre message
        </label>
        <textarea
          id="devis-message"
          name="message"
          rows={4}
          required
          maxLength={4000}
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
          {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Envoyer mon message"}
        </button>
        {/* Intégration des textes du 24/10 (finition conservation, M5) : la demande vit 24 mois (contact:devis) ; le
            suivi commercial d'un professionnel né de sa demande, trois ans après son dernier contact (contact:prospect).
            « uniquement à vous répondre » n'était donc plus exact pour un professionnel. */}
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
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
