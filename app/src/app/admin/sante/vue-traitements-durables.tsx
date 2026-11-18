import Link from "next/link";
import styles from "../console-direction.module.css";
type Suivi = { id:string; organization_id:string|null; etat:string; tentatives:number; motif?:string|null };
type Courriel = Suivi & { circuit:string|null; finalisation_etat:string|null; reprise_autonome:boolean; updated_at:string; expire_le:string|null };
type Facture = Suivi & { dernier_resultat:string|null; disponible_le:string };
type Intention = Suivi & { evenement:string };
const ETATS:Record<string,string>={inconnu:"Envoi incertain — vérifier la preuve avant toute reprise",echec:"Échec — vérifier le résultat avant de reprendre",en_cours:"En cours de traitement",en_attente:"En attente de traitement",a_preparer:"À préparer",preparation:"Préparation en cours",a_verifier:"Vérification nécessaire",terminee:"Terminé",accepte:"Accepté par le prestataire",envoye:"Envoyé au prestataire",livre:"Livraison confirmée par le prestataire"};
const CIRCUITS:Record<string,string>={"confirmation-abonnement":"Confirmation d’abonnement","accuse-resiliation":"Accusé de résiliation","notification-transactionnelle":"Notification de dossier","lib/courriers-contrat-envoi":"Courrier contractuel","lib/notifications":"Notification"};
const etatLisible=(etat:string)=>ETATS[etat]??"État à vérifier dans les détails";

/** Présentation des trois lectures existantes, bornées à 50 lignes chacune. Aucun ordre de reprise n'est exécuté ici. */
export function VueTraitementsDurables({pilote,chiffrement,indisponible,factures,courriels,intentions}:{pilote:boolean;chiffrement:boolean;indisponible:boolean;factures:Facture[];courriels:Courriel[];intentions:Intention[]}){
 const bloques=courriels.filter(m=>m.etat==="echec"||m.etat==="inconnu").length;
 const facturesEnErreur=factures.filter(f=>["echec","inconnu","a_verifier"].includes(f.etat)).length;
 const notificationsAVerifier=intentions.filter(n=>n.etat==="a_verifier").length;
 const finalisationsAVerifier=courriels.filter(m=>m.finalisation_etat==="a_verifier").length;
 const compte=(n:number)=>`${n===50?"Au moins ":""}${n}`;
 const nombre=(n:number,nom:string)=>`${compte(n)} ${nom}${n>1?"s":""}`;
 return <section id="traitements-durables" className={styles.resume} aria-label="Courriels et factures à suivre">
  <h2>Courriels et factures à suivre</h2>
  {!chiffrement&&<p role="alert">Les nouveaux envois ponctuels sont bloqués : leur protection doit être configurée.</p>}
  {indisponible?<p role="alert">Le suivi est indisponible. Impossible de confirmer l’absence de blocage ; actualisez la page.</p>:<>
   <p>{bloques>0?`${bloques} courriel${bloques>1?"s":""} bloqué${bloques>1?"s":""} ou à vérifier dans les résultats consultés.`:"Aucun courriel bloqué dans les résultats consultés."}</p>
   <p>{nombre(courriels.length,"courriel")} à suivre · {nombre(factures.length,"facture")} en attente · {nombre(intentions.length,"notification")} à préparer ou vérifier.</p>
   {facturesEnErreur>0&&<p role="alert">{nombre(facturesEnErreur,"facture")} nécessite{facturesEnErreur>1?"nt":""} une vérification.</p>}
   {notificationsAVerifier>0&&<p role="alert">{nombre(notificationsAVerifier,"notification")} nécessite{notificationsAVerifier>1?"nt":""} une vérification.</p>}
   {finalisationsAVerifier>0&&<p role="alert">L’enregistrement du résultat de {nombre(finalisationsAVerifier,"courriel")} reste à vérifier.</p>}
   <p>Vue limitée aux 50 premiers éléments de chaque file. Un envoi accepté ne prouve pas sa réception.</p>
   <div className={styles.liens}><Link href="/admin/journaux">Consulter le journal des envois</Link><Link href="/admin/equipes">Vérifier les traitements</Link></div>
   {[
    {titre:"Courriels",lignes:courriels.map(m=>({source:m,nom:CIRCUITS[m.circuit??""]??"Courriel",texte:etatLisible(m.etat),suite:m.etat==="inconnu"?"Ne pas renvoyer sans preuve du prestataire.":m.finalisation_etat!=="terminee"?"Enregistrement du résultat à suivre.":m.reprise_autonome?"Reprise automatique prévue.":"Reprise à vérifier selon le dossier."}))},
    {titre:"Factures",lignes:factures.map(f=>({source:f,nom:"Facture",texte:etatLisible(f.etat),suite:"Consultez le résultat du traitement avant d’intervenir."}))},
    {titre:"Notifications",lignes:intentions.map(n=>({source:n,nom:"Notification",texte:etatLisible(n.etat),suite:n.etat==="a_verifier"?"Une vérification est nécessaire avant reprise.":"Préparation en attente ou en cours."}))},
   ].filter(g=>g.lignes.length>0).map(g=><details className={styles.detail} key={g.titre}><summary>{g.titre} — {compte(g.lignes.length)} à suivre</summary>{g.lignes.map((l,i)=><div className={styles.file} key={l.source.id}><strong>{l.nom} · {i+1} — {l.texte}</strong><p>{l.suite}</p><details className={styles.detail}><summary>Détails techniques</summary><dl>{Object.entries(l.source).map(([cle,valeur])=><div key={cle}><dt className="font-medium">{cle}</dt><dd className="break-all">{valeur===null?"Non renseigné":String(valeur)}</dd></div>)}</dl></details></div>)}</details>)}
  </>}
  {pilote&&<p className="mt-3">Les courriers non qualifiés et les relances collectives restent suspendus. Les envois autorisés et les paiements gardent leurs contrôles propres.</p>}
  <details className={styles.detail}><summary>Détails techniques — protection et périmètre</summary><p>Conservation chiffrée des envois : {chiffrement?"configurée":"à configurer"}. Aucune adresse ni contenu de message n’est affiché.</p><p>Accès, invitations, notifications essentielles, quittances et baux signés contrôlés conservent leurs règles d’autorisation. Aucun envoi n’est activé depuis cet écran.</p></details>
 </section>;
}
