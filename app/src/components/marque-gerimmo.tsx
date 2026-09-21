// Marque GERIMMO — toit protecteur, G et clé réunis dans un seul symbole.
// Le mot-marque, charte v3 : Manrope 800, interlettrage 0,2em.
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
        viewBox="0 0 128 128"
        width="34"
        height="34"
        aria-hidden
        className="shrink-0"
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M12 50 64 12l52 38M102 39V24h11v24"
            stroke={surEncre ? "var(--sur-encre)" : "var(--encre)"}
            strokeWidth="8"
          />
          <path
            d="M96 61a39 39 0 1 0 2 31V77H73"
            stroke={surEncre ? "var(--sur-encre)" : "var(--encre)"}
            strokeWidth="9"
          />
          <circle cx="62" cy="59" r="11" stroke="var(--or)" strokeWidth="7" />
          <path d="M62 70v38m0-20h13m-13 11h9" stroke="var(--or)" strokeWidth="8" />
        </g>
      </svg>
      <span
        className={`font-[family-name:var(--font-titres)] text-[1.05rem] tracking-[0.2em] ${
          surEncre ? "text-[var(--sur-encre)]" : "text-[var(--encre)]"
        }`}
        style={{ fontWeight: 800 }}
      >
        GERIMMO
      </span>
    </span>
  );
}
