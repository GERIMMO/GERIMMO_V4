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
      chemin="/outils/quittance-de-loyer"
      titre="Quittance de loyer"
      promesse="Une quittance en règle en une minute, à imprimer ou à enregistrer en PDF — ou un reçu de paiement partiel si le terme n'est pas soldé."
      calcul={
        <>
          <p className="outil-formule">Total du terme = loyer hors charges + provision pour charges</p>
          <p>
            Le loyer et les charges sont détaillés séparément, comme l&apos;exige l&apos;article 21 de la loi du 6 juillet
            1989. Si le montant reçu couvre le total, le document est une quittance.
          </p>
          <p>
            S&apos;il ne le couvre pas, le document devient un reçu de paiement partiel : il indique le montant encaissé
            et le reste dû (total − montant reçu), et ne vaut pas quittance.
          </p>
        </>
      }
      bonASavoir={
        <ul>
          <li>La quittance est gratuite : le bailleur la remet au locataire qui en fait la demande.</li>
          <li>
            Elle ne porte que sur le terme désigné : le paiement de ce terme ne présume pas celui des termes
            antérieurs.
          </li>
          <li>
            Vos saisies restent dans votre navigateur. Elles ne sont retenues sur cet appareil que si vous activez l&apos;option
            « Retenir… ».
          </li>
        </ul>
      }
    >
      <GenerateurQuittance />
    </CoquilleOutil>
  );
}
