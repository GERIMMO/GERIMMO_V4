import Link from "next/link";
import { UsersRound, Building2 } from "lucide-react";
import styles from "./utilisateurs.module.css";

export function NavigationUtilisateurs({ vue }: { vue: "personnes" | "espaces" }) {
  return <nav aria-label="Annuaire des utilisateurs" className={styles.navigation}>
    <Link href="/admin/clients" aria-current={vue === "personnes" ? "page" : undefined}><UsersRound size={18} aria-hidden="true"/>Personnes</Link>
    <Link href="/admin/clients?vue=espaces" aria-current={vue === "espaces" ? "page" : undefined}><Building2 size={18} aria-hidden="true"/>Espaces et entreprises</Link>
  </nav>;
}
