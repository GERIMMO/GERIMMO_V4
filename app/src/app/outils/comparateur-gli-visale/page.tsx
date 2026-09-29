import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { DATE_VERIFICATION_VISALE } from "@/lib/outils/gli-visale";
import { ComparateurGliVisale } from "./comparateur";

export const metadata = metadonneesPubliques({
  titre: "Comparateur GLI / Visale — Outil gratuit Gerimmo",
  description:
    "Votre locataire est-il éligible à la garantie Visale (plafonds 2026 par zone, conditions d'âge et de situation) ? Combien coûte une assurance loyers impayés, avant et après impôt ? Gratuit, sans compte.",
  chemin: "/outils/comparateur-gli-visale",
});

export default function PageComparateurGliVisale() {
  return (
    <CoquilleOutil
      titre="Comparateur GLI / Visale"
      chapo={
        <>
          Visale, la garantie gratuite d&apos;Action Logement, ou une assurance loyers impayés payée par le bailleur ?
          Vérifiez l&apos;éligibilité de votre locataire à Visale et chiffrez le coût réel d&apos;une GLI.
        </>
      }
      apres={
        <>
          <p className="rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] px-3 py-2.5 text-[var(--encre)]">
            Règles Visale vérifiées le {DATE_VERIFICATION_VISALE} auprès d&apos;Action Logement. Les plafonds changent
            chaque année : ils sont à revérifier chaque mois de janvier, sur{" "}
            <a href="https://www.visale.fr" target="_blank" rel="noopener noreferrer" className="lien-texte">
              visale.fr
            </a>
            .
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Visale ne se cumule ni avec une assurance loyers impayés, ni avec une caution personne physique : il faut
              choisir.
            </li>
            <li>
              Les garanties, franchises et conditions de revenus d&apos;une GLI varient d&apos;un assureur à l&apos;autre :
              le taux saisi ici n&apos;est qu&apos;un point de départ, comparez les contrats.
            </li>
            <li>Ce comparateur est une aide à la décision : il ne remplace pas l&apos;étude du dossier par Visale ou par l&apos;assureur.</li>
          </ul>
        </>
      }
    >
      <ComparateurGliVisale />
    </CoquilleOutil>
  );
}
