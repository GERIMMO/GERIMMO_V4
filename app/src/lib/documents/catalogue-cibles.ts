import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntreeCatalogue } from "./catalogue";
import { lireLignes, texte, RefusDocument, REFUS_ACCUSE_APRES_SORTIE, REFUS_INVENTAIRE_NON_MEUBLE, type LigneDocument } from "./modeles/catalogue-bail";
import { REFUS_TERME_NON_DU, REFUS_TERME_SOLDE } from "./modeles/avis-echeance";
import { formaterDateFr } from "./gabarit";
import { ETATS_BAIL, ETATS_EDL, ETATS_MANDAT } from "@/lib/baux";
import { ETATS_LOT } from "@/lib/parc";
import { ETATS_INCIDENT } from "@/lib/incidents";
import { NATURES_TRAVAUX, STATUTS_INTERVENTION } from "@/app/agence/[orgId]/artisans/referentiel";
// `detailEnregistre` (régularisations de charges) : la régularisation porte déjà son détail des dépenses ; la saisie du détail à la génération
// est alors facultative (D39).
export type ChoixDossier = {id:string;libelle:string;bailId?:string;detailEnregistre?:boolean};
// Phase 3 (S34) : l'état d'un dossier s'affiche avec les mots des écrans (« Préavis », « Loué », « Planifiée »), jamais la valeur
// de la base (« preavis », « loue », « planifiee »). Une valeur sans libellé connu s'affiche telle quelle.
const LIBELLES_ETAT: Partial<Record<EntreeCatalogue["cible"], Record<string, string>>> = { bail: ETATS_BAIL, lot: ETATS_LOT, edl: ETATS_EDL, incident: ETATS_INCIDENT, intervention: STATUTS_INTERVENTION, mandat: ETATS_MANDAT };
export const TABLES_CATALOGUE = {bail:"baux",lot:"lots",appel:"appels_loyer",quittance:"quittances",depot:"depot_encaissements",revision:"revisions_loyer",attestation:"documents",edl:"etats_des_lieux",regularisation:"regularisations_charges",incident:"incidents",intervention:"incident_interventions",ecriture:"ecritures",mandat:"mandats",rapport:"rapports_gestion"} as const;
// Phase 3 (C40, S09) : un filtre sur une table liée exige qu'elle figure dans la sélection ; « !inner » écarte le dossier qui
// n'a aucune ligne liée retenue (accusé : un congé du locataire non annulé). La contrainte est nommée : d'autres tables relient
// aussi le bail aux congés (intentions_conge), aux lots (écritures) et aux restitutions.
// Reprise du lot 38 : les décomptes du dépôt demandent une restitution préparée, le comparatif un devis déposé, le compte rendu
// celui de l'artisan (ils étaient proposés puis refusés). Inventaires : le lot est lu pour la règle « logement meublé » de
// l'assembleur, appliquée après lecture (motifsDeRefus) parce qu'elle porte aussi sur le type du bail.
const LIAISONS_CIBLES: Record<string, string> = {
  accuse_conge: "conges!conges_bail_meme_org_fk!inner(par)",
  inventaire_entree: "lots!baux_lot_meme_org_fk!inner(meuble)",
  inventaire_sortie: "lots!baux_lot_meme_org_fk!inner(meuble)",
  decompte_restitution: "restitutions!restitutions_bail_meme_org_fk!inner(id)",
  decompte_retenues: "restitutions!restitutions_bail_meme_org_fk!inner(id)",
  comparatif_devis: "incident_devis!incident_devis_incident_meme_org_fk!inner(id)",
  compte_rendu_intervention: "intervention_comptes_rendus!intervention_comptes_rendus_intervention_meme_org_fk!inner(id)",
};
// Les colonnes que motifsDeRefus relit pour un dossier forcé (la liste, elle, lit toutes les colonnes).
const COLONNES_CONTROLE: Record<string, string> = { avis_echeance: "bail_id,periode", inventaire_entree: "type", inventaire_sortie: "type" };
export function colonnesCibles(modele:EntreeCatalogue, colonnes:string):string {
  return [colonnes, colonnes==="*" ? "" : COLONNES_CONTROLE[modele.id], LIAISONS_CIBLES[modele.id]].filter(Boolean).join(",");
}
export function filtrerCibles<T>(q:T, modele:EntreeCatalogue):T {
  // Les filtres sont appliqués avant la pagination, dans la requête SQL.
  type Filtre = {eq(k:string,v:unknown):Filtre;is(k:string,v:null):Filtre;not(k:string,op:string,v:null|string):Filtre;in(k:string,v:string[]):Filtre};
  let r=q as unknown as Filtre;
  const id=modele.id;
  if(id==="quittance" || id==="recu_partiel") r=r.eq("est_quittance",id==="quittance");
  if(id==="edl_entree" || id==="edl_sortie") r=r.eq("type",id==="edl_entree"?"entree":"sortie");
  if(id==="bail_individuel") r=r.not("chambre_id","is",null).eq("etat","brouillon");
  if(["bail_nu","bail_meuble","bail_colocation"].includes(id)) r=r.eq("type",id.slice(5)).is("chambre_id",null).eq("etat","brouillon");
  // Phase 3 (C06, C19, C31, C32, C40, C46, S09) : le dossier proposé est celui que le modèle accepte, selon l'état du bail
  // (les mêmes règles que les assembleurs, qui refusent aussi un identifiant forcé).
  // Avenant : un bail signé et en cours, jamais un brouillon (le contrat n'est pas conclu) ni un bail terminé.
  if(id==="avenant") r=r.in("etat",["actif","preavis"]);
  // Avenant de remplacement : le contrat commun d'une colocation en cours.
  if(id==="avenant_remplacement") r=r.eq("type","colocation").is("chambre_id",null).eq("etat","actif");
  // Congé du bailleur : un bail actif (en préavis, un congé est déjà enregistré ; terminé, le bail est clos).
  if(id==="conge_bailleur") r=r.eq("etat","actif");
  // Accusé de réception : un congé du locataire enregistré (non annulé), sortie pas encore faite (bail en préavis).
  if(id==="accuse_conge") r=r.eq("etat","preavis").eq("conges.par","locataire").is("conges.annule_le",null);
  // Acte de cautionnement : à la signature du bail ou pendant la location, jamais pendant le préavis ni après la fin.
  if(id==="cautionnement") r=r.in("etat",["brouillon","actif"]);
  // Inventaires du mobilier : celui de sortie, une fois le congé enregistré. Le logement meublé (case du lot OU bail de type
  // meublé, comme l'assembleur) se contrôle après lecture : un seul filtre ne peut pas porter sur le bail et sur son lot.
  if(id==="inventaire_sortie") r=r.in("etat",["preavis","termine"]);
  // Ordre d'intervention : pas pour une mission annulée ou refusée, ni pour une mission sans devis (reprise du lot 42, C80 :
  // l'ordre ne commanderait rien) ; l'assembleur les refuse.
  if(id==="ordre_intervention") r=r.not("statut","in","(annulee,refusee)").not("devis_id","is",null);
  if(id==="prorata") r=r.eq("prorata",true);
  if(id==="rappel_assurance") r=r.eq("type","attestation_assurance").is("purged_at",null);
  if(["attestation_loyer","attestation_caf"].includes(id)) r=r.in("etat",["actif","preavis"]);
  if(id==="attestation_fin_bail") r=r.eq("etat","termine");
  if(id==="ecriture_rectificative") r=r.not("contre_ecriture_de","is",null);
  if(id==="recap_fiscal_nu" || id==="recap_fiscal_meuble") r=r.eq("meuble",id==="recap_fiscal_meuble");
  return r as unknown as T;
}
export async function chargerCiblesCatalogue(db:SupabaseClient,orgId:string,modele:EntreeCatalogue,page=0,bailId?:string):Promise<{choix:ChoixDossier[];suite:boolean}> {
  // Phase 3, lot 43 (T08) : le seul modèle de l'espace entier est le journal de clôture mensuelle. La liste proposait
  // « Organisation entière », mot de repli que le PDF n'imprime plus (C83) ; elle dit ce que le journal reprend.
  if (modele.cible==="organisation") return {choix:[{id:orgId,libelle:"Toutes les écritures de l’espace"}],suite:false};
  let q=db.from(TABLES_CATALOGUE[modele.cible]).select(colonnesCibles(modele,"*")).eq("organization_id",orgId);
  q=filtrerCibles(q,modele);
  if(bailId && ["bail","appel","quittance","depot","revision","edl","regularisation"].includes(modele.cible)) q=q.eq(modele.cible==="bail"?"id":"bail_id",bailId);
  const lus=await lireLignes(q.order("id").range(page*50,page*50+50));
  // C49 : la suite se juge sur la page lue ; les dossiers que l'assembleur refuserait en sont retirés ensuite (motifsDeRefus : la
  // page peut alors en montrer moins).
  const lue=lus.slice(0,50);
  const motifs=await motifsDeRefus(db,orgId,modele,lue);
  const rows=lue.filter(r=>!motifs.has(texte(r.id)));
  // Phase 3 (S46) : une intervention se présente avec le logement et le numéro de son incident (deux missions d'un même incident
  // ne se distinguaient que par leur référence).
  const incidentsIds=modele.cible==="intervention"?[...new Set(rows.map(r=>texte(r.incident_id)).filter(Boolean))]:[];
  const incidents=incidentsIds.length?await lireLignes(db.from("incidents").select("id,lot_id,numero,titre").eq("organization_id",orgId).in("id",incidentsIds)):[];
  const incidentsMap=new Map(incidents.map(i=>[i.id,i]));
  const bauxIds=[...new Set(rows.map(r=>modele.cible==="bail"?texte(r.id):texte(r.bail_id)).filter(Boolean))];
  const baux = bauxIds.length ? await lireLignes(db.from("baux").select("id,lot_id,locataire_principal").eq("organization_id",orgId).in("id",bauxIds)):[];
  const lotsIds=[...new Set([...rows.map(r=>modele.cible==="lot"?texte(r.id):texte(r.lot_id)),...baux.map(b=>texte(b.lot_id)),...incidents.map(i=>texte(i.lot_id))].filter(Boolean))];
  const personnesIds=[...new Set([...rows.map(r=>texte(r.person_id)),...baux.map(b=>texte(b.locataire_principal))].filter(Boolean))];
  const lots=lotsIds.length?await lireLignes(db.from("lots").select("id,nom").eq("organization_id",orgId).in("id",lotsIds)):[];
  const personnes=personnesIds.length?await lireLignes(db.from("persons").select("id,nom,prenom").eq("organization_id",orgId).in("id",personnesIds)):[];
  const lotsMap=new Map(lots.map(l=>[l.id,texte(l.nom)])),personnesMap=new Map(personnes.map(p=>[p.id,[p.nom,p.prenom].filter(Boolean).join(" ")])),bauxMap=new Map(baux.map(b=>[b.id,b]));
  return {suite:lus.length>50,choix:rows.map(r=>{
    const b=bauxMap.get(modele.cible==="bail"?r.id:r.bail_id);
    const incident=incidentsMap.get(r.incident_id);
    const dossier=b?[lotsMap.get(b.lot_id),personnesMap.get(b.locataire_principal)].filter(Boolean).join(" · ")
      :incident?[lotsMap.get(incident.lot_id)||texte(incident.titre),incident.numero?`Incident ${texte(incident.numero)}`:""].filter(Boolean).join(" · ")
      :lotsMap.get(r.lot_id)||personnesMap.get(r.person_id)||"";
    const date=texte(r.periode||r.mois||r.date_edl||r.date_echeance||r.date_emission||r.date_effet||r.date_piece||r.confiee_le);
    const etatBrut=texte(r.etat||r.statut);
    const etat = modele.cible === "rapport" ? (r.statut === "envoye" ? "Validé" : "À valider") : LIBELLES_ETAT[modele.cible]?.[etatBrut] ?? etatBrut;
    // S46 : deux régularisations émises le même jour se distinguent par leur exercice.
    const intitule=modele.cible==="regularisation"?`Exercice ${texte(r.annee)}`:modele.cible==="intervention"?(NATURES_TRAVAUX[texte(r.nature_travaux)]??texte(r.nature_travaux)):texte(r.nom||r.titre||r.libelle||(r.numero?`Incident ${r.numero}`:""));
    return {id:texte(r.id),bailId:b?texte(b.id):undefined,...(modele.cible==="regularisation"?{detailEnregistre:Boolean(texte(r.note).trim())}:{}),libelle:[dossier,intitule,date?formaterDateFr(date):r.annee,etat,`réf. ${texte(r.id).slice(0,8)}`].filter(Boolean).join(" · ")};
  })};
}
export async function verifierCibleCatalogue(db:SupabaseClient,orgId:string,modele:EntreeCatalogue,cibleId:string) {
  if (modele.cible==="organisation") {if(cibleId!==orgId) throw new RefusDocument("Organisation incorrecte.");return;}
  const rows=await lireLignes(filtrerCibles(db.from(TABLES_CATALOGUE[modele.cible]).select(colonnesCibles(modele,"id")).eq("organization_id",orgId).eq("id",cibleId),modele).limit(1));
  if(!rows.length) throw new RefusDocument("Ce dossier ne correspond pas au modèle choisi ou n’est plus accessible. Actualisez la sélection.");
  const motif=(await motifsDeRefus(db,orgId,modele,rows)).get(cibleId);
  if(motif) throw new RefusDocument(motif);
}
// Les dossiers lus que l'assembleur refuserait, avec son motif, quand la règle ne s'écrit pas en un filtre de la requête (une
// ligne liée à exclure, ou une condition sur le dossier OU sur sa table liée). Ils sont écartés de la page lue ; un identifiant
// forcé est refusé avec le motif de l'assembleur.
// - C49, avis d'échéance : un terme soldé porte sa quittance (la base la tient à jour à chaque encaissement : quittance au solde,
//   reçu sur un paiement partiel) ; un terme qui suit le mois de fin du bail n'est pas dû (etat_loyers_bail : « non_du »).
// - C40, accusé de réception : l'état des lieux de sortie signé fait la sortie (le bail reste en préavis jusqu'à la clôture).
// - S09, inventaires : un logement meublé, c'est-à-dire le lot coché « meublé » OU un bail de type meublé.
async function motifsDeRefus(db:SupabaseClient,orgId:string,modele:EntreeCatalogue,lignes:LigneDocument[]):Promise<Map<string,string>> {
  const motifs=new Map<string,string>();
  if(!lignes.length) return motifs;
  const ids=lignes.map(l=>texte(l.id));
  if(modele.id==="avis_echeance") {
    const bauxIds=[...new Set(lignes.map(l=>texte(l.bail_id)).filter(Boolean))];
    const [soldes,baux]=await Promise.all([
      lireLignes(db.from("quittances").select("appel_id").eq("organization_id",orgId).eq("est_quittance",true).in("appel_id",ids)),
      bauxIds.length?lireLignes(db.from("baux").select("id,date_fin").eq("organization_id",orgId).in("id",bauxIds)):Promise.resolve([] as LigneDocument[]),
    ]);
    for(const q of soldes) motifs.set(texte(q.appel_id),REFUS_TERME_SOLDE);
    const moisFin=new Map(baux.filter(b=>texte(b.date_fin)).map(b=>[texte(b.id),`${texte(b.date_fin).slice(0,7)}-01`]));
    for(const l of lignes) {
      const fin=moisFin.get(texte(l.bail_id));
      if(fin && texte(l.periode).slice(0,10)>fin) motifs.set(texte(l.id),REFUS_TERME_NON_DU);
    }
  }
  if(modele.id==="accuse_conge") {
    const sorties=await lireLignes(db.from("etats_des_lieux").select("bail_id").eq("organization_id",orgId).eq("type","sortie").eq("etat","signe").in("bail_id",ids));
    for(const e of sorties) motifs.set(texte(e.bail_id),REFUS_ACCUSE_APRES_SORTIE);
  }
  if(modele.id==="inventaire_entree" || modele.id==="inventaire_sortie") {
    for(const l of lignes) {
      const lot=l.lots as {meuble?:unknown}|null|undefined;
      if(l.type!=="meuble" && lot?.meuble!==true) motifs.set(texte(l.id),REFUS_INVENTAIRE_NON_MEUBLE);
    }
  }
  return motifs;
}
