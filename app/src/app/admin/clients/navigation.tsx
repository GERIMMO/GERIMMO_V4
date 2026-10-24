import Link from "next/link";
import styles from "../repertoires.module.css";

export function NavigationUtilisateurs({ vue }: { vue: "personnes" | "espaces" }) {
  return <nav aria-label="Annuaire des utilisateurs" className={styles.filters}>
    <Link href="/admin/clients" aria-current={vue === "personnes" ? "page" : undefined}>Personnes</Link>
    <Link href="/admin/clients?vue=espaces" aria-current={vue === "espaces" ? "page" : undefined}>Espaces et entreprises</Link>
  </nav>;
}
