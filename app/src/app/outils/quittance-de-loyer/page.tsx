import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { GenerateurQuittance } from "./generateur-quittance";

export const metadata = metadonneesPubliques({
  titre: "Quittance de loyer gratuite à imprimer — Outil Gerimmo",
  description:
    "Établissez une quittance de loyer conforme à l'article 21 de la loi du 6 juillet 1989, ou un reçu de paiement partiel si le terme n'est pas soldé. Gratuit, sans compte, à imprimer ou enregistrer en PDF.",
  chemin: "/outils/quittance-de-loyer",
});

export default function PageQuittanceDeLoyer() {
  return (
    <CoquilleOutil
      titre="Quittance de loyer"
      chapo={
        <>
          Le loyer et les charges sont détaillés séparément, comme l&apos;exige l&apos;article 21 de la loi du 6 juillet
          1989. Si le montant reçu ne couvre pas le terme, le document devient un reçu de paiement partiel : il indique
          le reste dû et ne vaut pas quittance.
        </>
      }
      apres={
        <>
          <h2 className="text-[length:var(--pas-sous-titre)] font-semibold text-[var(--encre)]">Bon à savoir</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>La quittance est gratuite : le bailleur la remet au locataire qui en fait la demande.</li>
            <li>
              Elle ne porte que sur le terme désigné : le paiement de ce terme ne présume pas celui des termes
              antérieurs.
            </li>
            <li>
              Vos saisies restent dans votre navigateur. Elles ne sont retenues sur cet appareil que si vous cochez la
              case prévue.
            </li>
          </ul>
        </>
      }
    >
      <GenerateurQuittance />
    </CoquilleOutil>
  );
}
