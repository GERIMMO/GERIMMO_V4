// Les grilles tarifaires publiques (28/09/2026), rendues depuis lib/tarifs.ts :
// le site ne recopie aucun prix — il affiche le module qui sert aussi à
// facturer.

import {
  FORMULES_PARTICULIER,
  SUPPLEMENT_BIEN_CENTS,
  TRANCHES_AGENCE,
  etiquetteTaxes,
  euros,
  offreAgence,
  offreParticulier,
} from "@/lib/tarifs";
import { REGIME_TVA } from "@/lib/editeur";

// 29/09 : l'étiquette « TTC » / « HT » suit le régime de TVA de l'éditeur. En
// franchise en base, aucune TVA n'est facturée : « HT » laissait croire le
// contraire. La mention de franchise est affichée par la page, sous la grille.
const avec = (etiquette: string | null) => (etiquette ? ` ${etiquette}` : "");

export function TableauParticuliers() {
  const t = avec(etiquetteTaxes("ttc", REGIME_TVA));
  return (
    <div>
      <div className="grille-tarifaire-defilante" role="region" aria-label="Tableau des tarifs" tabIndex={0}>
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Formules pour les particuliers et SCI gérant leurs propres biens{t ? `, prix${t}` : ""}</caption>
        <thead>
          <tr className="border-b border-[var(--filet)] text-[var(--texte-secondaire)]">
            <th scope="col" className="py-2 pr-3 font-medium">Formule</th>
            <th scope="col" className="py-2 pr-3 font-medium">Biens</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Par mois{t}</th>
            <th scope="col" className="py-2 text-right font-medium">Par an{t}</th>
          </tr>
        </thead>
        <tbody>
          {FORMULES_PARTICULIER.map((f) => (
            <tr key={f.code} className="border-b border-[var(--filet)]">
              <th scope="row" className="py-2 pr-3 font-semibold text-[var(--encre)]">{f.nom}</th>
              <td className="py-2 pr-3">{f.biens === 1 ? "1 bien" : `Jusqu'à ${f.biens}`}</td>
              <td className="montant py-2 pr-3 text-right whitespace-nowrap">{euros(f.mensuelCents)}</td>
              <td className="montant py-2 text-right whitespace-nowrap">{euros(f.annuelCents)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 font-semibold text-[var(--encre)]">Au-delà de 20</th>
            <td className="py-2 pr-3">Patrimoine + par bien</td>
            <td className="montant py-2 pr-3 text-right whitespace-nowrap">+{euros(SUPPLEMENT_BIEN_CENTS.mensuel)}</td>
            <td className="montant py-2 text-right whitespace-nowrap">+{euros(SUPPLEMENT_BIEN_CENTS.annuel)}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-[13px] text-[var(--texte-secondaire)]">
        Exemple : 25 biens = {euros(offreParticulier(25, "mensuel").montantCents)}{t} par mois, ou{" "}
        {euros(offreParticulier(25, "annuel").montantCents)}{t} par an prélevés en une fois. L&apos;annuel équivaut à
        deux mois offerts.
      </p>
    </div>
  );
}

export function TableauAgences() {
  const t = avec(etiquetteTaxes("ht", REGIME_TVA));
  const exemples = [10, 20, 50, 100, 200, 300, 500];
  return (
    <div>
      <div className="grille-tarifaire-defilante" role="region" aria-label="Tableau des tarifs" tabIndex={0}>
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Tarif mensuel des agences par tranche de lots sous mandat actif{t ? `, prix${t}` : ""}</caption>
        <thead>
          <tr className="border-b border-[var(--filet)] text-[var(--texte-secondaire)]">
            <th scope="col" className="py-2 pr-3 font-medium">Lots sous mandat actif</th>
            <th scope="col" className="py-2 text-right font-medium">Tarif mensuel{t}</th>
          </tr>
        </thead>
        <tbody>
          {TRANCHES_AGENCE.map((t) => (
            <tr key={t.du} className="border-b border-[var(--filet)]">
              <th scope="row" className="py-2 pr-3 font-normal">
                {t.forfaitCents > 0
                  ? `Socle, jusqu'à ${t.au} lots inclus`
                  : t.au === null
                    ? `À partir du ${t.du}ᵉ lot`
                    : `Du ${t.du}ᵉ au ${t.au}ᵉ lot`}
              </th>
              <td className="montant py-2 text-right whitespace-nowrap">
                {t.forfaitCents > 0 ? euros(t.forfaitCents) : `+ ${euros(t.prixLotCents)} par lot`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-[13px] text-[var(--texte-secondaire)]">
        Tranches cumulatives : chaque lot est facturé au prix de sa tranche.{" "}
        {exemples.map((n, i) => (
          <span key={n}>
            <span className="whitespace-nowrap">
              {n} lots = {euros(offreAgence(n).montantCents)}
            </span>
            {i < exemples.length - 1 ? " · " : " "}
          </span>
        ))}
        ({t ? `${t.trim()} ` : ""}par mois).
      </p>
    </div>
  );
}
