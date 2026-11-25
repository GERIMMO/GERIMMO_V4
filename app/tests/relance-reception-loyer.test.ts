import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), from: vi.fn(), envoyer: vi.fn(), revalider: vi.fn(), trace: vi.fn(), tables:{} as Record<string,unknown>, erreurs:{} as Record<string,unknown>, filtres: [] as unknown[][], ouverte:true, ligne:null as unknown, lignesBail:null as unknown[]|null }));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("@/lib/email",()=>({envoyerEmail:m.envoyer}));
vi.mock("@/lib/site",()=>({adresseDuSite:()=>"http://localhost:3568"}));
vi.mock("next/cache",()=>({revalidatePath:m.revalider}));
import { envoyerRelanceReception } from "@/app/actions/reception-loyer";
import { aujourdhuiParis, eur } from "@/lib/ged";

const f=()=>{const form=new FormData();form.set("confirmer","oui");form.set("reste_attendu","600");return form;};
beforeEach(()=>{
  vi.clearAllMocks();m.ouverte=true;m.erreurs={};m.filtres=[];m.lignesBail=null;
  m.ligne={appel_id:"appel",bail_id:"bail",lot_nom:"TEST Appartement",periode:"2026-01-01",date_echeance:"2026-01-05",montant_du:800,montant_couvert:200};
  m.tables={relances:[],baux:{locataire_principal:"locataire"},persons:{email:"locataire@example.invalid",prenom:"Camille"},bail_personnes:[],colocataires:[],organizations:{name:"Claire",relance_1_jours:5,relance_2_jours:15}};
  m.rpc.mockImplementation((nom:string)=>{
    if(nom==="etat_abonnement")return Promise.resolve({data:[{ecriture_ouverte:m.ouverte}],error:null});
    // Lecture de la ligne relancée (maybeSingle), puis de toutes les lignes du bail pour la dette totale.
    const q={eq:vi.fn(),maybeSingle:async()=>({data:m.ligne,error:null}),
      then:(resolve:(value:{data:unknown;error:unknown})=>unknown)=>Promise.resolve({data:m.lignesBail??(m.ligne?[m.ligne]:[]),error:m.erreurs.dette??null}).then(resolve)};
    q.eq.mockImplementation((...args:unknown[])=>{m.filtres.push(["rappels",...args]);return q;});return q;
  });
  m.from.mockImplementation((table:string)=>{
    let niveau="";
    const q={range:async()=>({data:[],error:null}),select:vi.fn(),eq:vi.fn(),gte:vi.fn(),or:vi.fn(),in:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:async()=>({data:table==="relances"?(m.tables.relances as {niveau:string}[]).find(r=>r.niveau===niveau)??null:m.tables[table],error:m.erreurs[table]??null}),upsert:m.trace,
      then:(resolve:(value:{data:unknown;error:unknown})=>unknown)=>Promise.resolve({data:m.tables[table==="persons"?"colocataires":table],error:m.erreurs[table]??null}).then(resolve)};
    for(const nom of ["select","eq","gte","or","in","order","limit"] as const)q[nom].mockImplementation((...args:unknown[])=>{m.filtres.push([table,nom,...args]);if(nom==="eq" && args[0]==="niveau")niveau=String(args[1]);return q;});return q;
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
  m.tables.relances=[{niveau,date_envoi:"2026-01-08"}];expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toBeTruthy();expect(m.envoyer).not.toHaveBeenCalled();
  expect(m.filtres).toContainEqual(["relances","eq","organization_id","org"]);
  expect(m.filtres).toContainEqual(["relances","eq","bail_id","bail"]);
  expect(m.filtres).toContainEqual(["relances","gte","date_envoi","2026-01-05"]);
});
it("envoie la deuxième relance seulement après la première, avec sa propre trace",async()=>{
  const form=f();form.set("niveau","relance_2");
  expect((await envoyerRelanceReception("org","appel",{},form)).erreur).toMatch(/première relance/);
  expect(m.envoyer).not.toHaveBeenCalled();
  m.tables.relances=[{niveau:"relance_1",date_envoi:"2026-01-10"}];
  expect((await envoyerRelanceReception("org","appel",{},form)).succes).toContain("enregistrée");
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({niveau:"relance_2"}),expect.anything());
  m.tables.relances=[{niveau:"relance_1",date_envoi:"2026-01-10"},{niveau:"relance_2",date_envoi:"2026-01-25"}];
  expect((await envoyerRelanceReception("org","appel",{},form)).erreur).toBeTruthy();expect(m.envoyer).toHaveBeenCalledTimes(1);
});
it("attend le lendemain de l'échéance pour relancer",async()=>{
  m.ligne={date_echeance:aujourdhuiParis()};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("dès demain");expect(m.envoyer).not.toHaveBeenCalled();
});
it("fait reconfirmer un montant modifié depuis la lecture",async()=>{
  const form=f();form.set("reste_attendu","800");expect((await envoyerRelanceReception("org","appel",{},form)).erreur).toContain("a changé");expect(m.envoyer).not.toHaveBeenCalled();
});
it("n'envoie rien si l'historique des relances ne peut pas être lu",async()=>{
  m.erreurs.relances={message:"indisponible"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("Impossible de vérifier le suivi");expect(m.envoyer).not.toHaveBeenCalled();
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
// Relecture de la fusion du 25/11/2026 (E-02) : ce test affirmait qu'un refus partiel ne consignait RIEN (« la relance
// n'est pas marquée complète ») et qu'un second clic renvoyait aux deux destinataires avec les mêmes clés. C'était le
// défaut : la relance partie au locataire n'apparaissait pas au suivi, et une clé différente (nouveau montant) la lui
// renvoyait. Il dit désormais la règle : un destinataire servi suffit pour consigner, la note dit l'envoi à terminer,
// et chaque destinataire a sa propre clé.
// Reprise de cette relecture (Y-01) : le message ne reprend plus le texte du service d'envoi (ici « Refus temporaire. »),
// qui invite souvent à réessayer alors que ce palier ne repart plus depuis Gerimmo ; il dit que l'envoi n'est pas parti.
it("un refus partiel consigne la relance partie, avec l'envoi à terminer ; chaque destinataire a sa propre clé",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockResolvedValueOnce({}).mockResolvedValueOnce({erreur:"Refus temporaire."});
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.succes).toContain("Relance envoyée à 1 destinataire et enregistrée dans le suivi du bail. 1 envoi n’a pas abouti (coloc@example.invalid) : il n’est pas parti.");
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({niveau:"relance_1",note:expect.stringContaining("· 1 destinataire · 1 envoi à terminer (non parti)")}),{onConflict:"id",ignoreDuplicates:true});
  const clePrincipale=m.envoyer.mock.calls[0][0].cleIdempotence,cleColocataire=m.envoyer.mock.calls[1][0].cleIdempotence;
  expect(cleColocataire).not.toBe(clePrincipale);
});
it("ne commence aucun envoi quand les colocataires ne peuvent pas être vérifiés",async()=>{
  m.erreurs.bail_personnes={message:"lecture impossible"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("colocataires");expect(m.envoyer).not.toHaveBeenCalled();
});
it("ne trace pas un envoi quand l'adresse principale est vide",async()=>{
  m.tables.persons={email:"  ",prenom:"Camille"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("adresse e-mail");expect(m.envoyer).not.toHaveBeenCalled();expect(m.trace).not.toHaveBeenCalled();
});
it("dit la dette échue totale du bail quand plusieurs termes restent dus (audit du 27/10, NEW-01)",async()=>{
  m.lignesBail=[m.ligne,{...(m.ligne as object),appel_id:"suivant",periode:"2026-02-01",date_echeance:"2026-02-05",montant_couvert:0}];
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("enregistrée");
  expect(m.filtres).toContainEqual(["rappels","bail_id","bail"]);
  const envoi=m.envoyer.mock.calls[0][0];
  expect(envoi.html).toContain("600,00");expect(envoi.html).toContain("Au total");expect(envoi.html).toContain(eur(1400));
  expect(envoi.cleIdempotence).toContain("/60000/140000/");
});
it("n'envoie rien si la dette totale du bail ne peut pas être lue",async()=>{
  m.erreurs.dette={message:"indisponible"};expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("dette totale");expect(m.envoyer).not.toHaveBeenCalled();
});

// Décision du dirigeant du 24/11/2026 (Q24, lot D4) : « ouvre aussi la relance à la main ». La relance envoyée d'un clic
// suit l'interrupteur « relance de loyer » du superviseur (fermé par défaut), sans l'accord permanent de l'espace.
const interrupteurRelance=(reponse:unknown)=>{const base=m.rpc.getMockImplementation()!;
  m.rpc.mockImplementation((nom:string,...reste:unknown[])=>nom==="envois_automatiques_proposes"?Promise.resolve(reponse):(base as (...a:unknown[])=>unknown)(nom,...reste));};
const CINQ={avis_echeance:false,relance_loyer:true,rappel_rendez_vous:false,relance_invitation:false,relance_report_rdv:false};
it("Q24 — interrupteur ouvert : l'envoi porte le contexte que la base revérifie (appel, niveau, montants, personne qui clique)",async()=>{
  interrupteurRelance({data:CINQ,error:null});
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("enregistrée");
  const envoi=m.envoyer.mock.calls[0][0];
  expect(envoi.contexteMetier).toEqual({type:"relance_loyer_manuelle",id:"appel",niveau:"relance_1",reste:"600",total:"600",acteur:"moi"});
  // Avec un contexte, l'e-mail suit le circuit conservé et prouvé : il ne porte plus « sans reprise ».
  expect(envoi).not.toHaveProperty("repriseAutonome");
  expect(envoi).toMatchObject({to:"locataire@example.invalid",circuit:"app/actions/reception-loyer",organisation:{id:"org"}});
});
it("Q24 — l'accord permanent de l'espace n'est pas exigé : un espace qui ne l'a pas donné envoie quand même sa relance à la main",async()=>{
  interrupteurRelance({data:CINQ,error:null});
  m.tables.organizations={name:"Claire",relance_1_jours:5,relance_2_jours:15,relances_envoi_auto:false};
  expect((await envoyerRelanceReception("org","appel",{},f())).succes).toContain("enregistrée");
  expect(m.envoyer).toHaveBeenCalledTimes(1);
  expect(m.envoyer.mock.calls[0][0].contexteMetier.type).toBe("relance_loyer_manuelle");
});
it.each([
  ["fermé",{data:{...CINQ,relance_loyer:false},error:null}],
  ["illisible",{data:CINQ,error:{message:"refus"}}],
  ["incomplet (migration non appliquée : quatre réponses)",{data:{avis_echeance:true,relance_loyer:true,rappel_rendez_vous:true,relance_invitation:true},error:null}],
])("Q24 — interrupteur %s : aucun contexte, l'envoi reste suspendu comme avant",async(_libelle,reponse)=>{
  interrupteurRelance(reponse);
  m.envoyer.mockResolvedValue({erreur:"Envoi suspendu dans le périmètre validé : intervention humaine requise.",interventionRequise:true});
  expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toContain("Envoi suspendu");
  const envoi=m.envoyer.mock.calls[0][0];
  expect(envoi).not.toHaveProperty("contexteMetier");
  expect(envoi.repriseAutonome).toBe(false);
  expect(m.trace).not.toHaveBeenCalled();
});
// Relecture de la fusion du 25/11/2026 (E-02) : en colocation, une adresse refusée pour de bon par le service d'envoi
// (état « echec », jamais repris) faisait sortir l'action AVANT la trace, même quand le locataire avait reçu la relance :
// rien n'était consigné dans `relances`, chaque clic répondait « envoi à terminer », la deuxième relance restait bloquée,
// et après un paiement partiel (autre montant, donc autre clé d'envoi) le locataire recevait une seconde « première
// relance » pour la même échéance. Désormais, dès qu'un destinataire a accepté l'envoi, la trace est écrite avec une
// note qui dit qu'un envoi reste à terminer ; le même palier n'est plus envoyé à personne.
it("E-02 — colocation, échec définitif d'un colocataire : la relance partie au locataire est consignée, la note dit l'envoi à terminer ; aucun second envoi au même palier, même après un paiement partiel",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockImplementation(async (p:{to:string})=>p.to.startsWith("coloc")?{erreur:"Le service d’e-mail a refusé l’envoi. Vérifiez l’adresse du destinataire puis réessayez."}:{});
  // La base garde la trace écrite : le suivi la relit au clic suivant.
  m.trace.mockImplementation(async (ligne:{niveau:string;date_envoi:string})=>{(m.tables.relances as unknown[]).push({niveau:ligne.niveau,date_envoi:ligne.date_envoi});return {error:null};});
  const r1=await envoyerRelanceReception("org","appel",{},f());
  expect(r1.erreur).toBeUndefined();
  expect(r1.succes).toContain("enregistrée dans le suivi du bail");
  expect(r1.succes).toContain("1 envoi n’a pas abouti");
  expect(r1.succes).toContain("coloc@example.invalid");
  expect(m.trace).toHaveBeenCalledTimes(1);
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({bail_id:"bail",niveau:"relance_1",note:expect.stringMatching(/1 destinataire · 1 envoi à terminer/)}),{onConflict:"id",ignoreDuplicates:true});
  const envoisApres1=m.envoyer.mock.calls.length;
  // Nouveau clic, même montant : refusé, rien ne repart.
  expect((await envoyerRelanceReception("org","appel",{},f())).erreur).toBeTruthy();
  // Paiement partiel (reste 500) : refusé aussi, aucune seconde « première relance » au locataire.
  m.ligne={...(m.ligne as object),montant_couvert:300};const f2=f();f2.set("reste_attendu","500");
  expect((await envoyerRelanceReception("org","appel",{},f2)).erreur).toBeTruthy();
  expect(m.envoyer.mock.calls.length).toBe(envoisApres1);
  expect(new Set(m.envoyer.mock.calls.filter(c=>c[0].to==="locataire@example.invalid").map(c=>c[0].cleIdempotence)).size).toBe(1);
  expect(m.trace).toHaveBeenCalledTimes(1);
});
it("E-02 — aucun destinataire accepté : rien n'est consigné, l'erreur le dit",async()=>{
  m.envoyer.mockResolvedValue({erreur:"Le service d’e-mail a refusé l’envoi. Vérifiez l’adresse du destinataire puis réessayez."});
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.erreur).toContain("Le service d’e-mail a refusé l’envoi");expect(m.trace).not.toHaveBeenCalled();
});

// Reprise de la relecture de la fusion (Y-01, 25/11/2026). La correction E-02 rangeait toute réponse en erreur parmi les
// envois « non partis », sans lire les deux marques du service d'envoi : `incertain` (délai dépassé, connexion coupée,
// réponse 5xx ou 409, résultat non enregistré : l'e-mail a peut-être été remis) et `recuperable` (refus momentané, 429).
// Locataire seul et envoi incertain : le message disait « La relance n'est pas partie et n'est pas enregistrée » à côté de
// « a peut-être eu lieu », rien n'était consigné, et un paiement partiel (autre montant, autre clé) renvoyait une première
// relance. En colocation, la note écrite disait « non parti » d'un envoi incertain, et un refus momentané affichait
// « réessayez dans un instant » à côté de « ne repart plus depuis Gerimmo ».
const ENVOI_INCERTAIN = { erreur: "La connexion au service d’e-mail a été interrompue. L’envoi n’est pas confirmé et a peut-être eu lieu : vérifiez avant de le renvoyer.", incertain: true as const };
const ENVOI_LIMITE = { erreur: "Envoi limité temporairement par le prestataire d’e-mail : réessayez dans une minute.", recuperable: true };
const traceGardee = () => m.trace.mockImplementation(async (ligne:{niveau:string;date_envoi:string})=>{(m.tables.relances as unknown[]).push({niveau:ligne.niveau,date_envoi:ligne.date_envoi});return {error:null};});
it("Y-01 — locataire seul, envoi incertain : jamais « n’est pas partie » ; la relance est consignée « non confirmée » ; après un paiement partiel, rien ne repart",async()=>{
  m.envoyer.mockResolvedValue(ENVOI_INCERTAIN);traceGardee();
  const r1=await envoyerRelanceReception("org","appel",{},f());
  expect(r1.erreur).toBeUndefined();
  expect(r1.succes).not.toMatch(/n’est pas partie|pas parti/);
  expect(r1.succes).toContain("Relance non confirmée : elle est enregistrée dans le suivi du bail comme envoi non confirmé.");
  expect(r1.succes).toContain("1 envoi n’est pas confirmé (locataire@example.invalid) : il a peut-être eu lieu.");
  expect(r1.succes).toContain("Ce palier de relance ne repart plus depuis Gerimmo, pour ne pas l’envoyer deux fois");
  expect(m.trace).toHaveBeenCalledTimes(1);
  expect(m.trace).toHaveBeenCalledWith(expect.objectContaining({niveau:"relance_1",note:expect.stringMatching(/ · aucun envoi confirmé · 1 envoi non confirmé \(peut-être parti\)$/)}),{onConflict:"id",ignoreDuplicates:true});
  // Paiement partiel (reste 500) : autre montant, donc autre clé d'envoi. Le palier est consigné : rien ne repart.
  m.ligne={...(m.ligne as object),montant_couvert:300};const f2=f();f2.set("reste_attendu","500");
  expect((await envoyerRelanceReception("org","appel",{},f2)).erreur).toBeTruthy();
  expect(new Set(m.envoyer.mock.calls.filter(c=>c[0].to==="locataire@example.invalid").map(c=>c[0].cleIdempotence)).size).toBe(1);
  expect(m.trace).toHaveBeenCalledTimes(1);
});
it("Y-01 — colocation, colocataire incertain : la note et le message disent « non confirmé », jamais « non parti »",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockImplementation(async (p:{to:string})=>p.to.startsWith("coloc")?ENVOI_INCERTAIN:{});
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.succes).toContain("Relance envoyée à 1 destinataire et enregistrée dans le suivi du bail. 1 envoi n’est pas confirmé (coloc@example.invalid) : il a peut-être eu lieu.");
  expect(r.succes).not.toMatch(/n’a pas abouti|pas parti/);
  const note=String(m.trace.mock.calls[0][0].note);
  expect(note).toMatch(/ · 1 destinataire · 1 envoi non confirmé \(peut-être parti\)$/);
  expect(note).not.toContain("non parti");
});
it("Y-01 — colocation, colocataire refusé un instant (429) : plus de « réessayez » à côté de « ne repart plus » ; le message nomme la personne à prévenir",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockImplementation(async (p:{to:string})=>p.to.startsWith("coloc")?ENVOI_LIMITE:{});
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.succes).toContain("1 envoi n’a pas abouti (coloc@example.invalid) : le service d’e-mail ne l’a pas pris en charge pour le moment, il n’est pas parti.");
  expect(r.succes).toContain("Ce palier de relance ne repart plus depuis Gerimmo, pour ne pas l’envoyer deux fois : prévenez autrement la personne non servie.");
  expect(r.succes).not.toMatch(/réessayez/i);
  expect(String(m.trace.mock.calls[0][0].note)).toMatch(/ · 1 destinataire · 1 envoi à terminer \(non parti\)$/);
});
it("Y-01 — un refus définitif d'un colocataire ne fait pas non plus dire « réessayez » au message qui ferme le palier",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockImplementation(async (p:{to:string})=>p.to.startsWith("coloc")?{erreur:"Le service d’e-mail a refusé l’envoi. Vérifiez l’adresse du destinataire puis réessayez."}:{});
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.succes).toContain("1 envoi n’a pas abouti (coloc@example.invalid) : il n’est pas parti.");
  expect(r.succes).not.toMatch(/réessayez/i);
});
it("Y-01 — rien d'accepté, un envoi incertain et un refus : consigné « non confirmé », le message distingue les deux",async()=>{
  m.tables.bail_personnes=[{person_id:"coloc",date_solidarite_fin:null}];m.tables.colocataires=[{email:"coloc@example.invalid"}];
  m.envoyer.mockImplementation(async (p:{to:string})=>p.to.startsWith("coloc")?ENVOI_LIMITE:ENVOI_INCERTAIN);
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.succes).toContain("Relance non confirmée : elle est enregistrée dans le suivi du bail comme envoi non confirmé. 1 envoi n’est pas confirmé (locataire@example.invalid) : il a peut-être eu lieu. 1 envoi n’a pas abouti (coloc@example.invalid) :");
  expect(r.succes).toContain("vérifiez auprès des personnes concernées et prévenez autrement celles qui ne l’ont pas reçue.");
  expect(String(m.trace.mock.calls[0][0].note)).toMatch(/ · aucun envoi confirmé · 1 envoi non confirmé \(peut-être parti\) · 1 envoi à terminer \(non parti\)$/);
});
it("Y-01 — rien d'accepté et aucun envoi incertain (refus momentané seul) : rien n'est consigné, le clic suivant reprend les mêmes clés",async()=>{
  m.envoyer.mockResolvedValue(ENVOI_LIMITE);
  const r=await envoyerRelanceReception("org","appel",{},f());
  expect(r.erreur).toContain("La relance n’est pas partie et n’est pas enregistrée.");
  expect(m.trace).not.toHaveBeenCalled();
});
