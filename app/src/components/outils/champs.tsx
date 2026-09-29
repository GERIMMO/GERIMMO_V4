import type { ReactNode } from "react";

// LES CHAMPS DES OUTILS GRATUITS (29/09). Un libellé visible par champ,
// relié par htmlFor ; 44 px de haut ; 16 px de texte sous 640 px (sinon iOS
// zoome au focus — règle de globals.css). Les montants se saisissent en texte
// avec clavier décimal : « 146,68 » s'écrit à la française.

const CLASSE_CHAMP =
  "h-11 w-full min-w-0 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-3 text-[15px] text-[var(--corps)] placeholder:text-[var(--libelle)] focus-visible:border-[var(--marque)]";
const CLASSE_LIBELLE = "mb-1 block text-[13px] font-medium text-[var(--encre)]";

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
}) {
  const idAide = aide ? `${id}-aide` : undefined;
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
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={idAide}
          className={`${CLASSE_CHAMP} ${suffixe ? "pr-10" : ""} ${decimal ? "montant" : ""}`}
        />
        {suffixe && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[14px] text-[var(--libelle)]">
            {suffixe}
          </span>
        )}
      </div>
      {aide && (
        <p id={idAide} className="mt-1 text-[12.5px] text-[var(--texte-secondaire)]">
          {aide}
        </p>
      )}
    </div>
  );
}

export function Choix<T extends string>({
  id,
  libelle,
  valeur,
  onChange,
  options,
}: {
  id: string;
  libelle: ReactNode;
  valeur: T;
  onChange: (v: T) => void;
  options: { valeur: T; libelle: string }[];
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={CLASSE_LIBELLE}>
        {libelle}
      </label>
      <select id={id} value={valeur} onChange={(e) => onChange(e.target.value as T)} className={CLASSE_CHAMP}>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Case({
  id,
  libelle,
  coche,
  onChange,
}: {
  id: string;
  libelle: ReactNode;
  coche: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-[var(--corps)]">
      <input
        id={id}
        type="checkbox"
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--marque)]"
      />
      <span>{libelle}</span>
    </label>
  );
}

/** Un groupe de champs titré (fieldset + legend). */
export function Groupe({ legende, children }: { legende: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="eyebrow mb-2 text-[var(--marque-sombre)]">{legende}</legend>
      {children}
    </fieldset>
  );
}

/** Un chiffre clé du résultat. */
export function Chiffre({
  libelle,
  valeur,
  testId,
  accent = false,
}: {
  libelle: string;
  valeur: string;
  testId?: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{libelle}</p>
      <p
        data-testid={testId}
        className={`montant mt-1 font-heading text-[24px] font-bold leading-tight tracking-[-0.01em] ${
          accent ? "text-[var(--marque-sombre)]" : "text-[var(--encre)]"
        }`}
      >
        {valeur}
      </p>
    </div>
  );
}

/** Une alerte : attention (orange) ou erreur (rouge), lue par les lecteurs d'écran. */
export function Alerte({ gravite, children }: { gravite: "attention" | "erreur" | "info"; children: ReactNode }) {
  const ton =
    gravite === "erreur"
      ? "border-[var(--destructive)] bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]"
      : gravite === "attention"
        ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
        : "border-[var(--filet)] bg-[var(--survol)] text-[var(--encre)]";
  return <div className={`rounded-lg border-l-4 px-3 py-2.5 text-[14px] leading-relaxed ${ton}`}>{children}</div>;
}

export const CLASSE_CARTE = "loc-carte min-w-0";
