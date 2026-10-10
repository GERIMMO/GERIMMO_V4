"use client";
import { useEffect, useState, type ReactNode } from "react";
import { UserRoundPlus, ArrowLeft } from "lucide-react";
import parcours from "@/components/presentation-parcours.module.css";
import styles from "./creation-personne.module.css";
import { TitreEcran } from "@/components/titre-ecran";

/** La liste et la saisie restent montées lors des allers-retours. */
export function VuePersonnes({ titre, nombre, liste, creation }: { titre: string; nombre: string; liste: ReactNode; creation: ReactNode }) {
  const [ouverte, setOuverte] = useState(false);
  useEffect(() => {
    const sync = () => setOuverte(location.hash === "#creer-fiche");
    sync(); window.addEventListener("hashchange", sync); window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  function afficher(ouvrir: boolean) {
    setOuverte(ouvrir);
    const url = new URL(location.href); url.hash = ouvrir ? "creer-fiche" : "";
    history.pushState(null, "", url);
    requestAnimationFrame(() => document.getElementById(ouvrir ? "creation-personne-titre" : "annuaire-personnes-titre")?.focus({preventScroll:true}));
  }
  return <div className={styles.vue}>
    <section hidden={ouverte} aria-label="Liste des personnes">
      <div className="entete-page"><TitreEcran rubrique="personnes" id="annuaire-personnes-titre" tabIndex={-1}>{titre}</TitreEcran><div className="flex items-center gap-4"><span className="mono-discret">{nombre}</span><a href="#creer-fiche" className="btn-or" onClick={e => {e.preventDefault(); afficher(true);}}>+ Créer une fiche</a></div></div>
      {liste}
    </section>
    <section id="creer-fiche" hidden={!ouverte} aria-label="Créer une fiche">
      <a href="#" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground" onClick={e => {e.preventDefault(); afficher(false);}}><ArrowLeft size={15} aria-hidden="true" />Retour à mes fiches</a>
      <header className={parcours.enteteCreation}><UserRoundPlus size={27} aria-hidden="true" /><div><span className={parcours.surtitre}>Nouvelle personne</span><h1 id="creation-personne-titre" tabIndex={-1}>Créer une fiche</h1><p>Une seule fiche, réutilisable dans vos baux. Renseignez-la étape par étape.</p></div></header>
      {creation}
    </section>
  </div>;
}
