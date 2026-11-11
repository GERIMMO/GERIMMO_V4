// Les grilles tarifaires publiques (28/09/2026), rendues depuis lib/tarifs.ts :
// le site ne recopie aucun prix — il affiche le module qui sert aussi à
// facturer.

import {
  montantAbonnementUnique,
  TRANCHES_AGENCE,
  etiquetteTaxes,
  euros,
  offreAgence,
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
        <caption className="sr-only">Abonnement des propriétaires et SCI{t}</caption>
        <thead><tr><th scope="col">Biens actifs</th><th scope="col">Par mois</th><th scope="col">Par an</th></tr></thead>
        <tbody>
          {[1, 2, 7, 8, 20, 21, 30].map(n => <tr key={n}><th scope="row">{n}</th>
            <td>{euros(montantAbonnementUnique(n, "mensuel"))}</td><td>{euros(montantAbonnementUnique(n, "annuel"))}</td></tr>)}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-[13px] text-[var(--texte-secondaire)]">
        Exemple : 25 biens = {euros(montantAbonnementUnique(25, "mensuel"))}{t} par mois, ou{" "}
        {euros(montantAbonnementUnique(25, "annuel"))}{t} par an prélevés en une fois. L&apos;annuel équivaut à
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
