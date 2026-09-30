"use client";

import { useEffect, useId, useRef, useState } from "react";
import { lireSuggestionsAdresse, urlRechercheAdresse, type SuggestionAdresse } from "@/lib/outils/irl-logement";

// L'ADRESSE DU LOGEMENT, AVEC LES SUGGESTIONS DE LA BASE ADRESSE NATIONALE
// (30/09). Même appel que l'écran « Ajouter un bien » (agence/parc) :
// api-adresse.data.gouv.fr, 5 suggestions, après 4 caractères et 300 ms de
// pause ; la CSP l'autorise déjà (connect-src). Hors ligne ou API muette, la
// saisie libre reste possible. Motif « combobox » de l'ARIA : flèches,
// Entrée pour choisir, Échap pour fermer.

export function ChampAdresse({
  id,
  libelle,
  valeur,
  onChange,
  onChoix,
  aide,
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  onChoix: (s: SuggestionAdresse) => void;
  aide?: string;
}) {
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const [active, setActive] = useState(-1);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requete = useRef<AbortController | null>(null);
  const idListe = `${id}-suggestions`;
  const idAide = aide ? `${id}-aide` : undefined;
  const prefixe = useId();

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
      requete.current?.abort();
    },
    []
  );

  function rechercher(saisie: string) {
    onChange(saisie);
    if (minuterie.current) clearTimeout(minuterie.current);
    if (saisie.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    minuterie.current = setTimeout(async () => {
      requete.current?.abort();
      const controleur = new AbortController();
      requete.current = controleur;
      try {
        const r = await fetch(urlRechercheAdresse(saisie), { signal: controleur.signal });
        if (!r.ok) return;
        setSuggestions(lireSuggestionsAdresse(await r.json()));
        setActive(-1);
      } catch {
        // Hors ligne, API indisponible ou requête remplacée : la saisie libre reste possible.
      }
    }, 300);
  }

  function choisir(s: SuggestionAdresse) {
    onChange(s.label);
    onChoix(s);
    setSuggestions([]);
    setActive(-1);
  }

  const ouvert = suggestions.length > 0;

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-[var(--encre)]">
        {libelle}
      </label>
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 fill-none stroke-[var(--libelle)]"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.3" />
        </svg>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={ouvert}
          aria-controls={idListe}
          aria-activedescendant={ouvert && active >= 0 ? `${prefixe}-${active}` : undefined}
          aria-describedby={idAide}
          autoComplete="off"
          value={valeur}
          placeholder="12 rue des Lilas, Lyon"
          onChange={(e) => rechercher(e.target.value)}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          onKeyDown={(e) => {
            if (!ouvert) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choisir(suggestions[active]);
            } else if (e.key === "Escape") {
              setSuggestions([]);
            }
          }}
          className="outil-champ !pl-10"
        />
      </div>
      <ul
        id={idListe}
        role="listbox"
        aria-label="Adresses suggérées"
        hidden={!ouvert}
        className="absolute inset-x-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] py-1 shadow-[var(--ombre-flottante)]"
      >
        {suggestions.map((s, i) => (
          <li
            key={`${s.label}-${i}`}
            id={`${prefixe}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              choisir(s);
            }}
            className={`flex min-h-11 cursor-pointer flex-col justify-center px-3.5 py-1.5 text-[14px] ${
              i === active ? "bg-[var(--survol)]" : "hover:bg-[var(--survol)]"
            }`}
          >
            <span className="font-medium text-[var(--encre)]">{s.name}</span>
            <span className="text-[12.5px] text-[var(--texte-secondaire)]">
              {s.postcode} {s.city}
            </span>
          </li>
        ))}
      </ul>
      {aide && (
        <p id={idAide} className="mt-1.5 text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
          {aide}
        </p>
      )}
    </div>
  );
}
