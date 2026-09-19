// LA FAMILLE D'ICÔNES v4 — un seul trait, 1,6 px, arrondi.
//
// Trois stratégies d'icônes cohabitaient (SVG écrits à la main dans 18
// fichiers, lucide dans 4, base-ui dans 2). Celle-ci est la famille de la
// coquille v4 : la barre latérale, les tuiles du tableau de bord et les
// écrans refaits y puisent. Rendue côté serveur comme côté client.

export const TRAITS: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  parc: '<path d="M3 21V9l6-4 6 4v12"/><path d="M15 21V11l6-3v13M7 13h2M7 17h2"/>',
  cle: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20.5 12v2"/>',
  gens: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3.5 3.5 0 0 1 0 7M15.5 13.5A6 6 0 0 1 21 20"/>',
  euro: '<path d="M17 5.5A7 7 0 0 0 6.5 12 7 7 0 0 0 17 18.5M4 10h9M4 14h9"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  livre: '<path d="M4 4h9a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M17 8h3v12h-9"/>',
  cloche: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  bulle: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  roue: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  mallette: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2M3 13h18"/>',
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  cles: '<path d="M12 15a4 4 0 1 0-4-4"/><path d="M4 20l6-6M7 17l2 2"/><circle cx="16" cy="8" r="3"/>',
  quest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 17h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eclair: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};

export function IconeTrait({ nom, className }: { nom: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: TRAITS[nom] ?? "" }}
    />
  );
}
