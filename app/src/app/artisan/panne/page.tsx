import Link from "next/link";
import { CLASSE_BOUTON_PRINCIPAL, Erreur } from "../ui";

export const metadata = { title: "Lecture impossible — Espace artisan" };

/**
 * La lecture de la fiche artisan a échoué.
 *
 * Sans cette page, une lecture tombée envoyait l'artisan sur le formulaire
 * d'inscription — où il aurait lu « Ce SIRET est déjà inscrit » sans rien
 * comprendre, alors que sa fiche existe et n'a rien. C'est le même défaut que
 * celui relevé le 11/09 sur les pièces du locataire : une requête en échec
 * annonçait au locataire que sa pièce n'existait pas, alors qu'on n'avait
 * simplement pas pu la chercher. Dire « on n'a pas pu lire » n'est jamais
 * équivalent à dire « il n'y a rien ».
 */
export default function PagePanneArtisan() {
  return (
    <div className="space-y-5">
      <h1 className="text-[1.5rem] leading-tight text-[var(--encre)]">
        Lecture momentanément impossible
      </h1>
      <Erreur>
        Votre fiche n&apos;a pas pu être lue à l&apos;instant. Rien n&apos;est perdu — ni
        vos attestations, ni vos missions.
      </Erreur>
      <p className="text-base text-[var(--corps)]">
        Réessayez dans un instant. Si cela persiste, signalez-le à Gerimmo.
      </p>
      <Link href="/artisan" className={CLASSE_BOUTON_PRINCIPAL}>
        Réessayer
      </Link>
    </div>
  );
}
