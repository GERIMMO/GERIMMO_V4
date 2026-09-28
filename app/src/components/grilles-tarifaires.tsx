// Les grilles tarifaires publiques (28/09/2026), rendues depuis lib/tarifs.ts :
// le site ne recopie aucun prix — il affiche le module qui sert aussi à
// facturer.

import {
  FORMULES_PARTICULIER,
  SUPPLEMENT_BIEN_CENTS,
  TRANCHES_AGENCE,
  euros,
  offreAgence,
  offreParticulier,
} from "@/lib/tarifs";

export function TableauParticuliers() {
  return (
    <div>
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Formules pour les particuliers et SCI gérant leurs propres biens, prix TTC</caption>
        <thead>
          <tr className="border-b border-[var(--filet)] text-[var(--texte-secondaire)]">
            <th scope="col" className="py-2 pr-3 font-medium">Formule</th>
            <th scope="col" className="py-2 pr-3 font-medium">Biens</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Par mois TTC</th>
            <th scope="col" className="py-2 text-right font-medium">Par an TTC</th>
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
      <p className="mt-2 text-[13px] text-[var(--texte-secondaire)]">
        Exemple : 25 biens = {euros(offreParticulier(25, "mensuel").montantCents)} TTC par mois, ou{" "}
        {euros(offreParticulier(25, "annuel").montantCents)} TTC par an prélevés en une fois. L&apos;annuel équivaut à
        deux mois offerts.
      </p>
    </div>
  );
}

export function TableauAgences() {
  const exemples = [10, 20, 50, 100, 200, 300, 500];
  return (
    <div>
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Tarif mensuel des agences par tranche de lots sous mandat actif, prix HT</caption>
        <thead>
          <tr className="border-b border-[var(--filet)] text-[var(--texte-secondaire)]">
            <th scope="col" className="py-2 pr-3 font-medium">Lots sous mandat actif</th>
            <th scope="col" className="py-2 text-right font-medium">Tarif mensuel HT</th>
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
        (HT par mois).
      </p>
    </div>
  );
}
