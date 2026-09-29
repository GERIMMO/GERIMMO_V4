import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { SimulateurLmnp } from "./simulateur";

export const metadata = metadonneesPubliques({
  titre: "Simulateur LMNP : micro-BIC ou régime réel — Outil gratuit Gerimmo",
  description:
    "Location meublée de longue durée : comparez l'impôt au micro-BIC (abattement de 50 %) et au régime réel (charges et amortissements), avec l'amortissement reporté. Gratuit, sans compte.",
  chemin: "/outils/simulateur-lmnp",
});

export default function PageSimulateurLmnp() {
  return (
    <CoquilleOutil
      titre="Simulateur LMNP"
      chapo={
        <>
          Loueur en meublé non professionnel, location de longue durée : comparez l&apos;impôt de l&apos;année au
          micro-BIC et au régime réel, amortissements compris.
        </>
      }
      apres={
        <>
          <h2 className="text-[length:var(--pas-sous-titre)] font-semibold text-[var(--encre)]">Périmètre</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Location meublée de longue durée uniquement. Les meublés de tourisme relèvent d&apos;autres plafonds et
              abattements : ils sont hors du périmètre de ce simulateur.
            </li>
            <li>
              Hors périmètre également : le statut de loueur professionnel (LMP), la plus-value à la revente, et les
              autres revenus du foyer. Le résultat est une estimation, pas un conseil fiscal.
            </li>
            <li>
              Au régime réel, l&apos;amortissement déduit ne peut pas dépasser le résultat positif ; l&apos;excédent se
              reporte. Un résultat négatif avant amortissement est un déficit, imputable sur les bénéfices de même nature
              des 10 années suivantes.
            </li>
          </ul>
        </>
      }
    >
      <SimulateurLmnp />
    </CoquilleOutil>
  );
}
