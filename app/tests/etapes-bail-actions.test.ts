import {beforeEach,it,expect,vi} from "vitest";
import {commencerBail,modifierEtapeBail} from "@/app/actions/etapes-bail";
const m=vi.hoisted(()=>({acces:vi.fn(),update:vi.fn(),eq:vi.fn(),revalidate:vi.fn(),redirect:vi.fn(),redirection:new Error("Redirection serveur")}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("next/navigation",()=>({redirect:m.redirect}));
function contexte({user=true,role="proprietaire_direct",etat="brouillon",absent=false,modifies=true,erreurLecture=false,bienId="bien" as string|null,error=null as null|{message:string}}={}){
 const q={select:vi.fn(),eq:m.eq,is:vi.fn(),maybeSingle:vi.fn(),update:m.update};
 q.eq.mockReturnValue(q);q.is.mockReturnValue(q);q.select.mockImplementation(()=>q);q.update.mockReturnValue({...q,select:async()=>({data:modifies?[{id:"bail"}]:[],error})});
 // La chaîne update garde ses filtres et sa réponse de mutation.
 const mutation={eq:vi.fn(),is:vi.fn(),select:async()=>({data:modifies?[{id:"bail"}]:[],error})};mutation.eq.mockReturnValue(mutation);mutation.is.mockReturnValue(mutation);q.update.mockReturnValue(mutation);
 q.maybeSingle.mockResolvedValue({data:absent?null:{etat,lot_id:"lot",type:"nu",loyer_hc:500,charges:40,depot_garantie:400,charges_mode:"provision",lot:{meuble:false,surface_m2:46,bien_id:bienId}},error:erreurLecture?{message:"Lecture refusée"}:null});
 m.acces.mockResolvedValue({user:user?{id:"moi"}:null,role,supabase:{from:()=>q}});return mutation;
}
function f(){const form=new FormData();Object.entries({type:"nu",date_debut:"2026-10-09",jour_echeance:"1",locataire_principal:"pirate"}).forEach(([k,v])=>form.set(k,v));return form;}
beforeEach(()=>{vi.clearAllMocks();m.redirect.mockImplementation(()=>{throw m.redirection;});contexte();});
it("refuse les utilisateurs non connectés",async()=>{contexte({user:false});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();expect(m.revalidate).not.toHaveBeenCalled();});
it.each(["actif","preavis","termine"])("refuse de modifier le bail %s",async etat=>{contexte({etat});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();expect(m.revalidate).not.toHaveBeenCalled();});
it("refuse un bail inaccessible",async()=>{contexte({absent:true});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();expect(m.revalidate).not.toHaveBeenCalled();});
it("n’enregistre que les données de l’étape dans le brouillon autorisé",async()=>{const mutation=contexte();expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("succes");expect(m.eq).toHaveBeenCalledWith("organization_id","org");expect(m.update.mock.calls[0][0]).not.toHaveProperty("locataire_principal");expect(m.update.mock.calls[0][0]).not.toHaveProperty("jour_echeance");expect(mutation.eq).toHaveBeenCalledWith("etat","brouillon");expect(mutation.eq).toHaveBeenCalledWith("loyer_hc",500);});
it("refuse de confirmer une écriture vide ou devenue obsolète",async()=>{contexte({modifies:false});const r=await modifierEtapeBail("org","bail","bail",{},f());expect(r.erreur).toBeTruthy();expect(r.valeurs?.date_debut).toBe("2026-10-09");expect(m.revalidate).not.toHaveBeenCalled();});
it("garde les saisies après une erreur de base",async()=>{contexte({error:{message:"Écriture refusée"}});const r=await modifierEtapeBail("org","bail","bail",{},f());expect(r.erreur).toBeTruthy();expect(r.valeurs?.date_debut).toBe("2026-10-09");expect(m.revalidate).not.toHaveBeenCalled();});

it.each([
 {role:"proprietaire_direct",racines:["/agence","/espace"]},
 {role:"admin_agence",racines:["/agence"]},
])("actualise le bail et la fiche du lot après sauvegarde pour $role",async({role,racines})=>{
 contexte({role});
 expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("succes");
 const chemins=m.revalidate.mock.calls.map(([chemin])=>chemin);
 expect(chemins).toEqual(racines.flatMap(racine=>[`${racine}/org/baux/bail`,`${racine}/org/parc/bien/lots/lot`]));
});

it("ne construit pas d’adresse de lot sans bâtiment connu",async()=>{
 contexte({bienId:null});
 expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("succes");
 expect(m.revalidate.mock.calls.map(([chemin])=>chemin)).toEqual(["/agence/org/baux/bail","/espace/org/baux/bail"]);
});

it("n’actualise aucune page si la relecture du bail échoue",async()=>{
 contexte({erreurLecture:true});
 expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");
 expect(m.update).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it("n’actualise aucune page si la saisie est refusée",async()=>{
 const form=f();form.set("date_debut","2026-02-30");
 expect(await modifierEtapeBail("org","bail","bail",{},form)).toHaveProperty("erreur");
 expect(m.update).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

function contexteCreation({role="proprietaire_direct",user=true,absent=false,erreurLecture=false,erreurInsertion=false,sansIdentifiant=false,meuble=false,vierges=[] as {id:string}[],liens=[] as {bail_id:string}[],erreurBrouillons=false,precedents=[] as Record<string,unknown>[],erreurPrecedents=false}={}) {
 const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:absent?null:{id:"lot",meuble},error:erreurLecture?{message:"Lecture refusée"}:null})};
 q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
 const insert=vi.fn().mockReturnValue({select:()=>({single:async()=>({data:erreurInsertion||sansIdentifiant?null:{id:"nouveau"},error:erreurInsertion?{message:"Écriture refusée"}:null})})});
 // Audit #264 (FL-02) : l'action relit d'abord les brouillons vierges du lot, puis leurs personnes rattachées.
 const brouillons={select:vi.fn(),eq:vi.fn(),is:vi.fn(),order:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:erreurBrouillons?null:vierges,error:erreurBrouillons?{message:"Lecture refusée"}:null}).then(resolve)};
 brouillons.select.mockReturnValue(brouillons);brouillons.eq.mockReturnValue(brouillons);brouillons.is.mockReturnValue(brouillons);brouillons.order.mockReturnValue(brouillons);
 const personnes={select:()=>({in:async()=>({data:liens,error:null})})};
 // Décision du 27/10 (CB-08) : avant d'insérer, l'action lit les baux terminés ou en préavis du lot (colonnes détaillées).
 const anciens={eq:vi.fn(),in:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:erreurPrecedents?null:precedents,error:erreurPrecedents?{message:"Lecture refusée"}:null}).then(resolve)};
 anciens.eq.mockReturnValue(anciens);anciens.in.mockReturnValue(anciens);
 const baux={insert,select:vi.fn((colonnes:string)=>colonnes==="id"?brouillons:anciens)};
 m.acces.mockResolvedValue({user:user?{id:"moi"}:null,role,supabase:{from:(table:string)=>table==="lots"?q:table==="bail_personnes"?personnes:baux}});
 return {q,insert,brouillons,anciens};
}
const bailTermine={id:"ancien",chambre_id:null,type:"nu",date_debut:"2023-09-01",date_fin:"2026-08-31",date_sortie_reelle:"2026-08-31",loyer_hc:930,charges:65,charges_mode:"provision",jour_echeance:5,paiement_echeance:"echoir",revision_irl:true,irl_trimestre:"T2",irl_valeur:140.59,locataire_principal:"ancien-locataire",depot_garantie:900};

it("CB-08 : en relocation, le brouillon reprend le type, le loyer, les charges, l’échéance et l’IRL du bail précédent, jamais le locataire, les dates ni le dépôt",async()=>{
 const {insert,anciens}=contexteCreation({meuble:true,precedents:[bailTermine,{...bailTermine,id:"plus-ancien",date_sortie_reelle:"2021-05-31",loyer_hc:800}]});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(anciens.in).toHaveBeenCalledWith("etat",["termine","preavis"]);
 for(const filtre of [["organization_id","org"],["lot_id","lot"]])expect(anciens.eq).toHaveBeenCalledWith(...filtre);
 expect(insert).toHaveBeenCalledExactlyOnceWith({organization_id:"org",lot_id:"lot",etat:"brouillon",type:"nu",loyer_hc:930,charges:65,charges_mode:"provision",jour_echeance:5,paiement_echeance:"echoir",revision_irl:true,irl_trimestre:"T2",irl_valeur:140.59});
 expect(m.redirect).toHaveBeenCalledExactlyOnceWith("/espace/org/baux/nouveau#etape-bail-1");
});

it("CB-08 : colocation à baux individuels — un bail de chambre n’est pas repris pour le lot entier à la création",async()=>{
 const {insert}=contexteCreation({precedents:[{...bailTermine,type:"colocation",chambre_id:"chambre-a"}]});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(insert).toHaveBeenCalledExactlyOnceWith({organization_id:"org",lot_id:"lot",type:"nu",etat:"brouillon"});
});

it("CB-08 : ne crée rien si les contrats précédents du lot ne peuvent pas être lus",async()=>{
 const {insert}=contexteCreation({erreurPrecedents:true});
 expect((await commencerBail("org","lot","bien")).erreur).toBeTruthy();
 expect(insert).not.toHaveBeenCalled();
 expect(m.redirect).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it.each([
 {role:"proprietaire_direct",racine:"/espace",meuble:true,type:"meuble"},
 {role:"admin_agence",racine:"/agence",meuble:false,type:"nu"},
])("ouvre immédiatement le parcours du brouillon dans l’espace $role",async({role,racine,meuble,type})=>{
 const {q,insert}=contexteCreation({role,meuble});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(insert).toHaveBeenCalledExactlyOnceWith({organization_id:"org",lot_id:"lot",type,etat:"brouillon"});
 expect(q.eq).toHaveBeenCalledWith("id","lot");
 expect(q.eq).toHaveBeenCalledWith("bien_id","bien");
 expect(q.eq).toHaveBeenCalledWith("organization_id","org");
 const racines=role==="proprietaire_direct"?["/agence","/espace"]:["/agence"];
 expect(m.revalidate.mock.calls.map(([chemin])=>chemin)).toEqual(racines.flatMap(base=>[`${base}/org/baux/nouveau`,`${base}/org/parc/bien/lots/lot`]));
 expect(m.redirect).toHaveBeenCalledExactlyOnceWith(`${racine}/org/baux/nouveau#etape-bail-1`);
 expect(Math.max(...m.revalidate.mock.invocationCallOrder)).toBeLessThan(m.redirect.mock.invocationCallOrder[0]);
});

it.each([
 {nom:"utilisateur non connecté",options:{user:false}},
 {nom:"lot inaccessible",options:{absent:true}},
 {nom:"lecture du lot en échec",options:{erreurLecture:true}},
])("ne crée ni ne redirige en cas de $nom",async({options})=>{
 const {insert}=contexteCreation(options);
 expect(await commencerBail("org","lot","bien")).toHaveProperty("erreur");
 expect(insert).not.toHaveBeenCalled();
 expect(m.redirect).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it.each([
 {nom:"écriture refusée",options:{erreurInsertion:true}},
 {nom:"création non confirmée",options:{sansIdentifiant:true}},
])("reste sur la fiche avec une erreur si $nom",async({options})=>{
 const {insert}=contexteCreation(options);
 const retour=await commencerBail("org","lot","bien");
 expect(retour.erreur).toBeTruthy();
 expect(retour.succes).toBeUndefined();
 expect(insert).toHaveBeenCalledTimes(1);
 expect(m.redirect).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it("FL-02 : reprend le brouillon vierge du lot au lieu d’en créer un second",async()=>{
 const {insert,brouillons}=contexteCreation({vierges:[{id:"vierge-ancien"},{id:"vierge-recent"}]});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(insert).not.toHaveBeenCalled();
 expect(m.redirect).toHaveBeenCalledExactlyOnceWith("/espace/org/baux/vierge-ancien#etape-bail-1");
 for(const filtre of [["organization_id","org"],["lot_id","lot"],["etat","brouillon"]])expect(brouillons.eq).toHaveBeenCalledWith(...filtre);
 // Le dépôt de garantie, exigé pour enregistrer l’étape Loyer et jamais repris du bail précédent, marque la saisie ; le loyer non (CB-08).
 for(const colonne of ["chambre_id","locataire_principal","date_debut","depot_garantie","document_signe","signe_envoye_le"])expect(brouillons.is).toHaveBeenCalledWith(colonne,null);
 expect(brouillons.is).not.toHaveBeenCalledWith("loyer_hc",null);
 expect(brouillons.order).toHaveBeenCalledWith("created_at");
});

it("CB-08 / FL-02 : en relocation, le brouillon pré-rempli depuis le bail précédent et jamais touché est repris au second geste, pas doublé",async()=>{
 const {insert,brouillons}=contexteCreation({vierges:[{id:"prerempli"}],precedents:[bailTermine]});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(insert).not.toHaveBeenCalled();
 expect(brouillons.is).toHaveBeenCalledWith("depot_garantie",null);
 expect(brouillons.is).not.toHaveBeenCalledWith("loyer_hc",null);
 expect(m.redirect).toHaveBeenCalledExactlyOnceWith("/espace/org/baux/prerempli#etape-bail-1");
});

it("FL-02 : un brouillon sans saisie mais avec une personne rattachée n’est pas repris",async()=>{
 const {insert}=contexteCreation({vierges:[{id:"avec-personne"}],liens:[{bail_id:"avec-personne"}]});
 await expect(commencerBail("org","lot","bien")).rejects.toBe(m.redirection);
 expect(insert).toHaveBeenCalledTimes(1);
 expect(m.redirect).toHaveBeenCalledExactlyOnceWith("/espace/org/baux/nouveau#etape-bail-1");
});

it("FL-02 : ne crée rien si les brouillons existants ne peuvent pas être vérifiés",async()=>{
 const {insert}=contexteCreation({erreurBrouillons:true});
 expect((await commencerBail("org","lot","bien")).erreur).toBeTruthy();
 expect(insert).not.toHaveBeenCalled();
 expect(m.redirect).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it("X08 : la sauvegarde des clauses reste permise et renvoie le contrôle de cohérence",async()=>{
 const form=new FormData();for(const [k,v] of Object.entries({encadrement_loyer:"true",loyer_reference:"1",loyer_reference_majore:"1,20"}))form.set(k,v);
 const r=await modifierEtapeBail("org","bail","clauses",{},form);
 expect(r.succes).toBeTruthy();expect(r.erreur).toBeUndefined();expect(r.avertissements?.map(a=>a.code)).toContain("base_superieure");
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({loyer_reference:1,loyer_reference_majore:1.2}));
 expect(m.update.mock.calls[0][0]).not.toHaveProperty("loyer_hc");
});

it("CB-01 : refuse d’écraser une étape enregistrée entre-temps dans un autre onglet et renvoie la valeur enregistrée",async()=>{
 // L’onglet resté ouvert avait lu un loyer de 800 ; la base porte 500 depuis.
 const form=new FormData();for(const [k,v] of Object.entries({loyer_hc:"800",charges:"55",depot_garantie:"400",jour_echeance:"1",valeurs_lues:JSON.stringify({loyer_hc:"800.00",charges:"40",depot_garantie:"400"})}))form.set(k,v);
 const r=await modifierEtapeBail("org","bail","loyer",{},form);
 expect(r.erreur).toMatch(/autre onglet/);
 expect(r.modifieesAilleurs).toEqual({loyer_hc:"500"});
 expect(r.valeurs?.charges).toBe("55");
 expect(m.update).not.toHaveBeenCalled();
 expect(m.revalidate).not.toHaveBeenCalled();
});

it("CB-01 : un montant relu sous une autre écriture (« 500.00 ») n’est pas un conflit, et l’étape enregistrée devient la nouvelle référence",async()=>{
 const form=f();form.set("valeurs_lues",JSON.stringify({type:"nu",date_debut:"",chambre_id:""}));
 const r=await modifierEtapeBail("org","bail","bail",{},form);
 expect(r.succes).toBeTruthy();
 expect(r.valeursEnregistrees).toMatchObject({type:"nu",date_debut:"2026-10-09",chambre_id:""});
 const loyer=new FormData();for(const [k,v] of Object.entries({loyer_hc:"500",charges:"40",depot_garantie:"400",jour_echeance:"1",valeurs_lues:JSON.stringify({loyer_hc:"500.00",charges:"40.00",depot_garantie:"400"})}))loyer.set(k,v);
 expect((await modifierEtapeBail("org","bail","loyer",{},loyer)).succes).toBeTruthy();
});
