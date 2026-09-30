import type { ReactNode } from "react";

// LES CHAMPS DES OUTILS GRATUITS (29/09, habillés le 30/09). Un libellé
// visible par champ, relié par htmlFor ; 44 px de haut ; 16 px de texte sous
// 640 px (sinon iOS zoome au focus — règle de globals.css). Les montants se
// saisissent en texte avec clavier décimal : « 146,68 » s'écrit à la française.
//
// 30/09 : les choix courts (trimestre, âge, tranche d'imposition, mode de
// paiement) passent en contrôle segmenté — des boutons radio natifs, dans un
// fieldset, dont la zone de clic couvre tout le segment (44 px) ; les cases à
// cocher deviennent des interrupteurs (case native, dessinée en CSS).

const CLASSE_CHAMP = "outil-champ";
const CLASSE_LIBELLE = "mb-1.5 block text-[13px] font-semibold text-[var(--encre)]";

function Aide({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
      {children}
    </p>
  );
}

export function Champ({
  id,
  libelle,
  valeur,
  onChange,
  suffixe,
  aide,
  type = "text",
  decimal = false,
  autoComplete = "off",
  placeholder,
}: {
  id: string;
  libelle: ReactNode;
  valeur: string;
  onChange: (v: string) => void;
  suffixe?: string;
  aide?: ReactNode;
  type?: "text" | "date" | "month";
  decimal?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const idAide = aide ? `${id}-aide` : undefined;
  const largeSuffixe = suffixe && suffixe.length > 2;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={CLASSE_LIBELLE}>
        {libelle}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          inputMode={decimal ? "decimal" : undefined}
          autoComplete={autoComplete}
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={idAide}
          className={`${CLASSE_CHAMP} ${suffixe ? (largeSuffixe ? "outil-champ-suffixe-large" : "outil-champ-suffixe") : ""} ${decimal ? "montant text-right" : ""}`}
        />
        {suffixe && (
          <span aria-hidden className="outil-suffixe">
            {suffixe}
          </span>
        )}
      </div>
      {aide && <Aide id={idAide}>{aide}</Aide>}
    </div>
  );
}

export function Choix<T extends string>({
  id,
  libelle,
  valeur,
  onChange,
  options,
  aide,
}: {
  id: string;
  libelle: ReactNode;
  valeur: T;
  onChange: (v: T) => void;
  options: { valeur: T; libelle: string }[];
  aide?: ReactNode;
}) {
  const idAide = aide ? `${id}-aide` : undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={CLASSE_LIBELLE}>
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(e) => onChange(e.target.value as T)}
        aria-describedby={idAide}
        className={`${CLASSE_CHAMP} outil-liste`}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      {aide && <Aide id={idAide}>{aide}</Aide>}
    </div>
  );
}

/**
 * Un choix court en segments : des radios natives (clavier, lecteurs
 * d'écran), dans un fieldset dont la légende est le libellé.
 */
export function Segments<T extends string>({
  nom,
  libelle,
  valeur,
  onChange,
  options,
  aide,
  colonnes,
}: {
  nom: string;
  libelle: ReactNode;
  valeur: T;
  onChange: (v: T) => void;
  options: { valeur: T; libelle: string }[];
  aide?: ReactNode;
  /** Classe de grille (ex. « grid-cols-2 sm:grid-cols-4 ») ; par défaut une ligne. */
  colonnes?: string;
}) {
  const idAide = aide ? `${nom}-aide` : undefined;
  return (
    <fieldset className="min-w-0" aria-describedby={idAide}>
      <legend className={CLASSE_LIBELLE}>{libelle}</legend>
      <div className={`outil-segments ${colonnes ? `grid ${colonnes}` : "flex"}`}>
        {options.map((o) => (
          <label key={o.valeur} className="outil-segment">
            <input
              type="radio"
              name={nom}
              value={o.valeur}
              checked={valeur === o.valeur}
              onChange={() => onChange(o.valeur)}
            />
            <span>{o.libelle}</span>
          </label>
        ))}
      </div>
      {aide && <Aide id={idAide}>{aide}</Aide>}
    </fieldset>
  );
}

/** Une case à cocher, dessinée en interrupteur. */
export function Case({
  id,
  libelle,
  coche,
  onChange,
  aide,
}: {
  id: string;
  libelle: ReactNode;
  coche: boolean;
  onChange: (v: boolean) => void;
  aide?: ReactNode;
}) {
  const idAide = aide ? `${id}-aide` : undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-[14px] text-[var(--corps)]">
        <span>{libelle}</span>
        <input
          id={id}
          type="checkbox"
          checked={coche}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={idAide}
          className="outil-interrupteur"
        />
      </label>
      {aide && <Aide id={idAide}>{aide}</Aide>}
    </div>
  );
}

/** Un groupe de champs titré (fieldset + legend), séparé du précédent par un filet. */
export function Groupe({
  legende,
  description,
  children,
}: {
  legende: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="outil-groupe min-w-0">
      <legend className="outil-groupe-titre">{legende}</legend>
      {description && <p className="-mt-1 mb-3 text-[13px] leading-snug text-[var(--texte-secondaire)]">{description}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

/** La carte de saisie d'un outil : un titre, puis les groupes de champs. */
export function CarteSaisie({
  id,
  titre,
  children,
  className = "",
}: {
  id: string;
  titre: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`outil-saisie min-w-0 ${className}`} aria-labelledby={id}>
      <h2 id={id} className="outil-carte-titre">
        {titre}
      </h2>
      {children}
    </section>
  );
}

const ICONES_ALERTE = {
  erreur: <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  attention: <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  succes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" />
    </>
  ),
};

/** Un encadré d'état : erreur (rouge), attention (ambre), information ou succès. */
export function Alerte({
  gravite,
  children,
  titre,
}: {
  gravite: "attention" | "erreur" | "info" | "succes";
  children: ReactNode;
  titre?: string;
}) {
  return (
    <div className={`outil-alerte outil-alerte-${gravite}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 size-[18px] shrink-0 fill-none stroke-current" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {ICONES_ALERTE[gravite]}
      </svg>
      <div className="min-w-0">
        {titre && <p className="font-semibold">{titre}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
