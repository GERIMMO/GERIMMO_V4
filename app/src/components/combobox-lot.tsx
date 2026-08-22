"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type LotOption = { id: string; libelle: string };

const normaliser = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// Recherche et choix en un seul champ (recette 21/08, C.5.4) : l'ancien
// duo « filtre + select » perdait la sélection quand on retapait dans le
// filtre, et filtrer ne présélectionnait rien. Ici : on tape, la liste se
// réduit, on clique — le libellé choisi reste affiché, retaper le libère.
export function ComboboxLot({
  lots,
  name = "lot_id",
  id,
  placeholder = "Adresse, lot, ville…",
  requis = false,
}: {
  lots: LotOption[];
  name?: string;
  id?: string;
  placeholder?: string;
  requis?: boolean;
}) {
  const [saisie, setSaisie] = useState("");
  const [choisi, setChoisi] = useState<LotOption | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const fermeture = useRef<number | undefined>(undefined);

  const visibles = useMemo(() => {
    const motif = normaliser(saisie);
    const liste = motif
      ? lots.filter((l) => normaliser(l.libelle).includes(motif))
      : lots;
    return liste.slice(0, 8);
  }, [lots, saisie]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={choisi?.id ?? ""} required={requis} />
      <Input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={ouvert}
        aria-autocomplete="list"
        value={choisi ? choisi.libelle : saisie}
        placeholder={placeholder}
        onChange={(e) => {
          setChoisi(null);
          setSaisie(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => {
          // Laisser le clic sur une option aboutir avant de fermer
          fermeture.current = window.setTimeout(() => setOuvert(false), 150);
        }}
      />
      {ouvert && !choisi && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto border border-border bg-background shadow-md">
          {visibles.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Aucun lot ne correspond.
            </li>
          ) : (
            visibles.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={() => {
                    window.clearTimeout(fermeture.current);
                    setChoisi(l);
                    setOuvert(false);
                  }}
                >
                  {l.libelle}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
