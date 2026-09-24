"use client";

import { useActionState } from "react";
import { demanderDevis, type EtatDevis } from "@/app/actions/devis";
import { Spinner } from "@/components/ui/spinner";

// Formulaire de devis du site vitrine (agences). Champs libres volontairement
// courts — le circuit commercial (module 16) prend le relais par e-mail.
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
    <form action={action} className="grid gap-3 sm:grid-cols-2">
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
          E-mail professionnel
        </label>
        <input id="devis-email" name="email" type="email" required maxLength={320} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-agence" className={libelle}>
          Votre agence (facultatif)
        </label>
        <input id="devis-agence" name="agence" maxLength={200} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-telephone" className={libelle}>
          Téléphone (facultatif)
        </label>
        <input id="devis-telephone" name="telephone" type="tel" maxLength={40} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-lots" className={libelle}>
          Lots en gestion, environ (facultatif)
        </label>
        <select id="devis-lots" name="nb_lots" defaultValue="" className={champ}>
          <option value="">—</option>
          <option value="1-50">1 à 50</option>
          <option value="51-150">51 à 150</option>
          <option value="151-300">151 à 300</option>
          <option value="300+">Plus de 300</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="devis-message" className={libelle}>
          Un mot sur votre besoin (facultatif)
        </label>
        <textarea
          id="devis-message"
          name="message"
          rows={3}
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
        <button type="submit" disabled={enCours} className="btn-or">
          {enCours ? <><Spinner className="size-3" /> Envoi…</> : "Demander un devis"}
        </button>
        <p className="mt-2 text-[13px] text-[var(--sur-encre)]/80">
          Ces informations servent uniquement à vous recontacter au sujet de
          votre demande — jamais transmises, supprimées au plus tard après
          24 mois.{" "}
          <a href="/confidentialite" className="underline underline-offset-2">
            En savoir plus
          </a>
        </p>
      </div>
    </form>
  );
}
