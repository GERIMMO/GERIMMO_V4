import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), from: vi.fn(), envoyer: vi.fn(), revalider: vi.fn(), trace: vi.fn(), tables:{} as Record<string,unknown>, erreurs:{} as Record<string,unknown>, filtres: [] as unknown[][], ouverte:true, ligne:null as unknown }));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("@/lib/email",()=>({envoyerEmail:m.envoyer}));
vi.mock("@/lib/site",()=>({adresseDuSite:()=>"http://localhost:3568"}));
vi.mock("next/cache",()=>({revalidatePath:m.revalider}));
import { envoyerRelanceReception } from "@/app/actions/reception-loyer";
import { aujourdhuiParis } from "@/lib/ged";

const f=()=>{const form=new FormData();form.set("confirmer","oui");form.set("reste_attendu","600");return form;};
beforeEach(()=>{
  vi.clearAllMocks();m.ouverte=true;m.erreurs={};m.filtres=[];
  m.ligne={appel_id:"appel",bail_id:"bail",lot_nom:"TEST Appartement",periode:"2026-01-01",date_echeance:"2026-01-05",montant_du:800,montant_couvert:200};
  m.tables={relances:null,baux:{locataire_principal:"locataire"},persons:{email:"locataire@example.invalid",prenom:"Camille"},bail_personnes:[],colocataires:[],organizations:{name:"Claire"}};
  m.rpc.mockImplementation((nom:string)=>{
    if(nom==="etat_abonnement")return Promise.resolve({data:[{ecriture_ouverte:m.ouverte}],error:null});
    const q={eq:vi.fn(),maybeSingle:async()=>({data:m.ligne,error:null})};q.eq.mockReturnValue(q);return q;
  });
  m.from.mockImplementation((table:string)=>{
    const q={select:vi.fn(),eq:vi.fn(),gte:vi.fn(),in:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:async()=>({data:m.tables[table],error:m.erreurs[table]??null}),upsert:m.trace,
      then:(resolve:(value:{data:unknown;error:unknown})=>unknown)=>Promise.resolve({data:m.tables[table==="persons"?"colocataires":table],error:m.erreurs[table]??null}).then(resolve)};
    for(const nom of ["select","eq","gte","in","order","limit"] as const)q[nom].mockImplementation((...args:unknown[])=>{m.filtres.push([table,nom,...args]);return q;});return q;
  });
  m.acces.mockResolvedValue({user:{id:"moi"},role:"proprietaire_direct",supabase:{rpc:m.rpc,from:m.from}});
  m.envoyer.mockResolvedValue({});m.trace.mockResolvedValue({error:null});
});
it("demande une confirmation avant de contacter le locataire",async()=>{
  expect((await envoyerRelanceReception("org","appel",{},new FormData())).erreur).toContain("Confirmez");expect(m.envoyer).not.toHaveBeenCalled();
});
it("aucun envoi pour un rôle non autorisé ou un abonnement fermé",async()=>{
  m.acces.mockResolvedValueOnce({user:{id:"agent"},role:"agent"});expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toBeTruthy();
  m.ouverte=false;expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("abonnement");expect(m.envoyer).not.toHaveBeenCalled();
});
it("n'envoie pas de courrier pour une échéance soldée ou à venir",async()=>{
  m.ligne=null;expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("plus en attente");
  m.ligne={date_echeance:"2099-01-01"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("plus en attente");expect(m.envoyer).not.toHaveBeenCalled();
});
it.each(["relance_1","relance_2","mise_en_demeure"])("ne recommence pas la procédure après une %s déjà consignée",async(niveau)=>{
  m.tables.relances={niveau,date_envoi:"2026-01-08"};expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("déjà été enregistrée");expect(m.envoyer).not.toHaveBeenCalled();
  expect(m.filtres).toContainEqual(["relances","eq","organization_id","org"]);
  expect(m.filtres).toContainEqual(["relances","eq","bail_id","bail"]);
  expect(m.filtres).toContainEqual(["relances","gte","date_envoi","2026-01-05"]);
});
it("attend le lendemain de l'échéance pour relancer",async()=>{
  m.ligne={date_echeance:aujourdhuiParis()};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("dès demain");expect(m.envoyer).not.toHaveBeenCalled();
});
it("fait reconfirmer un montant modifié depuis la lecture",async()=>{
  const form=f();form.set("reste_attendu","800");expect((await envoyerRelanceReception("org","appel",{},form)).erreur).toContain("a changé");expect(m.envoyer).not.toHaveBeenCalled();
});
it("n'envoie rien si l'historique des relances ne peut pas être lu",async()=>{
  m.erreurs.relances={message:"indisponible"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("Impossible de vérifier les relances");expect(m.envoyer).not.toHaveBeenCalled();
});
it("un e-mail indisponible n'est pas enregistré comme envoyé",async()=>{
  m.envoyer.mockResolvedValue({erreur:"L’envoi des e-mails n’est pas configuré."});
  expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("pas configuré");expect(m.trace).not.toHaveBeenCalled();
});
it("envoie le reste réel puis conserve une seule trace et actualise le bail",async()=>{
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("enregistrée");
  expect(m.envoyer).toHaveBeenCalledWith(expect.objectContaining({to:"locataire@example.invalid",cleIdempotence:expect.stringContaining("relance/bail/relance_1/"),html:expect.stringContaining("600,00")}));
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({bail_id:"bail",niveau:"relance_1"}),{onConflict:"id",ignoreDuplicates:true});
  expect(m.revalider).toHaveBeenCalledWith("/espace/org/baux/bail");
});
it("signale un e-mail accepté dont la trace a échoué",async()=>{
  m.trace.mockResolvedValue({error:{message:"refus"}});expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("trace au bail n’a pas pu être confirmée");
});
it("relance aussi les colocataires engagés et dédoublonne les adresses",async()=>{
  m.tables.bail_personnes=[{person_id:"locataire",date_solidarite_fin:null},{person_id:"coloc",date_solidarite_fin:null},{person_id:"ancien",date_solidarite_fin:"2020-01-01"}];
  m.tables.colocataires=[{email:" LOCATAIRE@example.invalid "},{email:"coloc@example.invalid"},{email:"COLOC@example.invalid"},{email:null}];
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("colocataires concernés");
  expect(m.envoyer.mock.calls.map(a=>a[0].to)).toEqual(["locataire@example.invalid","coloc@example.invalid"]);
  expect(m.filtres).toContainEqual(["persons","in","id",["coloc"]]);
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({note:expect.stringContaining("2 destinataires")}),expect.anything());
});
it("un refus partiel ne clôt pas la relance et la reprise garde les clés des destinataires déjà servis",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockResolvedValueOnce({}).mockResolvedValueOnce({erreur:"Refus temporaire."});
  expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("envoyée à 1 destinataire");expect(m.trace).not.toHaveBeenCalled();
  const clePrincipale=m.envoyer.mock.calls[0][0].cleIdempotence,cleColocataire=m.envoyer.mock.calls[1][0].cleIdempotence;
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("enregistrée");
  expect(m.envoyer.mock.calls[2][0].cleIdempotence).toBe(clePrincipale);expect(m.envoyer.mock.calls[3][0].cleIdempotence).toBe(cleColocataire);expect(cleColocataire).not.toBe(clePrincipale);
});
it("ne commence aucun envoi quand les colocataires ne peuvent pas être vérifiés",async()=>{
  m.erreurs.bail_personnes={message:"lecture impossible"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("colocataires");expect(m.envoyer).not.toHaveBeenCalled();
});
it("ne trace pas un envoi quand l'adresse principale est vide",async()=>{
  m.tables.persons={email:"  ",prenom:"Camille"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("adresse e-mail");expect(m.envoyer).not.toHaveBeenCalled();expect(m.trace).not.toHaveBeenCalled();
});
