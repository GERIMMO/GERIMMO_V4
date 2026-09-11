import { Fragment, type ReactNode } from "react";

/**
 * Rendu d'un sous-ensemble de markdown vers des ÉLÉMENTS REACT.
 *
 * Pourquoi pas une bibliothèque : le corps d'un article est écrit par le Super
 * Admin, mais il est servi à des visiteurs anonymes. Un rendu qui produit du
 * HTML puis l'injecte (dangerouslySetInnerHTML) ouvre une porte qu'on n'a
 * aucune raison d'ouvrir. Ici rien n'est injecté : chaque fragment devient un
 * nœud React, donc échappé par construction. Ce qui n'est pas reconnu s'affiche
 * tel quel, en texte.
 *
 * Reconnu : ## et ###, paragraphes, listes à puces et numérotées, **gras**,
 * `code`, et les liens [texte](adresse) — en n'acceptant que http(s) et les
 * chemins internes, jamais un javascript:.
 */

function enLigne(texte: string, cle: string): ReactNode {
  // Découpe sur les trois marques en ligne, en conservant les séparateurs.
  const morceaux = texte.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return morceaux.map((m, i) => {
    const k = `${cle}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(m)) {
      return (
        <strong key={k} className="font-semibold text-[var(--encre)]">
          {m.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(m)) {
      return (
        <code key={k} className="bg-[var(--filet-leger)] px-1 py-0.5 text-[0.9em]">
          {m.slice(1, -1)}
        </code>
      );
    }
    const lien = m.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (lien) {
      const adresse = lien[2].trim();
      const sure = /^https?:\/\//i.test(adresse) || adresse.startsWith("/");
      if (!sure) return <Fragment key={k}>{lien[1]}</Fragment>;
      const externe = adresse.startsWith("http");
      return (
        <a
          key={k}
          href={adresse}
          className="lien-discret"
          {...(externe ? { rel: "noopener noreferrer", target: "_blank" } : {})}
        >
          {lien[1]}
        </a>
      );
    }
    return <Fragment key={k}>{m}</Fragment>;
  });
}

export function TexteMarkdown({ contenu }: { contenu: string }) {
  const blocs = contenu.replace(/\r\n/g, "\n").split(/\n{2,}/);

  return (
    <div className="space-y-4">
      {blocs.map((bloc, i) => {
        const brut = bloc.trim();
        if (!brut) return null;
        const cle = `b${i}`;

        if (brut.startsWith("### ")) {
          return (
            <h3
              key={cle}
              className="font-heading text-[var(--pas-sous-titre)] text-[var(--encre)]"
            >
              {enLigne(brut.slice(4), cle)}
            </h3>
          );
        }
        if (brut.startsWith("## ")) {
          return (
            <h2
              key={cle}
              className="mt-8 font-heading text-[var(--pas-section)] text-[var(--encre)]"
            >
              {enLigne(brut.slice(3), cle)}
            </h2>
          );
        }

        const lignes = brut.split("\n");
        if (lignes.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={cle} className="list-disc space-y-1.5 pl-5">
              {lignes.map((l, j) => (
                <li key={`${cle}-${j}`} className="leading-relaxed">
                  {enLigne(l.replace(/^\s*[-*]\s+/, ""), `${cle}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (lignes.every((l) => /^\s*\d+\.\s+/.test(l))) {
          return (
            <ol key={cle} className="list-decimal space-y-1.5 pl-5">
              {lignes.map((l, j) => (
                <li key={`${cle}-${j}`} className="leading-relaxed">
                  {enLigne(l.replace(/^\s*\d+\.\s+/, ""), `${cle}-${j}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={cle} className="leading-relaxed text-[var(--corps)]">
            {enLigne(brut.replace(/\n/g, " "), cle)}
          </p>
        );
      })}
    </div>
  );
}
