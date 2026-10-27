import Link from "next/link";
import { Plus } from "lucide-react";
import { ambianceAccueil } from "@/lib/ambiance-accueil";
import { PhotoDecor } from "@/components/photo-decor";
import styles from "./bandeau-accueil.module.css";

/** Une seule image, choisie depuis le jour civil de Paris déjà utilisé par le tableau de bord. */
export function BandeauAccueil({ jour, prenom, lienAjout }: {
  jour: string;
  prenom: string | null;
  lienAjout?: string;
}) {
  const ambiance = ambianceAccueil(jour);
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });
  return <header className={styles.bandeau} data-ambiance={ambiance.id}>
    <div className={styles.decor} aria-hidden="true">
      <PhotoDecor key={ambiance.id} sources={[ambiance.image, "/illustrations/quartier-gerimmo-2026.jpg"]}
        sizes="(max-width: 640px) 100vw, (max-width: 1023px) 85vw, 80vw" priority className={styles.image} />
    </div>
    <div className={styles.contenu}>
      <p className={styles.date}><time dateTime={jour}>{date}</time></p>
      <h1>Bonjour{prenom ? ` ${prenom}` : ""}</h1>
      {lienAjout && <Link className={styles.ajouter} href={lienAjout}><Plus size={16} aria-hidden="true" />Ajouter un bien</Link>}
    </div>
    <span className={styles.ambiance} aria-hidden="true">{ambiance.libelle}</span>
  </header>;
}
