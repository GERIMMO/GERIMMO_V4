import { createRoot } from "react-dom/client";
import { NavAdmin, OngletsSupervision, MenuSupervisionProvider } from "../../../src/app/admin/nav-admin";
import { VueTraitementsDurables } from "../../../src/app/admin/sante/vue-traitements-durables";
import { FiltreMissions } from "../../../src/app/admin/equipes/filtre-missions";
const etat=new URLSearchParams(location.search).get("etat"),erreur=etat==="erreur",degrade=etat==="degrade";
const base={organization_id:"organisation-fictive",tentatives:2,updated_at:"2026-11-18T12:00:00Z",expire_le:null,finalisation_etat:"en_attente",reprise_autonome:false};
createRoot(document.getElementById("racine")!).render(<>
 <p>Aperçu isolé — données fictives, aucun traitement déclenché</p>
 <MenuSupervisionProvider><nav className="admin-nav" aria-label="Navigation de la supervision"><NavAdmin artisansEnAttente={erreur?null:2} decisions={erreur?null:3}/></nav><OngletsSupervision/></MenuSupervisionProvider>
 <main><h1>Santé et automatismes</h1>
 <VueTraitementsDurables pilote chiffrement={!erreur} indisponible={erreur} factures={[]} intentions={[]} courriels={degrade?[{...base,id:"courriel-fictif-1",etat:"inconnu",circuit:"confirmation-abonnement",motif:"Réponse du prestataire perdue"},{...base,id:"courriel-fictif-2",etat:"echec",circuit:"accuse-resiliation",motif:"Refus certain"}]:[]}/>
 <FiltreMissions items={[{id:"normale",name:"Quittances",team:"Gestion",state:"ok",content:<section><h2>Quittances</h2><p>À l’heure</p></section>},{id:"retard",name:"Abonnements",team:"Gestion",state:"attention",content:<section><h2>Abonnements</h2><p>En retard</p></section>},{id:"pause",name:"Marketing",team:"Communication",state:"pause",content:<section><h2>Marketing</h2><p>En pause</p></section>},{id:"inconnu",name:"Sauvegarde",team:"Service",state:"unknown",content:<section><h2>Sauvegarde</h2><p>État indisponible</p></section>}]}/>
 </main></>);
