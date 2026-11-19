import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceDashboard } from "@/app/admin/finances";
import { presentationAbonnement, ResumeAbonnementClient } from "@/app/admin/presentation-abonnement";
import type { FinancialAccount } from "@/lib/finances-supervision";

const m = vi.hoisted(() => ({ sa: true, trace: true, panne: false, from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc:m.rpc, from:m.from }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw Error("Accès refusé"); }, notFound: () => { throw Error("Introuvable"); } }));
vi.mock("@/app/actions/controle-supervision", () => ({ controlerOrganisation:vi.fn(), reprendreConfirmationClient:vi.fn(), renvoyerInvitation:vi.fn() }));
vi.mock("@/components/geste-controle", () => ({ GesteControle: ({titre,bouton}:{titre:string;bouton:string}) => createElement("div",null,titre,createElement("button",null,bouton)) }));
vi.mock("@/app/admin/organisations/[orgId]/factures-abonnement", () => ({ FacturesAbonnement: () => createElement("p",null,"Factures fictives"), ProcedureFacturation: () => createElement("p",null,"Procédure conservée") }));
import Page from "@/app/admin/organisations/[orgId]/page";
const initial:FinancialAccount={id:"org",name:"Camille Martin",type:"proprietaire_direct",status:"active",essai_fin:null,created_at:"2026-01-01",grille_tarifaire:"2026-09-28",stripe_statut:"active",periodicite:"mensuel",formule:"gerimmo",montant_periode_cents:599,periode_fin:"2026-12-01",periodicite_suivante:null,unites_a_couvrir:1,unites_souscrites:1,annulation_demandee:false,paiement_en_defaut_depuis:null,derniere_synchro:null,a_resynchroniser:false,synchro_en_erreur:false,premiere_facture_payee:true,avantages_en_attente:0};
let compte:FinancialAccount;
beforeEach(()=>{m.sa=true;m.trace=true;m.panne=false;compte={...initial};m.from.mockReset();m.rpc.mockReset();m.rpc.mockImplementation(async(n:string)=>({data:n==="is_super_admin"?m.sa:n==="supervision_abonnement"?[{...compte,public_tarif:compte.type,grille:compte.grille_tarifaire}]:null,error:n==="log_sa_access"&&!m.trace||n==="supervision_abonnement"&&m.panne?{message:"panne"}:null}));m.from.mockImplementation((n:string)=>{const q:Record<string,unknown>={};for(const k of ['select','eq','neq','or'])q[k]=()=>q;const rep=()=>({data:n==="organizations"?compte:[],count:0,error:null});q.maybeSingle=async()=>rep();q.then=(ok:(x:unknown)=>unknown)=>Promise.resolve(rep()).then(ok);return q;});});
const liste=()=>renderToStaticMarkup(createElement(FinanceDashboard,{accounts:[compte],today:"2026-11-18",unavailable:false,partial:false,budget:null}));
const fiche=async()=>renderToStaticMarkup(await Page({params:Promise.resolve({orgId:"org"}),searchParams:Promise.resolve({})} as never));

describe("UX 12A — présentation commerciale sans invention",()=>{
 it.each([
  ["essai",{status:"essai",stripe_statut:null,montant_periode_cents:null,formule:null,essai_fin:"2026-12-01",periode_fin:null},"Essai gratuit"],
  ["actif",{},"Abonnement actif"],
  ["attente",{stripe_statut:"incomplete"},"Paiement en attente"],
  ["impayé",{stripe_statut:"unpaid",paiement_en_defaut_depuis:"2026-11-01"},"Impayé"],
  ["résilié",{stripe_statut:"canceled"},"Abonnement résilié"],
 ] as const)("%s : liste et fiche concordent",async(_,patch,label)=>{
   compte={...compte,...patch};const l=liste(),f=await fiche();
   expect(l).toContain(label);expect(f).toContain(label);
   expect(l).toContain('href="/admin/organisations/org"');
   expect(f.indexOf('id="abonnement-client-titre"')).toBeLessThan(f.indexOf('Identité de l’organisation'));
   expect(l).not.toContain("Aucune synchronisation reçue");expect(l).not.toContain("Aucun montant facturé connu");
   if(compte.stripe_statut){expect(l).toContain("5,99");expect(f).toContain("5,99");expect(f).toContain('/admin/organisations/org?factures=1#historique-factures');}
   else {expect(f).toContain("Sans carte bancaire ni conversion automatique");expect(f).not.toContain("Factures et historique");}
 });
 it("ne confond pas accès actif et contrat payé",()=>{compte.stripe_statut=null;compte.montant_periode_cents=null;expect(presentationAbonnement(compte,"2026-11-18").statut).toBe("Sans souscription payante");});
 it("l'essai expiré reste expiré, sans prolongation inventée",()=>{Object.assign(compte,{status:"essai",stripe_statut:null,essai_fin:"2026-11-01"});expect(presentationAbonnement(compte,"2026-11-18").statut).toBe("Essai terminé");});
 it("montant absent, zéro réel et annuel restent distincts",()=>{compte.montant_periode_cents=null;expect(presentationAbonnement(compte,"2026-11-18").montant).toBeNull();compte.montant_periode_cents=0;expect(presentationAbonnement(compte,"2026-11-18").montant).toMatch(/^0,00/);compte.montant_periode_cents=5990;compte.periodicite="annuel";expect(presentationAbonnement(compte,"2026-11-18")).toMatchObject({montant:expect.stringContaining("59,90"),periode:"/ an"});});
 it("résiliation programmée et effective n'annoncent pas un prochain renouvellement",()=>{compte.annulation_demandee=true;expect(presentationAbonnement(compte,"2026-11-18").dateLibelle).toBe("Fin prévue");compte.stripe_statut="canceled";expect(presentationAbonnement(compte,"2026-11-18")).toMatchObject({dateLibelle:"Dernière période",finProgrammee:false});});
 it("un seul filtre commercial, tous les choix et détails conservés",()=>{const l=liste();expect(l.match(/<select/g)??[]).toHaveLength(2);expect(l).toContain("Situation commerciale");expect(l).toContain("Synchronisation à vérifier");expect(l).toContain("Détails du client");expect(l).toContain("Accès à l’espace");expect(l).toContain("Revenus, répartition et prochaines échéances");});
 it("les données indisponibles ne deviennent pas un essai ou une gratuité",()=>{const h=renderToStaticMarkup(createElement(ResumeAbonnementClient,{situation:compte,erreur:true,taxe:null}));expect(h).toContain("Abonnement indisponible");expect(h).not.toContain("Abonnement actif");expect(h).not.toContain("5,99");});
 it("conserve actions, factures, preuves et journalisation",async()=>{const h=await fiche();for(const libelle of ["Détails de l’abonnement","Historique de facturation","Vérifier et reprendre","Suspendre","Archiver","Entrer dans son espace","Comptes rattachés"])expect(h).toContain(libelle);expect(m.rpc).toHaveBeenCalledWith("log_sa_access",{org:"org",sa_action:"consultation_organisation"});});
 it("refuse l'accès sans super-administration avant toute lecture",async()=>{m.sa=false;await expect(fiche()).rejects.toThrow("Accès refusé");expect(m.from).not.toHaveBeenCalled();});
 it("refuse de lire le dossier si la journalisation échoue",async()=>{m.trace=false;expect(await fiche()).toContain("Journal des consultations");expect(m.from).not.toHaveBeenCalled();});
 it("la panne d'abonnement reste visible dès la synthèse",async()=>{m.panne=true;expect(await fiche()).toContain('role="alert">Abonnement indisponible');});
});
