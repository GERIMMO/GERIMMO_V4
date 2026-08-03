// Marque GERIMMO — charte 01.
//
// ⚠ REPÈRE PROVISOIRE. La charte impose : « Il ne doit jamais être redessiné :
// utilisez les fichiers fournis » et situe les logos dans un dossier `logo/`,
// qui n'a pas été transmis. Le tracé ci-dessous respecte la description (un
// toit et une clé en un seul tracé au filet fin) mais n'est PAS le symbole
// officiel. Déposez les SVG dans `public/logo/` et remplacez ce composant.
//
// Le mot-marque suit la charte : Cormorant Garamond, interlettrage 0,24em.

export function MarqueGerimmo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-7 shrink-0 text-[var(--or-texte)]"
        aria-hidden
      >
        {/* Toit */}
        <path d="M5 15 16 6l11 9" />
        <path d="M8 14.5V25h16V14.5" />
        {/* Clé : anneau et tige, dans le prolongement du toit */}
        <circle cx="16" cy="16.5" r="2.6" />
        <path d="M16 19.1V24" />
        <path d="M16 21.6h2.2" />
      </svg>
      <span
        className="font-[family-name:var(--font-titres)] text-[1.05rem] tracking-[0.24em] text-[var(--encre)]"
        style={{ fontWeight: 400 }}
      >
        GERIMMO
      </span>
    </span>
  );
}
