import { beforeEach,describe,expect,it,vi } from "vitest";
import type { RecommandePrepare } from "@/lib/recommandes";
const m=vi.hoisted(()=>({user:true,configure:true,service:true,tables:{} as Record<string,unknown>,rpc:vi.fn(),suivi:vi.fn(),envoi:vi.fn(),lecture:vi.fn(),retrouver:vi.fn(),assembler:vi.fn(),revalider:vi.fn(),ordre:[] as string[]}));
vi.mock("next/cache",()=>({revalidatePath:m.revalider}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:()=>m.service?{rpc:m.suivi}:null}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:async()=>({user:m.user?{id:"owner"}:null,supabase:{rpc:m.rpc,from:(table:string)=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>q,then:(resolve:(v:unknown)=>void)=>Promise.resolve({data:m.tables[table]??null,error:null}).then(resolve)};return q;}}})}));
vi.mock("@/lib/documents/modeles",()=>({MODELES:{mise_en_demeure:{assembler:m.assembler}}}));
vi.mock("@/lib/ar24",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/ar24")>(),configurationAr24:()=>m.configure?{baseUrl:"https://sandbox.ar24.fr/api",token:"test",clePrivee:"test"}:null,envoyerRecommandeAr24:m.envoi,lireRecommandeAr24:m.lecture,retrouverRecommandeAr24:m.retrouver}));
import { preparerRecommande,confirmerEnvoiRecommande,actualiserRecommande } from "@/app/actions/recommandes";
import { empreinteCourrierAr24 } from "@/lib/ar24";
import { contenuLettreAr24 } from "@/lib/recommandes";
let courrier:RecommandePrepare;
function form(){const f=new FormData();f.set("confirme","oui");f.set("otp","123456");f.set("empreinte",courrier.empreinte);f.set("email",courrier.destinataire.email);f.set("tarif",String(courrier.tarif_ttc_centimes));return f;}
beforeEach(()=>{
 vi.clearAllMocks();m.user=true;m.configure=true;m.service=true;m.ordre=[];
 courrier={id:"commande",organization_id:"org",bail_id:"bail",personne_id:"personne",environnement:"sandbox",expediteur_id:42,tarif_ttc_centimes:100,destinataire:{email:"lea@example.test",prenom:"Léa",nom:"Test"},contenu:"<p>Courrier</p>",empreinte:"",dette:{total_centimes:80000,echeances:[]},delai:15,statut:"prepare",ar24_id:null,preuves:[],cree_le:"2026-10-28",actualise_le:"2026-10-28"};
 courrier.empreinte=empreinteCourrierAr24({reference:courrier.id,expediteurId:42,destinataire:courrier.destinataire,contenu:courrier.contenu,piecesJointes:[],tarifTtcCentimes:100});
 m.tables={recommandes_ar24:courrier,connexions_ar24:{expediteur_id:42,tarif_ttc_centimes:100,actif:true,environnement:"sandbox"},baux:{locataire_principal:"personne"},persons:courrier.destinataire,consentements_documents_locataire:{recommandes_electroniques:true,adresse_email:courrier.destinataire.email}};
 m.rpc.mockImplementation(async(nom:string)=>{m.ordre.push(nom);if(nom==="dette_recommande_ar24")return{data:courrier.dette,error:null};return {data:nom==="reserver_recommande_ar24"?{reserve:true,courrier}:courrier,error:null};});
 m.envoi.mockImplementation(async()=>{m.ordre.push("appel_ar24");return{id:123,reference:courrier.id,etat:"en_attente",preuves:[]};});
 m.suivi.mockImplementation(async(_nom:string,p:{p_statut:string})=>({data:{...courrier,statut:p.p_statut,ar24_id:123},error:null}));
 m.assembler.mockResolvedValue({document:{html:"<html><body><p>Courrier</p></body></html>",manquants:[]}});
});
describe("actions de recommandés AR24",()=>{
 it("ne transmet rien avant une réservation durable",async()=>{
  const r=await confirmerEnvoiRecommande("org","commande",form());expect(r.courrier?.statut).toBe("en_attente");expect(m.ordre).toEqual(["reserver_recommande_ar24","appel_ar24"]);expect(m.suivi).toHaveBeenCalledWith("enregistrer_suivi_ar24",expect.objectContaining({p_org:"org",p_id:"commande",p_ar24:123}));
 });
 it("un double clic ou un retour réseau ne réexpédie jamais",async()=>{
  m.rpc.mockResolvedValue({data:{reserve:false,courrier:{...courrier,statut:"en_cours"}},error:null});expect((await confirmerEnvoiRecommande("org","commande",form())).courrier?.statut).toBe("en_cours");expect(m.envoi).not.toHaveBeenCalled();
 });
 it("refuse configuration absente, permission absente et coût falsifié avant réservation",async()=>{
  m.configure=false;expect((await confirmerEnvoiRecommande("org","commande",form())).erreur).toContain("pas activé");m.configure=true;m.user=false;expect((await confirmerEnvoiRecommande("org","commande",form())).erreur).toContain("Accès refusé");m.user=true;const f=form();f.set("tarif","1");expect((await confirmerEnvoiRecommande("org","commande",f)).erreur).toContain("changé");expect(m.rpc).not.toHaveBeenCalled();expect(m.envoi).not.toHaveBeenCalled();
 });
 it.each(["", "1e2", "100.01", "0x64", "-100"])("refuse le coût non entier ou ambigu %j avant tout envoi",async(tarif)=>{
  const f=form();f.set("tarif",tarif);
  expect((await confirmerEnvoiRecommande("org","commande",f)).erreur).toContain("invalide");
  expect(m.rpc).not.toHaveBeenCalled();expect(m.envoi).not.toHaveBeenCalled();
 });
 it("l’échec du verrou ou de la revalidation stoppe l’effet externe",async()=>{
  m.rpc.mockResolvedValue({error:{message:"Le locataire a retiré son accord"},data:null});expect((await confirmerEnvoiRecommande("org","commande",form())).erreur).toContain("retiré");expect(m.envoi).not.toHaveBeenCalled();
 });
 it("conserve une réponse perdue en vérification, sans annoncer d’envoi",async()=>{
  m.envoi.mockRejectedValue(new Error("timeout"));const r=await confirmerEnvoiRecommande("org","commande",form());expect(r.erreur).toContain("n’a pas confirmé");expect(r.succes).toBeUndefined();expect(r.courrier?.statut).toBe("a_verifier");expect(m.envoi).toHaveBeenCalledTimes(1);
 });
 it("une sauvegarde échouée après réponse AR24 reste à vérifier",async()=>{
  m.suivi.mockResolvedValue({data:null,error:{message:"DB"}});const r=await confirmerEnvoiRecommande("org","commande",form());expect(r.erreur).toContain("Ne renvoyez pas");expect(r.succes).toBeUndefined();
 });
 it("un brouillon fournisseur n’est pas présenté comme envoyé",async()=>{
  m.envoi.mockResolvedValue({id:123,etat:"a_authentifier",preuves:[]});expect((await confirmerEnvoiRecommande("org","commande",form())).succes).toContain("pas encore envoyé");
 });
 it("retrouve une réponse perdue uniquement par lecture, jamais avec un nouvel envoi",async()=>{
  m.tables.recommandes_ar24={...courrier,statut:"a_verifier"};m.retrouver.mockResolvedValue({id:123,etat:"envoye",preuves:[]});expect((await actualiserRecommande("org","commande")).courrier?.statut).toBe("envoye");expect(m.retrouver).toHaveBeenCalledWith(expect.anything(),"commande",42,"lea@example.test");expect(m.envoi).not.toHaveBeenCalled();
  m.retrouver.mockResolvedValue(null);expect((await actualiserRecommande("org","commande")).erreur).toContain("ne retrouve pas");
 });
 it("prépare depuis les données connues, sans deviner l’accord ni les champs manquants",async()=>{
  m.tables.recommandes_ar24=[];m.tables.consentements_documents_locataire=null;expect((await preparerRecommande("org","bail",15)).erreur).toContain("accepter");expect(m.assembler).not.toHaveBeenCalled();
  m.tables.consentements_documents_locataire={recommandes_electroniques:true,adresse_email:"lea@example.test"};m.assembler.mockResolvedValue({document:{html:"<p>x</p>",manquants:["adresse du bailleur"]}});expect((await preparerRecommande("org","bail",15)).erreur).toContain("adresse du bailleur");expect(m.rpc.mock.calls.some(([n])=>n==="preparer_recommande_ar24")).toBe(false);
 });
 it("retire scripts, styles et ressources du courrier relu et transmis",()=>{
  expect(contenuLettreAr24('<html><head><style>x</style></head><body><script>alert(1)</script><p class="a" onclick="x">Bonjour &lt;Test&gt;</p><img src="https://test/secret"><table><tr><td>800 €</td></tr></table></body></html>')).toBe('<p>Bonjour &lt;Test&gt;</p><table><tr><td>800 €</td></tr></table>');
 });
 it("une reprise confirmée prépare une nouvelle lettre, sans envoyer ni réutiliser l’ancienne confirmation",async()=>{
  m.tables.recommandes_ar24=[{...courrier,id:"ancien",statut:"echec",echec_definitif_confirme_le:"2026-10-28"}];
  await preparerRecommande("org","bail",15,"ancien");
  expect(m.rpc).toHaveBeenCalledWith("preparer_recommande_ar24",expect.objectContaining({p_remplace:"ancien",p_id:expect.not.stringMatching(/^ancien$/)}));
  expect(m.envoi).not.toHaveBeenCalled();
 });
 it("une reprise déjà préparée peut être actualisée sous la même référence",async()=>{
  m.tables.recommandes_ar24=[{...courrier,remplace_id:"ancien"},{...courrier,id:"ancien",statut:"echec",echec_definitif_confirme_le:"2026-10-28"}];
  await preparerRecommande("org","bail",15,"ancien");
  expect(m.rpc).toHaveBeenCalledWith("preparer_recommande_ar24",expect.objectContaining({p_remplace:"ancien",p_id:"commande"}));
  expect(m.envoi).not.toHaveBeenCalled();
 });
 it("une demande de reprise sans attestation ne prépare ni ne transmet de courrier",async()=>{
  m.tables.recommandes_ar24=[{...courrier,id:"ancien",statut:"echec"}];
  await preparerRecommande("org","bail",15,"ancien");
  expect(m.rpc).not.toHaveBeenCalled();expect(m.envoi).not.toHaveBeenCalled();
 });
});
