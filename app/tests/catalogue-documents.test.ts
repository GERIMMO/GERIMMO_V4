import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte } from "./fixtures/contexte-document";
import { assemblerComplementBail, CODES_COMPLEMENTS_BAIL, lireLignes } from "@/lib/documents/modeles/catalogue-bail";
import { assemblerComplementGestion, CODES_COMPLEMENTS_GESTION } from "@/lib/documents/modeles/catalogue-gestion";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { MODELES } from "@/lib/documents/modeles";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { verifierCibleCatalogue, chargerCiblesCatalogue } from "@/lib/documents/catalogue-cibles";
import type { Assemblage } from "@/lib/documents/modeles";
vi.mock("@/lib/documents/modeles/communs",async importOriginal=>({...await importOriginal<object>(),chargerContexteBail:vi.fn()}));
type Row=Record<string,unknown>;
let ctx=contexte();
function fixture():Record<string,Row[]> {return {
  organizations:[{id:"org",...ctx.organisation,type:"agence"}], lots:[{id:"lot",nom:"Appartement Jardin",bien_id:"bien",meuble:false}],biens:[{id:"bien",address_line1:"12 rue du Parc",postal_code:"75012",city:"Paris"}],
  baux:[{id:"bail",lot_id:"lot",locataire_principal:"p",loyer_hc:650,charges:90}],persons:[{id:"p",nom:"Leblanc",prenom:"Julie"}],
  diagnostics:[{type:"DPE",date_realisation:"2025-01-01",date_expiration:"2035-01-01",diagnostiqueur:"Diagnostiqueur test",document_id:"doc"}],
  inventaire_lignes:[{piece:"Chambre",designation:"Lit double",quantite:1,etat:"bon",observation:"Conforme"}],
  pieces_demandees:[{libelle:"Identité",document_id:"doc",satisfaite_le:"2026-01-01"}],
  etat_loyers_bail:[{periode:"2025-01-01",date_echeance:"2025-01-05",montant_du:100.01,montant_couvert:0},{periode:"2099-01-01",date_echeance:"2099-01-05",montant_du:300,montant_couvert:0}],
  relances:[{date_envoi:"2025-02-01"}],conges:[{date_premiere_presentation:"2026-01-01",date_effet:"2026-04-01",preavis_mois:3,par:"locataire"}],
  restitutions:[{id:"restitution",statut:"finalise"}],retenues:[{libelle:"Mur",cout:100,duree_vie_ans:10,age_ans:5,montant_retenu:50,justificatif_document:"doc"}],
  regularisations_charges:[{id:"reg",bail_id:"bail",annee:2025,provisions:1000,charges_reelles:1200,ecart:200,note:"Eau : relevé individuel",justificatif_document:"doc",date_emission:"2026-01-01"}],
  etats_des_lieux:[{id:"edl",bail_id:"bail",type:"sortie",etat:"signe",date_edl:"2026-04-01"}],edl_cles:[{libelle:"Porte",nombre:2,reference:"A1"}],
  incidents:[{id:"incident",numero:42,lot_id:"lot",description:"Fuite du robinet",piece:"Cuisine",categorie:"plomberie",etat:"clos",clos_le:"2026-01-03",cloture_commentaire:"Réparé"}],
  incident_interventions:[{id:"intervention",incident_id:"incident",artisan_id:"artisan",nature_travaux:"Changer le robinet",statut:"terminee",confiee_le:"2026-01-01",debut_prevu:"2026-01-02",fin_prevue:"2026-01-02"}],
  artisans:[{id:"artisan",raison_sociale:"Atelier Plomberie",siret:"12345678901234",telephone:"0600000000"}],
  intervention_comptes_rendus:[{travaux_realises:"Robinet remplacé",cause_reelle:"Usure",montant_final_cents:12345,nouvelle_intervention_necessaire:false,created_at:"2026-01-03"}],
  incident_devis:[{artisan_id:"artisan",description:"Changer le robinet",montant_ttc_cents:12345,valide_jusqu_au:"2026-01-31",statut:"retenu"}],
  ecritures:[{id:"ecriture",lot_id:"lot",bail_id:"bail",contre_ecriture_de:"origine",categorie:"travaux",sens:"recette",montant:100,date_piece:"2026-01-01",date_imputation:"2026-01-01",libelle:"Annulation réparation",motif:"Doublon"}],clotures_comptables:[{mois:"2026-01-01",cloture_at:"2026-02-01"}],
  mandats:[{id:"mandat",person_id:"p",etat:"actif",preavis_mois:3}],mandat_lignes:[{lot_id:"lot",date_debut:"2025-01-01",date_fin:null,taux_honoraires:7}],
  rapports_gestion:[{id:"rapport",mandat_id:"mandat",mois:"2026-01-01",statut:"envoye",net:100,versement_montant:100,versement_date:"2026-02-01"}],
  mouvements_mandants:[{date_mouvement:"2026-01-01",type:"honoraires",sens:"debit",montant:70,tva:14}],
};}
function mockDb(tables=fixture(),failure?:string) {
  const calls:{table:string;ops:[string,...unknown[]][]}[]=[];
  const query=(table:string)=>{
    const call={table,ops:[] as [string,...unknown[]][]};calls.push(call);
    const q:Record<string,unknown>={then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:tables[table]??[],error:table===failure?{message:"indisponible"}:null}).then(resolve)};
    for(const op of ["select","eq","is","in","not","or","order","limit","range","gte","lt"]) q[op]=(...args:unknown[])=>{call.ops.push([op,...args]);return q;};
    return q;
  };
  return {db:{from:query,rpc:(nom:string,args:unknown)=>{const q=query(nom);calls[calls.length-1].ops.push(["rpc",args]);return q;}} as unknown as SupabaseClient,calls};
}
const options={annee:"2026",mois:"2026-01",delai:"15",mensualites:"3",premiere_echeance:"2026-01-31",date_effet:"2026-04-01",date_constat:"2026-04-01",conditions:"Accord signé",destinataire:"Organisme test",allocataire:"123456",sortant:"Sortant",entrant:"Entrant",depot:"Accord entre colocataires",constat:"Mobilier conforme",travaux:"Peinture",intervenant:"Entreprise",periode:"Octobre",prise_en_charge:"Bailleur",consultation:"Sur rendez-vous au bureau",acces:"Contact gestionnaire",visiteur:"Visiteur test",contact:"Email test",rendez_vous:"14 septembre 2026 à 10 h",representant:"Gestionnaire",motif:"Accord mutuel",remise:"Remise sous 30 jours",modifications:"Ajout du lot Jardin"};
function succes(r:Assemblage) {expect(r).not.toHaveProperty("erreur");if("erreur" in r) throw new Error(r.erreur);return r;}
beforeEach(()=>{ctx=contexte();ctx.bail.etat="actif";vi.mocked(chargerContexteBail).mockImplementation(async()=>ctx);});
describe("Catalogue — documents issus des dossiers",()=>{
  it.each(CODES_COMPLEMENTS_BAIL)("assemble %s avec sa source métier",async code=>{
    if(code.startsWith("inventaire")) ctx.lot.meuble=true;
    if(code==="inventaire_sortie") ctx.bail.etat="preavis";
    if(code==="attestation_fin_bail") ctx.bail.etat="termine";
    if(code==="avenant_remplacement") ctx.bail.type="colocation";
    const {db,calls}=mockDb();const r=succes(await assemblerComplementBail(code,db,"org","bail",options));
    expect(r.document.html).toContain(CATALOGUE_DOCUMENTS.find(m=>m.id===code)!.nom);
    expect(r.liens).toContainEqual({entite:"bail",entiteId:"bail"});
    for(const c of calls.filter(c=>c.table!=="etat_loyers_bail")) expect(c.ops).toContainEqual(["eq","organization_id","org"]);
    expect(r.document.html).not.toContain("NaN");
  });
  it.each(CODES_COMPLEMENTS_GESTION)("assemble %s sans données d’une autre organisation",async code=>{
    const data=fixture();if(code==="recap_fiscal_meuble") data.lots[0].meuble=true;
    const {db,calls}=mockDb(data);const r=succes(await assemblerComplementGestion(code,db,"org",code==="cloture_mensuelle"?"org":"cible",options));
    expect(r.document.html).toContain(CATALOGUE_DOCUMENTS.find(m=>m.id===code)!.nom);
    for(const c of calls.filter(c=>!["organizations","artisans","etat_loyers_bail"].includes(c.table))) expect(c.ops).toContainEqual(["eq","organization_id","org"]);
    for(const c of calls.filter(c=>c.table==="etat_loyers_bail")) expect(c.ops).toContainEqual(["rpc",{p_bail:"bail"}]);
    expect(r.document.html).not.toMatch(/NaN|Invalid Date|undefined/);
  });
  it("ne transforme pas une panne en bilan vide",async()=>{
    const {db}=mockDb(fixture(),"diagnostics");expect(await assemblerComplementBail("bordereau_ddt",db,"org","bail")).toHaveProperty("erreur");
    await expect(lireLignes(Promise.resolve({data:Array(1000).fill({}),error:null}))).rejects.toThrow("trop de lignes");
  });
  it("exclut les termes futurs de la dette et répartit les centimes sans perte",async()=>{
    const r=succes(await assemblerComplementBail("protocole_apurement",mockDb().db,"org","bail",options));
    expect(r.document.html).toContain("100,01");expect(r.document.html).toContain("33,33");expect(r.document.html.match(/33,34/g)).toHaveLength(2);
    expect(r.document.html).toContain("28/02/2026");expect(r.document.html).toContain("31/03/2026");expect(r.document.html).not.toContain("2099");
  });
  it("refuse une relance sans dette, une seconde sans première et un délai incorrect",async()=>{
    const t=fixture();t.etat_loyers_bail=[];
    expect(await assemblerComplementBail("relance_simple",mockDb(t).db,"org","bail")).toHaveProperty("erreur");
    t.etat_loyers_bail=fixture().etat_loyers_bail;t.relances=[];
    expect(await assemblerComplementBail("seconde_relance",mockDb(t).db,"org","bail")).toHaveProperty("erreur");
    expect(await assemblerComplementBail("mise_en_demeure",mockDb().db,"org","bail",{delai:"0"})).toHaveProperty("erreur");
  });
  it("refuse les documents qui attesteraient un état inexistant",async()=>{
    const {db}=mockDb();expect(await assemblerComplementBail("attestation_fin_bail",db,"org","bail")).toHaveProperty("erreur");
    ctx.bail.etat="termine";expect(await assemblerComplementBail("attestation_loyer",db,"org","bail")).toHaveProperty("erreur");
    ctx.bail.type="colocation";ctx.bail.chambre_id="chambre";expect(await assemblerComplementBail("avenant_remplacement",db,"org","bail")).toHaveProperty("erreur");
    const t=fixture();t.intervention_comptes_rendus=[];t.rapports_gestion[0].versement_date=null;
    expect(await assemblerComplementGestion("compte_rendu_intervention",mockDb(t).db,"org","intervention")).toHaveProperty("erreur");
    expect(await assemblerComplementGestion("bordereau_versement",mockDb(t).db,"org","rapport")).toHaveProperty("erreur");
  });
  it("échappe les saisies dans les documents",async()=>{
    const r=succes(await assemblerComplementBail("autorisation_travaux",mockDb().db,"org","bail",{...options,travaux:"<script>attaque</script>"}));expect(r.document.html).not.toContain("<script>");expect(r.document.html).toContain("&lt;script&gt;");
  });
  it("la préparation CAF n’usurpe pas le formulaire officiel",async()=>{
    const r=succes(await assemblerComplementBail("attestation_caf",mockDb().db,"org","bail",options));expect(r.document.html).toContain("ne vaut pas formulaire CAF/MSA homologué");
  });
  it("filtre les reçus, EDL et contrats individuels avant pagination et revérifie au clic",async()=>{
    for(const [id,filtre] of [["recu_partiel",["eq","est_quittance",false]],["edl_sortie",["eq","type","sortie"]],["bail_individuel",["not","chambre_id","is",null]]] as const){
      const {db,calls}=mockDb();const modele=CATALOGUE_DOCUMENTS.find(m=>m.id===id)!;
      await chargerCiblesCatalogue(db,"org",modele);expect(calls[0].ops).toContainEqual(filtre);
      calls.length=0;await verifierCibleCatalogue(db,"org",modele,"cible").catch(()=>{});expect(calls[0].ops).toContainEqual(filtre);expect(calls[0].ops).toContainEqual(["eq","id","cible"]);
    }
  });
  it("chaque modèle annoncé disponible possède un assembleur et les identifiants sont uniques",()=>{
    expect(new Set(CATALOGUE_DOCUMENTS.map(m=>m.id)).size).toBe(CATALOGUE_DOCUMENTS.length);
    for(const c of [...CODES_COMPLEMENTS_BAIL,...CODES_COMPLEMENTS_GESTION]) expect(MODELES[c].assembler).toBeTypeOf("function");
  });
});

// Épreuves locales de tous les nouveaux modèles : activées explicitement,
// sans écriture de test en production ni dépendance Chrome en CI.
it.skipIf(!process.env.GERIMMO_CATALOGUE_PDF_DIR || !process.env.GERIMMO_CHROME)("rend les épreuves du catalogue pour contrôle visuel",{timeout:120000},async()=>{
  const {mkdirSync,writeFileSync}=await import("node:fs");const {join}=await import("node:path");
  const {rendrePdf}=await import("@/lib/documents/rendu");const dir=process.env.GERIMMO_CATALOGUE_PDF_DIR!;mkdirSync(dir,{recursive:true});
  for(const code of CODES_COMPLEMENTS_BAIL){
    ctx=contexte();ctx.bail.etat="actif";
    if(code.startsWith("inventaire")) ctx.lot.meuble=true;
    if(code==="inventaire_sortie") ctx.bail.etat="preavis";
    if(code==="attestation_fin_bail") ctx.bail.etat="termine";
    if(code==="avenant_remplacement") ctx.bail.type="colocation";
    const r=succes(await assemblerComplementBail(code,mockDb().db,"org","bail",options));
    const pdf=await rendrePdf(r.document);expect(pdf.length).toBeGreaterThan(10000);writeFileSync(join(dir,`${code}.pdf`),pdf);
  }
  for(const code of CODES_COMPLEMENTS_GESTION){
    const t=fixture();if(code==="recap_fiscal_meuble") t.lots[0].meuble=true;
    const r=succes(await assemblerComplementGestion(code,mockDb(t).db,"org",code==="cloture_mensuelle"?"org":"cible",options));
    const pdf=await rendrePdf(r.document);expect(pdf.length).toBeGreaterThan(10000);writeFileSync(join(dir,`${code}.pdf`),pdf);
  }
});
