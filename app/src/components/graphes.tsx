// Graphiques de la maquette (charte v2) en SVG pur, rendus côté serveur —
// donut de répartition et barres doubles. Pas de bibliothèque : la maquette
// les dessine de la même façon, et il n'y a rien d'interactif.

export type SegmentDonut = {
  libelle: string;
  valeur: number;
  couleur: string; // var(--…) ou couleur CSS
};

// Donut (maquette `donut()`) : anneau segmenté + valeur au centre.
export function Donut({
  segments,
  centre,
  sous,
  taille = 132,
}: {
  segments: SegmentDonut[];
  centre: string;
  sous: string;
  taille?: number;
}) {
  const total = segments.reduce((s, x) => s + x.valeur, 0);
  const rayon = 15.915; // circonférence = 100 → les pourcentages en dasharray
  // Chaque arc démarre où le précédent finit (départ à midi = offset 25)
  const arcs = segments
    .filter((s) => s.valeur > 0)
    .reduce<{ liste: (SegmentDonut & { part: number; decale: number })[]; decale: number }>(
      (acc, s) => {
        const part = total > 0 ? (s.valeur / total) * 100 : 0;
        return {
          liste: [...acc.liste, { ...s, part, decale: acc.decale }],
          decale: acc.decale - part,
        };
      },
      { liste: [], decale: 25 }
    ).liste;

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 42 42"
      role="img"
      aria-label={`${centre} ${sous} — ${segments
        .map((s) => `${s.libelle} : ${s.valeur}`)
        .join(", ")}`}
      className="shrink-0"
    >
      <circle cx="21" cy="21" r={rayon} fill="none" stroke="var(--or-clair)" strokeWidth="4.6" />
      {arcs.map((a) => (
        <circle
          key={a.libelle}
          cx="21"
          cy="21"
          r={rayon}
          fill="none"
          stroke={a.couleur}
          strokeWidth="4.6"
          strokeDasharray={`${a.part} ${100 - a.part}`}
          strokeDashoffset={a.decale}
        />
      ))}
      <text
        x="21"
        y="21"
        textAnchor="middle"
        style={{ font: "500 8.5px var(--font-titres), Georgia, serif", fill: "var(--encre)" }}
      >
        {centre}
      </text>
      <text
        x="21"
        y="27"
        textAnchor="middle"
        style={{
          font: "3px var(--font-libelles), ui-monospace, monospace",
          letterSpacing: "0.1em",
          fill: "var(--libelle)",
        }}
      >
        {sous}
      </text>
    </svg>
  );
}

// Légende du donut (maquette `legende()`)
export function LegendeDonut({ segments }: { segments: SegmentDonut[] }) {
  return (
    <div className="min-w-32 flex-1 space-y-1.5">
      {segments
        .filter((s) => s.valeur > 0)
        .map((s) => (
          <div key={s.libelle} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0"
              style={{ background: s.couleur }}
            />
            <span className="min-w-0 flex-1 truncate">{s.libelle}</span>
            <span className="mono-discret">{s.valeur}</span>
          </div>
        ))}
    </div>
  );
}

// Barres doubles par période (maquette `barresDouble()`) : deux séries côte à
// côte, hauteur relative au maximum.
export function BarresDouble({
  donnees,
  couleurA = "var(--success)",
  couleurB = "var(--warning)",
  hauteur = 96,
}: {
  donnees: { libelle: string; a: number; b: number }[];
  couleurA?: string;
  couleurB?: string;
  hauteur?: number;
}) {
  const max = Math.max(1, ...donnees.flatMap((d) => [d.a, d.b]));
  const eur = (n: number) =>
    `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return (
    // Marge haute réservée à l'infobulle : elle ne dépasse jamais de la carte
    <div className="flex items-end gap-3 pt-16" style={{ height: hauteur + 18 + 64 }}>
      {donnees.map((d) => (
        // Retour recette 30/08 : le montant apparaît en infobulle au survol de
        // chaque barre (et de la colonne entière — les petites barres sont
        // difficiles à viser). Les deux séries sont dites d'un coup.
        <div
          key={d.libelle}
          // Les deux dernières colonnes ancrent l'infobulle à droite, sinon elle
          // sortirait de la carte.
          className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 [&:nth-last-child(-n+2)>[role=tooltip]]:left-auto [&:nth-last-child(-n+2)>[role=tooltip]]:right-0 [&:nth-last-child(-n+2)>[role=tooltip]]:translate-x-0 [&:nth-last-child(-n+2)>[role=tooltip]]:after:left-auto [&:nth-last-child(-n+2)>[role=tooltip]]:after:right-3"
          tabIndex={0}
          aria-label={`${d.libelle} — encaissé ${eur(d.a)}, dépenses ${eur(d.b)}`}
        >
          <span
            role="tooltip"
            className="infobulle pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap group-hover:block group-focus-visible:block"
          >
            <b className="block">{d.libelle}</b>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2" style={{ background: couleurA }} />
              Encaissé {eur(d.a)}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2" style={{ background: couleurB }} />
              Dépenses {eur(d.b)}
            </span>
          </span>
          <div className="flex w-full items-end justify-center gap-[3px]" style={{ height: hauteur }}>
            <span
              className="w-2/5 max-w-4 transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(2, Math.round((d.a / max) * 100))}%`, background: couleurA }}
            />
            <span
              className="w-2/5 max-w-4 transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(2, Math.round((d.b / max) * 100))}%`, background: couleurB }}
            />
          </div>
          <span className="mono-discret truncate">{d.libelle}</span>
        </div>
      ))}
    </div>
  );
}
