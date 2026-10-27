"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Camera, CheckCheck, CircleDollarSign, X } from "lucide-react";
import { FormulaireCloture, FormulairePhotoIncident, FormulaireQualification } from "@/app/agence/[orgId]/incidents/[incidentId]/actions-incident";
import { ETATS_INCIDENT, MOTIFS_CLOTURE_PAR_ETAT, transitionIncidentPossible, type EtatIncident } from "@/lib/incidents";
import type { IncidentVerification } from "@/lib/incidents-verifications";
import { afficherToast } from "@/components/ui/toast";
import styles from "./actions-rapides-incident.module.css";

type Action = "decision" | "photo" | "cloture";

/** L'incident peut disparaître au rafraîchissement ; le clavier reste dans la fenêtre encore ouverte. */
export function retablirFocusApresIncident(racine: HTMLElement | null) {
  if (!racine) return;
  const actif = racine.ownerDocument.activeElement;
  if (actif && actif !== racine.ownerDocument.body && !racine.contains(actif)) return;

  const fenetre = racine.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const cible = fenetre?.querySelector<HTMLElement>('[data-ui="modale-entete"] button[aria-label="Fermer"]')
    ?? fenetre ?? racine.closest<HTMLElement>("main");
  if (!cible || cible.closest("[hidden], [inert]")) return;

  // Hors fenêtre, le conteneur de page reste présent si la ligne disparaît.
  // Le tabindex temporaire ne l'ajoute pas au parcours clavier habituel.
  const tabindexTemporaire = !cible.hasAttribute("tabindex") && !cible.matches("button, a[href], input, select, textarea");
  if (tabindexTemporaire) cible.setAttribute("tabindex", "-1");
  cible.focus({ preventScroll: true });
  if (tabindexTemporaire) cible.removeAttribute("tabindex");
}

/** Accueil propriétaire : les mêmes formulaires que la fiche, ouverts sans acquittement artificiel. */
export function ActionsRapidesIncident({ orgId, href, incident, lectureSeule = false }: {
  orgId: string;
  href: string;
  incident: IncidentVerification;
  lectureSeule?: boolean;
}) {
  const router = useRouter();
  const prefixe = useId();
  const racine = useRef<HTMLDivElement>(null);
  const boutons = useRef<Partial<Record<Action, HTMLButtonElement | null>>>({});
  const [selection, choisir] = useState<{ active: Action | null; visitees: Action[] }>({ active: null, visitees: [] });
  const peutDecider = !lectureSeule && transitionIncidentPossible(incident.etat, "qualifie") && (
    ["declare", "rouvert"].includes(incident.etat) || !incident.imputation || Boolean(incident.imputation_contestation)
  );
  const peutJoindre = !lectureSeule && Object.hasOwn(ETATS_INCIDENT, incident.etat) && incident.etat !== "clos";
  const motifs = MOTIFS_CLOTURE_PAR_ETAT[incident.etat as EtatIncident] ?? [];
  // Une clôture rapide n'est proposée qu'après qualification ou intervention terminée.
  // Le classement sans suite d'un signalement reste dans la fiche complète.
  const peutCloturer = !lectureSeule && ["qualifie", "termine"].includes(incident.etat) && motifs.length > 0;
  const autorise = { decision: peutDecider, photo: peutJoindre, cloture: peutCloturer };
  const activer = (action: Action) => choisir(avant => ({
    active: avant.active === action ? null : action,
    visitees: avant.visitees.includes(action) ? avant.visitees : [...avant.visitees, action],
  }));
  const fermer = (action: Action) => {
    choisir(avant => ({ ...avant, active: null }));
    boutons.current[action]?.focus({ preventScroll: true });
  };
  const apresDecision = useCallback(() => {
    afficherToast("Prise en charge enregistrée.");
    retablirFocusApresIncident(racine.current);
    router.refresh();
  }, [router]);
  const apresCloture = useCallback(() => {
    afficherToast("Incident clôturé.");
    retablirFocusApresIncident(racine.current);
    router.refresh();
  }, [router]);
  const actions: { cle: Action; libelle: string; titre: string; icone: typeof Camera }[] = [
    { cle: "decision", libelle: "Décider qui paie", titre: "Prise en charge", icone: CircleDollarSign },
    { cle: "cloture", libelle: "Clôturer l’incident", titre: "Clôture de l’incident", icone: CheckCheck },
    { cle: "photo", libelle: "Ajouter une photo", titre: "Photos du dossier", icone: Camera },
  ];
  return <div ref={racine} className={styles.ensemble}>
    {incident.description && <p className={styles.description}>{incident.description}</p>}
    <div className={styles.actions}>
      {actions.filter(action => autorise[action.cle]).map(({ cle, libelle, icone: Icone }) => <button
        key={cle} ref={element => { boutons.current[cle] = element; }} type="button"
        className={cle === "decision" || cle === "cloture" ? styles.principale : styles.secondaire}
        aria-expanded={selection.active === cle} aria-controls={`${prefixe}-${cle}`} onClick={() => activer(cle)}>
        <Icone size={16} aria-hidden="true" />{libelle}
      </button>)}
      <Link href={href} className={styles.fiche}>Voir la fiche incident<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
    {actions.filter(action => autorise[action.cle] && selection.visitees.includes(action.cle)).map(({ cle, titre }) => <section
      key={cle} id={`${prefixe}-${cle}`} hidden={selection.active !== cle} className={styles.saisie} aria-labelledby={`${prefixe}-${cle}-titre`}>
      <div className={styles.entete}><h3 id={`${prefixe}-${cle}-titre`}>{titre}</h3>
        <button type="button" onClick={() => fermer(cle)} aria-label={`Fermer la saisie : ${titre}`}><X size={18} aria-hidden="true" /></button>
      </div>
      {cle === "decision" && <FormulaireQualification orgId={orgId} incidentId={incident.id} categorie={incident.categorie}
        imputation={incident.imputation} justification={incident.imputation_justification} estProprietaire
        informeLocataire={Boolean(incident.declarant_person_id || incident.bail_id)} apresSucces={apresDecision} />}
      {cle === "cloture" && <FormulaireCloture orgId={orgId} incidentId={incident.id} motifs={motifs} apresSucces={apresCloture} />}
      {cle === "photo" && <FormulairePhotoIncident orgId={orgId} incidentId={incident.id} />}
    </section>)}
  </div>;
}
