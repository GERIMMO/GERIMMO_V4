import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { CalculateurRentabilite } from "./calculateur-rentabilite";

export const metadata = metadonneesPubliques({
  titre: "Calcul de rentabilité locative — Outil gratuit Gerimmo",
  description:
    "Rentabilité brute et nette de charges d'un investissement locatif (taxe foncière, assurance, gestion, vacance), et cash-flow mensuel avec votre crédit. Gratuit, sans compte.",
  chemin: "/outils/rentabilite-locative",
});

export default function PageRentabiliteLocative() {
  return (
    <CoquilleOutil
      chemin="/outils/rentabilite-locative"
      titre="Rentabilité locative"
      promesse="Ce que rapporte vraiment un investissement locatif : rentabilité brute, rentabilité nette de charges et, si vous empruntez, le cash-flow de chaque mois."
      calcul={
        <>
          <p className="outil-formule">Rentabilité brute = loyer annuel hors charges ÷ prix total</p>
          <p className="outil-formule">Rentabilité nette = (loyer annuel − charges − vacance) ÷ prix total</p>
          <p>
            Le prix total additionne le prix d&apos;achat, les frais d&apos;acquisition et les travaux. La rentabilité nette
            retire les charges non récupérables, la taxe foncière, l&apos;assurance, la gestion et la vacance (en mois de
            loyer).
          </p>
          <p>
            Cash-flow mensuel = revenu net annuel ÷ 12 − mensualité. La mensualité se calcule par la formule
            d&apos;annuité (hors assurance emprunteur), ou se saisit directement.
          </p>
        </>
      }
      bonASavoir={
        <ul>
          <li>Les montants sont annuels, sauf le loyer et la mensualité.</li>
          <li>
            Le cash-flow est calculé avant impôt ; ajoutez l&apos;assurance emprunteur à la mensualité si vous la payez à
            part.
          </li>
          <li>La fiscalité dépend du régime (location nue ou meublée, micro ou réel) : elle n&apos;est pas comptée ici.</li>
        </ul>
      }
    >
      <CalculateurRentabilite />
    </CoquilleOutil>
  );
}
