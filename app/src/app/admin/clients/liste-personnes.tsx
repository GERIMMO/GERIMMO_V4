import Link from "next/link";
import { ArrowRight, Building2, KeyRound, UserRound, UsersRound } from "lucide-react";
import { initiales } from "@/lib/clients-supervision";
import styles from "./utilisateurs.module.css";

export type PersonneAnnuaire = {
  cle: string; nom: string; email: string | null; espaces: string | null;
  roles: string[]; archive: boolean; account_id: string | null;
  artisan_id: string | null; person_id: string | null;
};
const ROLES: Record<string, string> = {
  proprietaire: "Propriétaire", locataire: "Locataire", garant: "Garant", artisan: "Artisan",
  superviseur: "Superviseur", superviseur_delegue: "Relais de supervision",
  admin_agence: "Administrateur d’agence", agent: "Agent", sans_role: "Sans rôle attribué",
};
const tons: Record<string, string> = { proprietaire: "vert", locataire: "bleu", artisan: "or", superviseur: "violet", superviseur_delegue: "violet", garant: "bleu" };

/** Le compte et les rôles historiques ne préjugent pas des droits actifs. */
export function ListePersonnes({ personnes }: { personnes: PersonneAnnuaire[] }) {
  return <>
    <div className={styles.colonnes} aria-hidden="true"><span>Personne et profil</span><span>Espace rattaché</span><span>Compte</span><span /></div>
    <ul className={styles.liste} aria-label="Personnes trouvées">
      {personnes.map(u => {
        const nom = u.nom?.trim() || u.email || "Nom non renseigné";
        const emailDistinct = u.email && u.email.toLocaleLowerCase() !== nom.toLocaleLowerCase();
        const href = u.account_id ? `/admin/comptes/${u.account_id}` : u.artisan_id ? `/admin/clients/artisans/${u.artisan_id}` : `/admin/clients/personnes/${u.person_id}`;
        return <li key={u.cle}><Link href={href} className={styles.personne}>
          <span className={styles.identite}><span className={styles.avatar} data-ton={tons[u.roles[0]] ?? "bleu"} aria-hidden="true">{nom.includes("@") ? <UserRound size={20}/> : initiales(nom)}</span><span className={styles.nom}>
            <strong>{nom}</strong>{emailDistinct && <span className={styles.email}>{u.email}</span>}
            <span className={styles.roles} aria-label="Rôles connus, actuels ou passés">{u.roles.map(role => <span className={styles.role} data-ton={tons[role] ?? "bleu"} key={role}>{ROLES[role] ?? role}</span>)}</span>
          </span></span>
          <span className={styles.espace}><Building2 size={15} aria-hidden="true"/><span>{u.espaces || "Aucun espace rattaché"}</span></span>
          <span className={styles.compte}>{u.account_id ? <KeyRound size={15} aria-hidden="true"/> : <UserRound size={15} aria-hidden="true"/>}<span>{u.archive ? "Fiche archivée" : u.account_id ? "Compte créé" : "Sans compte"}</span></span>
          <span className={styles.ouvrir}><span className="sr-only">Ouvrir la fiche</span><ArrowRight size={18} aria-hidden="true"/></span>
        </Link></li>;
      })}
    </ul>
    {!personnes.length && <div className={styles.vide}><UsersRound size={30} aria-hidden="true"/><h2>Aucun utilisateur trouvé</h2><p>Essayez un autre nom ou retirez un filtre.</p><Link href="/admin/clients" className="btn-secondaire">Effacer les filtres</Link></div>}
  </>;
}
