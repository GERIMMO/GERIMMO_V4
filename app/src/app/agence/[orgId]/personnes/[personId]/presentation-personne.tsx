import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, UserRound } from "lucide-react";
import { initiales, nomComplet, type RolePersonne } from "@/lib/roles-personnes";
import { estPersonnePhysique, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { formaterDate } from "@/lib/ged";
import styles from "./presentation-personne.module.css";

type Identite = {
  nom: string; prenom: string | null; qualite: string | null; email: string | null; telephone: string | null;
  address_line1: string | null; postal_code: string | null; city: string | null;
  date_naissance: string | null; commune_naissance: string | null;
};

export function PresentationPersonne({ personne, roles, sansRole, retour, edition, lienModifier, relationsIndisponibles = false }: {
  personne: Identite; roles: RolePersonne[]; sansRole: string; retour: { href: string; libelle: string }; edition: ReactNode; lienModifier: string; relationsIndisponibles?: boolean;
}) {
  const nom = nomComplet(personne);
  const qualite = normaliserQualiteBailleur(personne.qualite);
  const physique = estPersonnePhysique(personne.qualite, personne.prenom);
  const adresse = [personne.address_line1, [personne.postal_code, personne.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const adresseComplete = Boolean(personne.address_line1 && personne.postal_code && personne.city);
  return <>
    <Link className={styles.retour} href={retour.href}><ArrowLeft size={16} aria-hidden="true"/>{retour.libelle}</Link>
    <section className={styles.profil} aria-labelledby="nom-personne">
      <header className={styles.entete}>
        <span className={styles.avatar} aria-hidden="true">{initiales(personne.nom, personne.prenom)}</span>
        <div className={styles.identite}><p className={styles.qualite}>{qualite || "Fiche personne"}</p><h1 id="nom-personne">{nom}</h1>
          <div className={styles.roles}>{roles.length ? roles.map(r => <span key={r.libelle} className={styles.role}>{r.libelle}</span>) : <span className={styles.role}>{relationsIndisponibles ? "Rattachements à vérifier" : sansRole}</span>}</div>
        </div>
      </header>
      <dl className={styles.coordonnees}>
        <div><dt><Mail size={15} aria-hidden="true"/>Email</dt><dd>{personne.email ? <a href={`mailto:${personne.email.replace(/[\r\n]/g, "")}`} aria-label={`Écrire par email à ${nom}`}>{personne.email}</a> : <a href={lienModifier} className={styles.manquant}>Ajouter un email</a>}</dd></div>
        <div><dt><Phone size={15} aria-hidden="true"/>Téléphone</dt><dd>{personne.telephone ? <a href={`tel:${personne.telephone.replace(/[^\d+]/g, "")}`} aria-label={`Appeler ${nom}`}>{personne.telephone}</a> : <span className={styles.nonRenseigne}>Non renseigné</span>}</dd></div>
        <div><dt><MapPin size={15} aria-hidden="true"/>Adresse</dt><dd>{adresse || <a href={lienModifier} className={styles.manquant}>Ajouter une adresse</a>}{adresse && !adresseComplete && <a className={styles.completer} href={lienModifier}>Compléter l’adresse</a>}</dd></div>
        {physique && <div><dt><UserRound size={15} aria-hidden="true"/>État civil</dt><dd>{personne.date_naissance || personne.commune_naissance ? <>
          {personne.date_naissance ? `Né(e) le ${formaterDate(personne.date_naissance)}` : "Date de naissance non renseignée"}
          {personne.commune_naissance && <span className={styles.secondeLigne}>À {personne.commune_naissance}</span>}
          {(!personne.date_naissance || !personne.commune_naissance) && <a className={styles.completer} href={lienModifier}>Compléter l’état civil</a>}
        </> : <a href={lienModifier} className={styles.manquant}>Compléter l’état civil</a>}</dd></div>}
      </dl>
      <div id="identite" className={styles.edition}>{edition}</div>
    </section>
  </>;
}
