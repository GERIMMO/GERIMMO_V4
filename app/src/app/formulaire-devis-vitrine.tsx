"use client";

import { useActionState } from "react";
import { demanderDevis, type EtatDevis } from "@/app/actions/devis";

// Formulaire de devis du site vitrine (agences). Champs libres volontairement
// courts — le circuit commercial (module 16) prend le relais par email.
export function FormulaireDevisVitrine() {
  const [etat, action, enCours] = useActionState<EtatDevis, FormData>(demanderDevis, {});

  if (etat.succes) {
    return (
      <p className="rounded-lg bg-[var(--sur-encre)]/10 p-4 text-sm text-[var(--sur-encre)]">
        ✓ {etat.succes}
      </p>
    );
  }

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
        <label htmlFor="devis-nom" className="mb-1 block text-xs text-[var(--sur-encre)]/70">
          Votre nom *
        </label>
        <input id="devis-nom" name="nom" required maxLength={200} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-email" className="mb-1 block text-xs text-[var(--sur-encre)]/70">
          Email professionnel *
        </label>
        <input id="devis-email" name="email" type="email" required maxLength={320} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-agence" className="mb-1 block text-xs text-[var(--sur-encre)]/70">
          Votre agence
        </label>
        <input id="devis-agence" name="agence" maxLength={200} className={champ} />
      </div>
      <div>
        <label htmlFor="devis-lots" className="mb-1 block text-xs text-[var(--sur-encre)]/70">
          Lots en gestion (environ)
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
        <label htmlFor="devis-message" className="mb-1 block text-xs text-[var(--sur-encre)]/70">
          Un mot sur votre besoin
        </label>
        <textarea
          id="devis-message"
          name="message"
          rows={3}
          maxLength={4000}
          className={`${champ} h-auto py-2`}
        />
      </div>
      {etat.erreur && (
        <p className="text-sm text-[var(--or)] sm:col-span-2">{etat.erreur}</p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={enCours} className="btn-or">
          {enCours ? "Envoi…" : "Demander un devis"}
        </button>
      </div>
    </form>
  );
}
