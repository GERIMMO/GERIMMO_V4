import Link from "next/link";
import { TuileOutil, outilsPresentes } from "./icones-outils";

// L'encart « Outils gratuits » (30/09), posé sous les pages publiques qui
// s'y prêtent (tarifs, articles du journal) : quelques outils, une ligne
// chacun, et le lien vers la liste complète.

export function EncartOutils({
  titre = "Outils gratuits",
  chapo,
  chemins,
}: {
  titre?: string;
  chapo?: string;
  /** Les outils à montrer, dans l'ordre du catalogue ; tous par défaut. */
  chemins?: string[];
}) {
  const outils = outilsPresentes().filter((o) => !chemins || chemins.includes(o.chemin));
  return (
    <aside aria-labelledby="encart-outils" className="rounded-2xl border border-[var(--or-filet)] bg-[var(--ivoire)] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow !text-[var(--marque-sombre)]">Sans compte · gratuit</p>
          <p id="encart-outils" className="mt-1 font-heading text-[18px] font-bold text-[var(--encre)]">
            {titre}
          </p>
        </div>
        <Link href="/outils" className="lien-discret text-[13.5px]">
          Tous les outils →
        </Link>
      </div>
      {chapo && <p className="mt-2 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">{chapo}</p>}
      <ul className={`mt-4 grid gap-2.5 ${outils.length > 3 ? "sm:grid-cols-2" : ""}`}>
        {outils.map((o) => (
          <li key={o.chemin} className="min-w-0">
            <Link href={o.chemin} className="outil-lien-carte group !items-center !py-3">
              <TuileOutil chemin={o.chemin} taille="sm" />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
                  {o.court}
                </span>
                <span className="block text-[12.5px] leading-snug text-[var(--texte-secondaire)]">{o.accroche}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
