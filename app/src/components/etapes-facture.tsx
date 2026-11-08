import styles from "./consommations.module.css";

export function EtapesFacture({ etape }: { etape: number }) {
  return <ol className={styles.etapesFacture} aria-label="Progression de la facture">
    {["Dépôt facture", "Méthode & relevés", "Calcul & validation", "Envoi & suivi"].map((titre, i) =>
      <li key={titre} aria-current={i + 1 === (etape >= 4 ? etape - 1 : etape) ? "step" : undefined} data-termine={i + 1 < (etape >= 4 ? etape - 1 : etape)}>
        <span aria-hidden="true">{i + 1 < (etape >= 4 ? etape - 1 : etape) ? "✓" : i + 1}</span><strong>{titre}</strong>
      </li>)}
  </ol>;
}
