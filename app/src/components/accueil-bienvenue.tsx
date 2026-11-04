import { ambianceAccueil } from "@/lib/ambiance-accueil";
import { PhotoAmbiance } from "@/components/photo-ambiance";
import styles from "./accueil-bienvenue.module.css";

/** Une scène propre à chaque fête ou saison, choisie depuis le jour civil de Paris. */
export function AccueilBienvenue({ jourParis, prenom }: {
  jourParis: string;
  prenom: string | null;
  base: string;
  lectureSeule?: boolean;
}) {
  const ambiance = ambianceAccueil(jourParis);
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
        sizes="(max-width: 1023px) 100vw, calc(100vw - 280px)"
        priority
        className={styles.image}
      />
    </div>
  </header>;
}
