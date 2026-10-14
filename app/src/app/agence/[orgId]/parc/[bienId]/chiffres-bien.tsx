import { IconeTrait } from "@/components/icone-trait";

export type ChiffreBien = { icone: string; label: string; valeur: string };

/**
 * Les chiffres clés de l'en-tête d'un bien (lots, surface, diagnostics).
 *
 * Une liste de définitions BIEN FORMÉE (audit du 13/10, DES-A-04) : chaque groupe est un
 * `<div>` qui ne contient que `<dt>` puis `<dd>` — l'icône vit dans le `<dt>` (décorative,
 * `aria-hidden`), ce qui laisse le lecteur d'écran annoncer « terme, définition ». Elle
 * était dans le `<div>` de groupe, à côté d'un second `<div>` enveloppant : `dl > div > div`
 * n'est pas permis et la liste n'était plus une liste pour les technologies d'assistance.
 * La mise en page (icône à gauche, libellé puis valeur) est dans `.bien-visuel-chiffres`.
 */
export function ChiffresBien({ chiffres }: { chiffres: ChiffreBien[] }) {
  return (
    <dl className="bien-visuel-chiffres">
      {chiffres.map((c) => (
        <div key={c.label}>
          <dt>
            <IconeTrait nom={c.icone} />
            {c.label}
          </dt>
          <dd>{c.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}
