import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { chargerFicheArtisan } from "../acces";
import { CLASSE_BOUTON_PRINCIPAL, EnteteSousPage, Erreur, Succes } from "../ui";

const TITRE_ECHEC = "Lecture impossible";
const TITRE_FICHE_RELUE = "Votre fiche se lit de nouveau";
const TITRE_LECTURE_RETABLIE = "Lecture rétablie";

/**
 * Relecture du lot L4 (26/11) : le titre de l'onglet était fixe (« Lecture impossible ») et le restait quand la fiche se
 * relisait, sous un écran qui disait le contraire. Il suit maintenant la même lecture que la page. `chargerFicheArtisan`
 * est mémorisée par `cache()` pour la requête : le gabarit, ces métadonnées et la page partagent une seule lecture
 * (vérifié sur un `next dev` local, base fictive : un seul appel de `mon_artisan` par chargement de la page), donc le
 * titre et l'écran ne peuvent pas se contredire.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { erreur, fiche } = await chargerFicheArtisan();
  return { title: erreur ? TITRE_ECHEC : fiche ? TITRE_FICHE_RELUE : TITRE_LECTURE_RETABLIE };
}

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
 *
 * Phase 3, lot 60 (E001, E122) : la page annonçait cet échec sans rien vérifier.
 * Ouverte par un favori, par l'historique ou en rechargeant une fois la panne
 * passée, elle affirmait un incident qui n'existait plus (et le menu y menait
 * sous le nom « Aide en cas de problème »). Elle refait donc la lecture : si la
 * fiche se lit, l'artisan repart vers son espace, dont la garde l'oriente comme
 * d'habitude (connexion, inscription ou accueil) ; le message ne s'affiche que
 * si la lecture échoue encore.
 *
 * Reprise du lot 60 (R9) : chaque renvoi refait la lecture (`cache()` ne vaut que pour une requête). Une lecture qui
 * échoue sur /artisan puis réussit ici, puis échoue de nouveau, faisait enchaîner les renvois jusqu'à ce que le
 * navigateur coupe. La garde pose donc `?essai=1` (acces.ts) : venue d'elle, la page ne renvoie plus d'elle-même. Si la
 * fiche se lit de nouveau, elle le dit et laisse l'artisan repartir d'un geste : rechargée plus tard avec le paramètre,
 * elle n'annonce donc pas un incident passé (E122). Sans le paramètre, elle renvoie comme avant.
 */
export default async function PagePanneArtisan(props: PageProps<"/artisan/panne">) {
  const { erreur, fiche } = await chargerFicheArtisan();
  const venueDeLaGarde = (await props.searchParams).essai === "1";
  if (!erreur && !venueDeLaGarde) redirect("/artisan");
  if (!erreur) {
    // Relecture du lot L4 (26/11) : la lecture réussit mais ne rend aucune fiche (compte sans fiche artisan, session
    // fermée entre-temps). « Votre fiche se lit de nouveau… Rien n'est perdu » parlait d'une fiche qui n'existe pas : la
    // phrase reste neutre, avec le même bouton, et la page ne renvoie toujours pas d'elle-même (R9).
    return (
      <div className="space-y-5">
        <EnteteSousPage rubrique="aide" titre={fiche ? TITRE_FICHE_RELUE : TITRE_LECTURE_RETABLIE} />
        <Succes>
          {fiche ? <>La lecture de votre fiche a réussi à l&apos;instant. Rien n&apos;est perdu.</> : "La lecture fonctionne de nouveau."}
        </Succes>
        <Link href="/artisan" className={`${CLASSE_BOUTON_PRINCIPAL} sm:w-fit`}>
          Revenir à mon espace
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <EnteteSousPage rubrique="aide" titre="Lecture momentanément impossible" />
      <Erreur>
        Votre fiche n&apos;a pas pu être lue à l&apos;instant. Rien n&apos;est perdu — ni
        vos attestations, ni vos missions.
      </Erreur>
      {/* 25/09 (A17) : « signalez-le » mène à l'aide, au lieu de le laisser
          chercher le rond « Aide et retours ». */}
      <p className="text-base text-[var(--corps)]">
        Réessayez dans un instant. Si cela persiste,{" "}
        <Link
          href="/assistance?ecran=%2Fartisan%2Fpanne&action=lien&retour=%2Fartisan"
          className="font-medium text-[var(--encre)] underline underline-offset-4"
        >
          signalez-le à Gerimmo
        </Link>
        .
      </p>
      <Link href="/artisan" className={`${CLASSE_BOUTON_PRINCIPAL} sm:w-fit`}>
        Réessayer
      </Link>
    </div>
  );
}
