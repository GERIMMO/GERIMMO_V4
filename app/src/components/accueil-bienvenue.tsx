import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { ambianceAccueil } from "@/lib/ambiance-accueil";
import { PhotoAmbiance } from "@/components/photo-ambiance";
import styles from "./accueil-bienvenue.module.css";

/** Une scène propre à chaque fête ou saison, choisie depuis le jour civil de Paris. */
export function AccueilBienvenue({ jourParis, prenom, base, lectureSeule = false, geste, secondaire = false }: {
  jourParis: string;
  prenom: string | null;
  base: string;
  lectureSeule?: boolean;
  /**
   * Le premier geste du bandeau (audit final, UX-02 / PUB-11) : « Ajouter un bien », ou « Compléter mon profil pour créer
   * un bien » tant que l'adresse ou l'e-mail de contact manquent — la même porte que « Mes lots » (lib/profil-bailleur),
   * au lieu d'un bouton doré qui menait au mur « Complétez d'abord votre profil ».
   */
  geste?: { libelle: string; href: string };
  /** Le parcours de démarrage porte déjà le bouton doré de l'écran : le geste du bandeau passe en lien (audit final, UX-18). */
  secondaire?: boolean;
}) {
  const ambiance = ambianceAccueil(jourParis);
  const premierGeste = geste ?? { libelle: "Ajouter un bien", href: `${base}/parc/nouveau` };
  const date = new Date(`${jourParis}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });

  return <header className={styles.bienvenue} data-ambiance={ambiance.id}>
    <div className={styles.texte}>
      <p className={styles.date}><time dateTime={jourParis}>{date}</time></p>
      <h1 className={styles.titre}>Bonjour{prenom ? ` ${prenom}` : ""}</h1>
      <p className={styles.description}>Votre patrimoine, l’esprit tranquille.</p>
    </div>
    <div className={styles.visuel} aria-hidden="true">
      <PhotoAmbiance
        idInitial={ambiance.id}
        sizes="(max-width: 600px) 104px, (max-width: 1023px) 38vw, 32vw"
        priority
        className={styles.image}
      />
    </div>
    <div className={styles.actions}>
      {!lectureSeule && <Link className={secondaire ? styles.documents : styles.ajouter} href={premierGeste.href} data-geste-principal={secondaire ? undefined : ""}>
        {secondaire ? null : <Plus size={17} aria-hidden="true" />}{premierGeste.libelle}{secondaire && <ArrowUpRight size={16} aria-hidden="true" />}
      </Link>}
      <Link className={styles.documents} href={`${base}/documents`}>
        Mes documents<ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </header>;
}
