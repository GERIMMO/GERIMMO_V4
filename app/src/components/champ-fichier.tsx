"use client";

import { useState, type ChangeEvent, type Ref } from "react";

// CHAMP FICHIER EN FRANÇAIS (relevé du 25/09, D10). Un `<input type="file">`
// nu rend le libellé du navigateur — « Choose File / No file chosen » sur un
// navigateur en anglais, quel que soit le `lang` de la page. Ici, le champ
// natif reste (c'est lui que le formulaire envoie et que `required` vérifie),
// mais il est masqué : ce que l'on voit est un bouton « Choisir un fichier »
// et le nom de ce qui a été choisi. Le focus clavier tombe toujours sur le
// champ natif ; l'anneau s'affiche sur le bouton (`has-[:focus-visible]`).
export function ChampFichier({
  id,
  name,
  accept,
  multiple = false,
  required = false,
  libelle,
  vide = "Aucun fichier choisi",
  className = "",
  onChange,
  ref,
  "aria-label": ariaLabel,
}: {
  /** Requis : c'est lui qui relie le bouton (label) au champ natif. */
  id: string;
  name: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  /** Le mot du bouton ; par défaut selon `multiple`. */
  libelle?: string;
  /** Ce qui se lit tant que rien n'est choisi. */
  vide?: string;
  className?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  ref?: Ref<HTMLInputElement>;
  "aria-label"?: string;
}) {
  const [noms, setNoms] = useState<string[]>([]);
  const mot = libelle ?? (multiple ? "Choisir des fichiers" : "Choisir un fichier");
  const resume =
    noms.length === 0
      ? vide
      : noms.length <= 2
        ? noms.join(", ")
        : `${noms.length} fichiers : ${noms.slice(0, 2).join(", ")}…`;
  return (
    <span
      className={`inline-flex min-h-11 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 ${className}`}
    >
      {/* Le champ natif, présent pour le formulaire et le clavier, invisible à l'œil */}
      <input
        ref={ref}
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={(e) => {
          // Les noms se lisent AVANT tout traitement (compression) : la liste
          // du champ peut être remplacée ensuite, les noms restent les mêmes.
          setNoms(Array.from(e.currentTarget.files ?? []).map((f) => f.name));
          onChange?.(e);
        }}
      />
      {/* Un label est le seul élément qui ouvre le sélecteur sans script,
          d'où le bouton dessiné dessus ; `id` est requis pour l'association. */}
      <label htmlFor={id} className="btn-secondaire shrink-0 cursor-pointer">
        {mot}
      </label>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" aria-live="polite">
        {resume}
      </span>
    </span>
  );
}
