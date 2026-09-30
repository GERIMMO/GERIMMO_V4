import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { formaterEuros } from "@/lib/outils/nombres";
import { PLAFOND_MICRO_BIC } from "@/lib/outils/lmnp";
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
      chemin="/outils/simulateur-lmnp"
      titre="Simulateur LMNP"
      promesse={
        <>
          Loueur en meublé non professionnel, location de longue durée : micro-BIC ou régime réel ? L&apos;impôt de
          l&apos;année, côte à côte, amortissements compris.
        </>
      }
      calcul={
        <>
          <p className="outil-formule">Impôt = base imposable × (tranche marginale + 17,2 % de prélèvements sociaux)</p>
          <p>
            Micro-BIC : base = recettes − abattement forfaitaire de 50 % (305 € au minimum). Ouvert jusqu&apos;à{" "}
            {formaterEuros(PLAFOND_MICRO_BIC)} de recettes.
          </p>
          <p>
            Régime réel : base = recettes − charges déductibles − amortissements (bâti hors terrain, mobilier, travaux,
            chacun sur sa durée). L&apos;amortissement déduit ne peut pas dépasser le résultat positif ; l&apos;excédent se
            reporte.
          </p>
        </>
      }
      bonASavoir={
        <ul>
          <li>
            Location meublée de longue durée uniquement. Les meublés de tourisme relèvent d&apos;autres plafonds et
            abattements : ils sont hors du périmètre de ce simulateur.
          </li>
          <li>
            Hors périmètre également : le statut de loueur professionnel (LMP), la plus-value à la revente, et les
            autres revenus du foyer. Le résultat est une estimation, pas un conseil fiscal.
          </li>
          <li>
            Un résultat négatif avant amortissement est un déficit, imputable sur les bénéfices de même nature des 10
            années suivantes.
          </li>
        </ul>
      }
    >
      <SimulateurLmnp />
    </CoquilleOutil>
  );
}
