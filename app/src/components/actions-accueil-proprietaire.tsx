"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Euro, FilePlus2, HousePlus, KeyRound, Wrench } from "lucide-react";
import { Modale } from "./ui/modale";
import type { LotPilotage } from "@/lib/pilotage-proprietaire";
import { correspond } from "@/lib/roles-personnes";
import styles from "@/app/agence/[orgId]/accueil-proprietaire.module.css";

export function ActionsAccueilProprietaire({ base, lots, lectureSeule }: { base: string; lots: LotPilotage[] | null; lectureSeule: boolean }) {
  const [location, ouvrirLocation] = useState(false);
  const [recherche, chercher] = useState("");
  if (lectureSeule) return null;
  const disponibles = lots?.filter(l => ["disponible", "brouillon"].includes(l.etat)) ?? [];
  const visibles = disponibles.filter(l => correspond(recherche, l.nom));
  return <section className={styles.actionsSection} aria-labelledby="actions-accueil-titre">
    <h2 id="actions-accueil-titre" className={styles.titreLigne}>Actions rapides</h2>
    <nav className={styles.actionsRapides} aria-label="Actions rapides">
      <Link href={`${base}/parc/nouveau`}><span><HousePlus aria-hidden="true" size={25}/></span><b>Ajouter<br/>un bien</b><ArrowRight size={17} aria-hidden="true"/></Link>
      <button type="button" aria-haspopup="dialog" aria-expanded={location} onClick={()=>{chercher("");ouvrirLocation(true);}}><span><KeyRound aria-hidden="true" size={25}/></span><b>Créer<br/>une location</b><ArrowRight size={17} aria-hidden="true"/></button>
      <Link href={`${base}/comptabilite?vue=saisie`}><span><Euro aria-hidden="true" size={26}/></span><b>Ajouter<br/>une opération</b><ArrowRight size={17} aria-hidden="true"/></Link>
      <Link href={`${base}/incidents/nouveau`}><span><Wrench aria-hidden="true" size={25}/></span><b>Déclarer<br/>un incident</b><ArrowRight size={17} aria-hidden="true"/></Link>
      <Link href={`${base}/documents?sel=depot`}><span><FilePlus2 aria-hidden="true" size={25}/></span><b>Ajouter<br/> un document</b><ArrowRight size={17} aria-hidden="true"/></Link>
    </nav>
    {location && <Modale titre="Quel logement souhaitez-vous louer ?" fermer={()=>ouvrirLocation(false)}>
      <p className="mb-4 text-sm text-muted-foreground">Retrouvez ses informations et commencez le bail depuis sa fiche.</p>
      {disponibles.length > 6 && <label className={styles.rechercheLogement}>Rechercher un logement<input type="search" value={recherche} onChange={e=>chercher(e.target.value)} placeholder="Nom du logement…"/></label>}
      {lots === null ? <p role="alert" className="err">Les logements n’ont pas pu être chargés.</p> : disponibles.length ? <><ul className={styles.choixLogements}>{visibles.map(l=><li key={l.id}><Link href={`${base}/parc/${l.bien_id}/lots/${l.id}#contrats-lot`}><KeyRound size={19} aria-hidden="true"/><span>{l.nom}</span><ArrowRight size={17} aria-hidden="true"/></Link></li>)}</ul>{!visibles.length && <p role="status" className="mb-4 text-sm">Aucun logement ne correspond à cette recherche.</p>}</> : <p className="mb-4 text-sm">Aucun logement disponible pour une nouvelle location.</p>}
      <Link className="lien-discret inline-flex min-h-11 items-center" href={`${base}/parc`}>Voir tous mes biens et locations →</Link>
    </Modale>}
  </section>;
}
