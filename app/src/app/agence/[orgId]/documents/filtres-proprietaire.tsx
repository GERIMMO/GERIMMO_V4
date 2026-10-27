import Link from "next/link";
import Form from "next/form";
import { CalendarDays, Search } from "lucide-react";
import { TYPES_DOCUMENT } from "@/lib/ged";
import styles from "./documents-proprietaire.module.css";

export function FiltresProprietaire({ recherche, lienEffacer }: {
  recherche: { q?: string; type?: string; du?: string; au?: string };
  lienEffacer: string;
}) {
  const periodeActive = Boolean(recherche.du || recherche.au);
  const actifs = Boolean(recherche.q || recherche.type || periodeActive);
  return <Form action={lienEffacer} className={styles.filtres} aria-label="Rechercher et filtrer les documents">
    <div className={styles.recherche}>
      <label htmlFor="q" className="sr-only">Recherche par titre</label>
      <Search size={17} aria-hidden="true" />
      <input key={recherche.q ?? ""} id="q" name="q" type="search" placeholder="Rechercher un titre…" defaultValue={recherche.q ?? ""} />
    </div>
    <div className={styles.typeFiltre}>
      <label htmlFor="type" className="sr-only">Type de document</label>
      <select key={recherche.type ?? ""} id="type" name="type" defaultValue={recherche.type ?? ""}>
        <option value="">Tous les types</option>
        {Object.entries(TYPES_DOCUMENT).filter(([valeur]) => valeur !== "document_test").map(([valeur, libelle]) =>
          <option key={valeur} value={valeur}>{libelle}</option>)}
      </select>
    </div>
    <details className={styles.periode}>
      <summary><CalendarDays size={16} aria-hidden="true" />Dates de dépôt{periodeActive && <span className={styles.filtreActif}>actives</span>}</summary>
      <div className={styles.champsDates}>
        <label>Du<input key={recherche.du ?? ""} name="du" type="date" defaultValue={recherche.du ?? ""} /></label>
        <label>Au<input key={recherche.au ?? ""} name="au" type="date" defaultValue={recherche.au ?? ""} /></label>
      </div>
    </details>
    <button type="submit" className={styles.appliquer}>Filtrer</button>
    {actifs && <Link href={lienEffacer} className={styles.effacer}>Effacer les filtres</Link>}
  </Form>;
}
