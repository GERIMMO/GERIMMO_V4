import { CoquilleOutil } from "@/components/outils/coquille-outil";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { URL_SERIE_INSEE_IRL } from "@/lib/outils/irl";
import { CalculateurIrl } from "./calculateur-irl";

export const metadata = metadonneesPubliques({
  titre: "Calcul de la révision de loyer (IRL) — Outil gratuit Gerimmo",
  description:
    "Calculez le nouveau loyer selon l'indice de référence des loyers : loyer × nouvel IRL ÷ IRL de référence, alertes de trimestre et de délai, lettre de révision à imprimer. Gratuit, sans compte.",
  chemin: "/outils/calcul-irl",
});

export default function PageCalculIrl() {
  return (
    <CoquilleOutil
      titre="Calcul de la révision de loyer (IRL)"
      chapo={
        <>
          Nouveau loyer = loyer actuel × nouvel indice ÷ indice de référence, arrondi au centime (article 17-1 de la loi du
          6 juillet 1989). Saisissez les deux indices et leur trimestre : l&apos;outil signale les erreurs fréquentes et
          prépare la lettre au locataire.
        </>
      }
      apres={
        <>
          <h2 className="text-[length:var(--pas-sous-titre)] font-semibold text-[var(--encre)]">Bon à savoir</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              L&apos;indice de référence est celui fixé au bail, ou celui de la dernière révision appliquée ; le nouvel
              indice est celui du même trimestre, un an plus tard.
            </li>
            <li>
              La révision n&apos;est pas automatique : le bailleur dispose d&apos;un an à compter de la date anniversaire
              pour la demander. Demandée en retard, elle prend effet à la date de la demande, sans rétroactivité.
            </li>
            <li>
              Aucune valeur d&apos;indice n&apos;est enregistrée dans cet outil : relevez-les sur{" "}
              <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
                le site de l&apos;Insee
              </a>
              .
            </li>
            <li>
              Certains logements sont soumis à des règles particulières (logement classé F ou G au diagnostic de
              performance énergétique, zone d&apos;encadrement des loyers) : vérifiez-les avant d&apos;appliquer la
              révision.
            </li>
          </ul>
        </>
      }
    >
      <CalculateurIrl />
    </CoquilleOutil>
  );
}
