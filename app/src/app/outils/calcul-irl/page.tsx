import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { URL_SERIE_INSEE_IRL } from "@/lib/outils/irl";
import { chargerSerieIrl } from "@/lib/outils/irl-insee";
import { CalculateurIrl } from "./calculateur-irl";

export const metadata = metadonneesPubliques({
  titre: "Calcul de la révision de loyer (IRL) — Outil gratuit Gerimmo",
  description:
    "Calculez le nouveau loyer selon l'indice de référence des loyers : loyer × nouvel IRL ÷ IRL de référence, alertes de trimestre et de délai, lettre de révision à imprimer. Gratuit, sans compte.",
  chemin: "/outils/calcul-irl",
});

// 30/09 : la série de l'IRL est lue chez l'Insee au rendu (serveur, cache
// d'une journée). La page est régénérée toutes les heures : un échec de
// l'Insee (page servie en saisie manuelle) ne dure pas plus d'une heure.
export const revalidate = 3600;

export default async function PageCalculIrl() {
  const serie = await chargerSerieIrl();
  return (
    <CoquilleOutil
      chemin="/outils/calcul-irl"
      titre="Calcul de la révision de loyer (IRL)"
      promesse={
        <>
          Votre loyer, la date du bail, et c&apos;est tout : l&apos;outil retrouve les indices officiels de l&apos;Insee,
          calcule le nouveau loyer, signale les pièges et prépare la lettre au locataire.
        </>
      }
      calcul={
        <>
          <p className="outil-formule">Nouveau loyer = loyer actuel × nouvel indice ÷ indice de référence</p>
          <p>
            Le résultat est arrondi au centime (article 17-1 de la loi du 6 juillet 1989). L&apos;indice de référence est
            celui du trimestre fixé au bail, pour l&apos;année de la signature ou de la dernière révision ; le nouvel
            indice est celui du même trimestre, pour la dernière année publiée.
          </p>
          <p>
            Les indices viennent de la série officielle de l&apos;IRL (France métropolitaine) publiée par l&apos;Insee et
            reprise au Journal officiel :{" "}
            <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
              série 001515333
            </a>
            . Si elle ne peut pas être lue, ou pour un logement en Corse ou outre-mer (indices spécifiques), les deux
            indices se saisissent à la main.
          </p>
        </>
      }
      bonASavoir={
        <ul>
          <li>
            La révision n&apos;est pas automatique : le bailleur dispose d&apos;un an à compter de la date anniversaire
            pour la demander. Demandée en retard, elle prend effet à la date de la demande, sans rétroactivité.
          </li>
          <li>
            Logement classé F ou G au diagnostic de performance énergétique : depuis le 24 août 2022, son loyer ne peut
            plus être révisé ni augmenté (gel des loyers des passoires thermiques, loi Climat et résilience).
          </li>
          <li>
            Corse et outre-mer ont leur propre indice, publié par l&apos;Insee : l&apos;indice de la France
            métropolitaine ne s&apos;y applique pas.
          </li>
          <li>
            Aucune valeur d&apos;indice n&apos;est écrite dans cet outil : elles sont lues chez l&apos;Insee.
            Vérifiez-les sur{" "}
            <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
              le site de l&apos;Insee
            </a>{" "}
            avant d&apos;envoyer la lettre. Zone d&apos;encadrement des loyers : vérifiez aussi les règles locales.
          </li>
        </ul>
      }
    >
      <CalculateurIrl serie={serie} />
    </CoquilleOutil>
  );
}
