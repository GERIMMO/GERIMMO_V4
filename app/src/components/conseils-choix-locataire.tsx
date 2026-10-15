import { ChevronDown, Lightbulb } from "lucide-react";
import {
  MENTION_GENERALE_CONSEILS,
  NIVEAUX_CERTITUDE,
  conseilsDuNiveau,
} from "@/lib/conseils-locataire";
import styles from "./conseils-choix-locataire.module.css";

/**
 * Où le rappel est posé. Le texte est le même partout (il ne dépend pas du
 * contrat du propriétaire) ; l'emplacement ne sert qu'à garder les
 * identifiants uniques et à retrouver le bloc dans un test ou un parcours.
 */
export type EmplacementConseils =
  /** Étape « Personnes » du bail en préparation, là où le locataire est choisi. */
  | "creation-bail"
  /** Fiche d'un bail en cours, à côté des garants. */
  | "garanties-bail";

/**
 * « Conseils pour choisir votre locataire » — repliés par défaut.
 *
 * Un élément <details> natif : le clavier (Entrée, Espace), le lecteur d'écran
 * (état déplié ou replié annoncé) et l'impression fonctionnent sans script.
 *
 * Ce bloc n'évalue personne : il ne reçoit ni dossier, ni montant, ni nom, et
 * n'affiche ni verdict, ni score, ni note. Il aide à relire un dossier avec
 * son propre contrat d'assurance. Qui le voit est décidé par l'appelant (le
 * propriétaire en gestion directe seulement) ; ce composant ne lit aucune
 * session.
 */
export function ConseilsChoixLocataire({
  emplacement,
  className,
}: {
  emplacement: EmplacementConseils;
  /** Pour l'espacement avec ce qui précède (ex. « mt-4 ») ; l'apparence, elle, ne change pas. */
  className?: string;
}) {
  const base = `conseils-locataire-${emplacement}`;
  return (
    <details
      className={className ? `${styles.conseils} ${className}` : styles.conseils}
      id={base}
      data-conseils-locataire={emplacement}
    >
      <summary className={styles.entete}>
        <span className={styles.icone} aria-hidden="true">
          <Lightbulb size={18} />
        </span>
        <span className={styles.titres}>
          <span className={styles.titre}>Conseils pour choisir votre locataire</span>
          <span className={styles.sousTitre}>Selon les conditions des assurances loyers impayés</span>
        </span>
        <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
      </summary>
      <div className={styles.corps}>
        <p className={styles.intro}>
          Des repères pour relire un dossier avec les conditions de votre assurance loyers impayés.
          Ils ne notent aucun candidat.
        </p>
        {NIVEAUX_CERTITUDE.map((niveau) => {
          const idNiveau = `${base}-${niveau.id}`;
          return (
            <div key={niveau.id} role="group" aria-labelledby={idNiveau} className={styles.groupe}>
              <p id={idNiveau} className={styles.niveau}>
                <span className={`puce ${niveau.puce}`}>{niveau.libelle}</span>
              </p>
              <p className={styles.explication}>{niveau.explication}</p>
              <ul className={styles.liste}>
                {conseilsDuNiveau(niveau.id).map((conseil) => (
                  <li key={conseil.id} data-conseil={conseil.id}>
                    <strong className={styles.conseilTitre}>{conseil.titre}</strong>
                    <span className={styles.conseilTexte}>{conseil.conseil}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className={styles.mention} role="note">
          <strong>Avertissement.</strong> {MENTION_GENERALE_CONSEILS}
        </p>
      </div>
    </details>
  );
}
