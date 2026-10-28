"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, Info, Mail, MessageCircle, Phone, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_BAILLEUR_LUI_MEME, correspond, initiales, nomComplet, sansRoleEnCours } from "@/lib/roles-personnes";
import { EchecLecture } from "../documents/echec-lecture";
import type { PersonneListe } from "./liste-personnes";
import styles from "./annuaire-personnes.module.css";
import { useBaseEspace } from "@/components/racine-espace-contexte";

const FILTRES = [
  { id: "toutes", libelle: "Toutes les fiches", ton: "neutre" },
  { id: "Locataire", libelle: "Locataires", ton: "locataire" },
  { id: "Garant", libelle: "Garants", ton: "garant" },
  { id: "Propriétaire", libelle: "Propriétaires", ton: "proprietaire" },
  { id: "sans-bail", libelle: "Sans bail en cours", ton: "neutre" },
] as const;
type Filtre = (typeof FILTRES)[number]["id"];

function dansFiltre(personne: PersonneListe, filtre: Filtre) {
  // Le bailleur lui-même (audit final, UX-01) compte parmi les propriétaires, jamais « Sans bail en cours ».
  return filtre === "toutes" || (filtre === "sans-bail"
    ? sansRoleEnCours(personne.roles)
    : personne.roles.some((role) => role.libelle === filtre || (filtre === "Propriétaire" && role.libelle === ROLE_BAILLEUR_LUI_MEME.libelle)));
}

function tonRole(libelle: string) {
  // Un bail encore en préparation reste neutre, comme sa puce sur la fiche (audit #264, FL-09).
  return libelle.endsWith("bail en préparation") ? "neutre" : libelle === "Locataire" ? "locataire" : libelle === "Garant" ? "garant" : "proprietaire";
}

export function AnnuaireProprietaire({ orgId, personnes, listeIllisible }: {
  orgId: string; personnes: PersonneListe[]; listeIllisible: boolean;
}) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const idRecherche = useId();
  const idListe = useId();
  const visibles = personnes.filter((personne) => dansFiltre(personne, filtre) && correspond(
    recherche, personne.nom, personne.prenom, personne.email, personne.telephone,
    ...personne.roles.map((role) => role.libelle), ...(sansRoleEnCours(personne.roles) ? ["Sans bail en cours"] : []),
  ));
  const filtreActif = recherche.trim() !== "" || filtre !== "toutes";
  // Compte neuf (audit final, UX-01) : la seule fiche est celle du bailleur lui-même. L'annuaire le dit et guide vers la
  // première fiche de locataire ou de garant, au lieu de présenter le propriétaire comme un futur locataire.
  const seulementVous = personnes.length > 0 && personnes.every((personne) => personne.estVous);
  function reinitialiser() { setRecherche(""); setFiltre("toutes"); }

  return <div className={styles.annuaire}>
    <div className={styles.outils}>
      <div className={styles.recherche}>
        <Search size={19} aria-hidden="true" />
        <Label htmlFor={idRecherche} className="sr-only">Filtrer les fiches</Label>
        <Input id={idRecherche} type="search" value={recherche} disabled={listeIllisible}
          onChange={(event) => setRecherche(event.target.value)} aria-controls={idListe}
          placeholder="Nom, e-mail, téléphone…" />
        {recherche && <button type="button" onClick={() => setRecherche("")} aria-label="Effacer la recherche"><X size={17} /></button>}
      </div>
      <p className={styles.repere}><UsersRound size={16} aria-hidden="true" />
        {listeIllisible ? "Fiches indisponibles" : `${personnes.length} fiche${personnes.length > 1 ? "s" : ""} enregistrée${personnes.length > 1 ? "s" : ""}`}
      </p>
      <div className={styles.filtres} role="group" aria-label="Filtrer par rôle">
        {FILTRES.map((item) => <button key={item.id} type="button" data-ton={item.ton}
          aria-pressed={filtre === item.id} aria-controls={idListe} disabled={listeIllisible}
          onClick={() => setFiltre(item.id)}>
          {item.id !== "toutes" && <span className={styles.point} aria-hidden="true" />}
          {item.libelle}<span className={styles.compteur}>{listeIllisible ? "—" : personnes.filter((p) => dansFiltre(p, item.id)).length}</span>
        </button>)}
      </div>
    </div>

    <div className={styles.enteteListe}>
      <h2>{FILTRES.find((item) => item.id === filtre)?.libelle}</h2>
      <span role="status">{listeIllisible ? "" : `${visibles.length} fiche${visibles.length > 1 ? "s" : ""}${filtreActif ? ` sur ${personnes.length}` : ""}`}</span>
    </div>
    <div id={idListe}>
      {!listeIllisible && seulementVous && !filtreActif && (
        <div className={styles.vide} data-testid="annuaire-premiere-fiche">
          <span className={styles.iconeVide}><UsersRound size={25} aria-hidden="true" /></span>
          <h3>Votre première fiche commence ici</h3>
          <p>Votre propre fiche de bailleur est déjà là : elle portera vos biens. Créez une fiche pour un locataire ou un garant, vous la retrouverez lors de la préparation de vos baux.</p>
          {/* L'en-tête porte déjà le bouton doré « Créer une fiche » : un seul primaire par écran (UX-18). */}
          <a href="#creer-fiche" className="btn-secondaire">Créer une fiche</a>
        </div>
      )}
      {listeIllisible ? <EchecLecture quoi={["vos fiches"]} /> : visibles.length === 0 ? (
        <div className={styles.vide}>
          <span className={styles.iconeVide}><UsersRound size={25} aria-hidden="true" /></span>
          <h3>{personnes.length === 0 ? "Votre première fiche commence ici" : "Aucune fiche dans cette sélection"}</h3>
          <p>{personnes.length === 0
            ? "Créez une fiche pour un locataire ou un garant. Vous pourrez la retrouver lors de la préparation de vos baux."
            : "Essayez un autre nom ou affichez toutes vos fiches."}</p>
          {personnes.length === 0 ? <a href="#creer-fiche" className="btn-or">Créer une fiche</a>
            : <button type="button" onClick={reinitialiser} className="btn-secondaire">Afficher toutes les fiches</button>}
        </div>
      ) : <ul className={styles.liste}>
        {visibles.map((personne) => {
          const nom = nomComplet(personne);
          const ton = personne.roles.length ? tonRole(personne.roles[0].libelle) : "neutre";
          const nonLus = personne.messagesNonLus ?? 0;
          return <li key={personne.id}>
            <Link href={`${base}/personnes/${personne.id}`} className={styles.fiche} data-ton={ton} title={`Ouvrir la fiche de ${nom}`}>
              <span className={styles.identite}>
                <span className={styles.avatar} aria-hidden="true">{initiales(personne.nom, personne.prenom)}</span>
                <span className={styles.nomEtRoles}>
                  <strong>{nom}</strong>
                  <span className={styles.roles}>
                    {personne.roles.length ? personne.roles.map((role) => <span key={role.libelle} className={styles.badge} data-ton={tonRole(role.libelle)}>
                      {role.libelle === "Garant" ? <ShieldCheck size={12} aria-hidden="true" /> : <UserRound size={12} aria-hidden="true" />}{role.libelle}
                    </span>) : <span className={styles.badge} data-ton="neutre">Sans bail en cours</span>}
                  </span>
                </span>
              </span>
              <span className={styles.coordonnees}>
                <span data-manquant={!personne.email}><Mail size={15} aria-hidden="true" /><span>{personne.email || "E-mail non renseigné"}</span></span>
                <span data-manquant={!personne.telephone}><Phone size={15} aria-hidden="true" /><span>{personne.telephone || "Téléphone non renseigné"}</span></span>
              </span>
              <span className={styles.acces}>
                {nonLus > 0 && <span className={styles.nonLus}><MessageCircle size={13} aria-hidden="true" />{nonLus} non lu{nonLus > 1 ? "s" : ""}</span>}
                <span className={styles.ouvrir}><span className={styles.libelleOuvrir}>Voir la fiche</span><ArrowRight size={16} aria-hidden="true" /></span>
              </span>
            </Link>
          </li>;
        })}
      </ul>}
    </div>
    {!listeIllisible && personnes.length > 0 && !seulementVous && <p className={styles.note}><Info size={15} aria-hidden="true" />Les rôles « Locataire » et « Garant » correspondent aux baux en cours. Vos autres fiches restent disponibles pour un prochain bail.</p>}
  </div>;
}
