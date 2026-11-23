import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntreeCatalogue } from "./catalogue";
import { lireLignes, texte, RefusDocument } from "./modeles/catalogue-bail";
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
export function filtrerCibles<T>(q:T, modele:EntreeCatalogue):T {
  // Les filtres sont appliqués avant la pagination, dans la requête SQL.
  type Filtre = {eq(k:string,v:unknown):Filtre;is(k:string,v:null):Filtre;not(k:string,op:string,v:null):Filtre;in(k:string,v:string[]):Filtre};
  let r=q as unknown as Filtre;
  const id=modele.id;
  if(id==="quittance" || id==="recu_partiel") r=r.eq("est_quittance",id==="quittance");
  if(id==="edl_entree" || id==="edl_sortie") r=r.eq("type",id==="edl_entree"?"entree":"sortie");
  if(id==="bail_individuel") r=r.not("chambre_id","is",null).eq("etat","brouillon");
  if(["bail_nu","bail_meuble","bail_colocation"].includes(id)) r=r.eq("type",id.slice(5)).is("chambre_id",null).eq("etat","brouillon");
  if(id==="avenant_remplacement") r=r.eq("type","colocation").is("chambre_id",null);
  if(id==="prorata") r=r.eq("prorata",true);
  if(id==="rappel_assurance") r=r.eq("type","attestation_assurance").is("purged_at",null);
  if(["attestation_loyer","attestation_caf"].includes(id)) r=r.in("etat",["actif","preavis"]);
  if(id==="attestation_fin_bail") r=r.eq("etat","termine");
  if(id==="ecriture_rectificative") r=r.not("contre_ecriture_de","is",null);
  if(id==="recap_fiscal_nu" || id==="recap_fiscal_meuble") r=r.eq("meuble",id==="recap_fiscal_meuble");
  return r as unknown as T;
}
export async function chargerCiblesCatalogue(db:SupabaseClient,orgId:string,modele:EntreeCatalogue,page=0,bailId?:string):Promise<{choix:ChoixDossier[];suite:boolean}> {
  if (modele.cible==="organisation") return {choix:[{id:orgId,libelle:"Organisation entière"}],suite:false};
  let q=db.from(TABLES_CATALOGUE[modele.cible]).select("*").eq("organization_id",orgId);
  q=filtrerCibles(q,modele);
  if(bailId && ["bail","appel","quittance","depot","revision","edl","regularisation"].includes(modele.cible)) q=q.eq(modele.cible==="bail"?"id":"bail_id",bailId);
  const rows=await lireLignes(q.order("id").range(page*50,page*50+50));
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
  return {suite:rows.length>50,choix:rows.slice(0,50).map(r=>{
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
  const rows=await lireLignes(filtrerCibles(db.from(TABLES_CATALOGUE[modele.cible]).select("id").eq("organization_id",orgId).eq("id",cibleId),modele).limit(1));
  if(!rows.length) throw new RefusDocument("Ce dossier ne correspond pas au modèle choisi ou n’est plus accessible. Actualisez la sélection.");
}
