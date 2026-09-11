"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type LotOption = { id: string; libelle: string };

const normaliser = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// Au-delà, la liste déborde de l'écran : on n'en montre qu'une tranche — et on
// DIT combien restent (relevé du 11/09 : troncature silencieuse, l'agent d'un
// gros parc croyait que son lot n'existait pas).
const MAX_VISIBLES = 8;

// Recherche et choix en un seul champ (recette 21/08, C.5.4) : l'ancien
// duo « filtre + select » perdait la sélection quand on retapait dans le
// filtre, et filtrer ne présélectionnait rien. Ici : on tape, la liste se
// réduit, on clique — le libellé choisi reste affiché, retaper le libère.
//
// Accessibilité (relevé du 11/09) : le champ s'annonçait `role="combobox"`
// mais la liste n'avait ni `listbox`, ni `option`, ni `aria-activedescendant`,
// et aucune touche ne la parcourait — au lecteur d'écran comme au clavier,
// le composant était inutilisable. Motif ARIA complet ci-dessous : le focus
// reste dans le champ, l'option courante est désignée par son id.
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
  const [actif, setActif] = useState(0);
  const fermeture = useRef<number | undefined>(undefined);
  const prefixe = useId();
  const idListe = `${prefixe}-listbox`;
  const idOption = (i: number) => `${prefixe}-opt-${i}`;

  const { visibles, restants } = useMemo(() => {
    const motif = normaliser(saisie);
    const liste = motif
      ? lots.filter((l) => normaliser(l.libelle).includes(motif))
      : lots;
    return {
      visibles: liste.slice(0, MAX_VISIBLES),
      restants: Math.max(0, liste.length - MAX_VISIBLES),
    };
  }, [lots, saisie]);

  const deplie = ouvert && !choisi;

  const retenir = (l: LotOption) => {
    window.clearTimeout(fermeture.current);
    setChoisi(l);
    setOuvert(false);
    setActif(0);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={choisi?.id ?? ""} required={requis} />
      <Input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={deplie}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-activedescendant={
          deplie && visibles.length > 0 ? idOption(actif) : undefined
        }
        value={choisi ? choisi.libelle : saisie}
        placeholder={placeholder}
        onChange={(e) => {
          setChoisi(null);
          setSaisie(e.target.value);
          setActif(0);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOuvert(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!deplie) {
              setOuvert(true);
              return;
            }
            if (visibles.length === 0) return;
            const pas = e.key === "ArrowDown" ? 1 : -1;
            setActif((i) => (i + pas + visibles.length) % visibles.length);
            return;
          }
          // Entrée choisit l'option courante sans soumettre le formulaire
          if (e.key === "Enter" && deplie && visibles[actif]) {
            e.preventDefault();
            retenir(visibles[actif]);
          }
        }}
        onBlur={() => {
          // Laisser le clic sur une option aboutir avant de fermer
          fermeture.current = window.setTimeout(() => setOuvert(false), 150);
        }}
      />
      {/* La liste existe toujours dans l'arbre : un listbox qui apparaît et
          disparaît casse la relation aria-controls. Seules des <li role="option">
          vivent dedans — le message vide et le compte des non-affichés sont
          en dehors, un listbox n'accepte pas d'autre enfant. */}
      <div
        hidden={!deplie}
        className="absolute z-10 mt-1 max-h-56 w-full overflow-auto border border-border bg-background shadow-md"
      >
        <ul id={idListe} role="listbox" aria-label="Lots proposés">
          {visibles.map((l, i) => (
            <li
              key={l.id}
              id={idOption(i)}
              role="option"
              aria-selected={i === actif}
              // 40 px au doigt (acquis mobile du 10/09)
              className={`flex min-h-10 cursor-pointer items-center px-3 py-2 text-sm ${
                i === actif ? "bg-accent text-accent-foreground" : ""
              }`}
              onMouseEnter={() => setActif(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                retenir(l);
              }}
            >
              {l.libelle}
            </li>
          ))}
        </ul>
        {visibles.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            Aucun lot ne correspond.
          </p>
        )}
        {restants > 0 && (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {restants} autre{restants > 1 ? "s" : ""} lot{restants > 1 ? "s" : ""}{" "}
            correspond{restants > 1 ? "ent" : ""} — précisez votre recherche.
          </p>
        )}
      </div>
    </div>
  );
}
