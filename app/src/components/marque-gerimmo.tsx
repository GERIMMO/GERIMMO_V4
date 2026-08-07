// Marque GERIMMO — charte v2 (maquette août 2026).
//
// ⚠ REPÈRE PROVISOIRE. La charte impose : « Il ne doit jamais être redessiné :
// utilisez les fichiers fournis » et situe les logos dans un dossier `logo/`,
// qui n'a pas été transmis. Le tracé ci-dessous reprend celui de la maquette
// (raw/maquettes/2026-08-08-gerimmo-prototype.html : toit et clé au filet
// laiton) mais n'est PAS le symbole officiel. Déposez les SVG dans
// `public/logo/` et remplacez ce composant.
//
// Le mot-marque suit la maquette : Cormorant Garamond, interlettrage 0,26em.
// `surEncre` : variante posée sur le bandeau encre (mot-marque crème).

export function MarqueGerimmo({
  className = "",
  surEncre = false,
}: {
  className?: string;
  surEncre?: boolean;
}) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <svg
        viewBox="0 0 40 34"
        width="34"
        height="29"
        aria-hidden
        className="shrink-0"
      >
        <g
          fill="none"
          stroke="var(--or)"
          strokeWidth="1.05"
          strokeLinecap="round"
        >
          <path d="M4.5 20.5 Q12 6.4 20 5.7" />
          <path d="M35.5 20.5 Q28 6.4 20 5.7" />
          <path d="M5 28.4 Q20 31.5 35 28.4" />
          <circle cx="15.6" cy="18.6" r="3.6" />
          <path d="M19.2 18.6 h8.5" />
          <path d="M24.4 18.6 v2.6" />
          <path d="M27.7 18.6 v3.4" />
        </g>
        <path
          d="M14.2 16.1 h2.7"
          stroke={surEncre ? "var(--sur-encre)" : "var(--encre)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`font-[family-name:var(--font-titres)] text-[1.19rem] tracking-[0.26em] ${
          surEncre ? "text-[var(--sur-encre)]" : "text-[var(--encre)]"
        }`}
        style={{ fontWeight: 500 }}
      >
        GERIMMO
      </span>
    </span>
  );
}
