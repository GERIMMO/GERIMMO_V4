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
      titre="Rentabilité locative"
      chapo={
        <>
          Rentabilité brute = loyer annuel hors charges ÷ prix total (prix, frais d&apos;acquisition et travaux). La
          rentabilité nette retire les charges non récupérables, la taxe foncière, l&apos;assurance, la gestion et la
          vacance. Avec un crédit, l&apos;outil donne aussi le cash-flow mensuel.
        </>
      }
      apres={
        <ul className="list-disc space-y-1 pl-5">
          <li>Les montants sont annuels, sauf le loyer et la mensualité.</li>
          <li>
            Le cash-flow est calculé avant impôt ; ajoutez l&apos;assurance emprunteur à la mensualité si vous la payez à
            part.
          </li>
        </ul>
      }
    >
      <CalculateurRentabilite />
    </CoquilleOutil>
  );
}
