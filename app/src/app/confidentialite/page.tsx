import Link from "next/link";
import { Article, CoquilleLegale } from "@/components/coquille-legale";

export const metadata = { title: "Confidentialité — Gerimmo" };

// Information de confidentialité. Elle portait son propre en-tête avant le
// 11/09, comme les deux autres pages légales — chacune le sien, tous
// différents. Les trois partagent désormais la même coquille.
//
// La politique complète (traitements, sous-traitants, durées, droits) vit dans
// le référentiel et sera publiée avec les CGU.
export default function PageConfidentialite() {
  return (
    <CoquilleLegale
      titre="Confidentialité"
      chapo="Ce que nous faisons de vos données, et ce que nous n'en faisons pas."
    >
      <Article titre="Vos données">
        <p>
          <b className="font-semibold">Formulaire de demande de devis.</b>{" "}
          Les informations transmises (nom, email, agence, téléphone, taille
          du portefeuille, message) servent uniquement à vous recontacter au
          sujet de votre demande. Elles ne sont ni transmises à des tiers, ni
          utilisées à d&apos;autres fins, et sont supprimées au plus tard
          24 mois après leur dépôt.
        </p>
        <p>
          <b className="font-semibold">Comptes et données de gestion.</b>{" "}
          Les données des comptes Gerimmo (bailleurs, locataires, agences)
          sont cloisonnées par organisation, hébergées dans l&apos;Union
          européenne, et régies par des durées de conservation propres à
          chaque type de pièce — détaillées dans l&apos;application. Gerimmo ne
          lit aucun compte bancaire et ne revend aucune donnée.
        </p>
        <p>
          <b className="font-semibold">Vos droits.</b> Vous pouvez demander
          l&apos;accès, la rectification ou la suppression de vos données en
          écrivant depuis le{" "}
          <Link href="/#agences" className="lien-discret">
            formulaire de contact
          </Link>{" "}
          (mentionnez « données personnelles » dans votre message) ou, pour
          un compte existant, depuis la messagerie de votre espace.
        </p>
      </Article>
    </CoquilleLegale>
  );
}
