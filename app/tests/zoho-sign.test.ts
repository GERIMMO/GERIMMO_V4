import { texteMentionCaution, noteMentionCaution } from "@/lib/mention-caution";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTRUCTIONS_CAUTION_MOBILE, actionsSignatureZoho, activerDemandeZoho, annulerDemandeZoho, configurationZohoSign, lireDemandeZoho, preparerCircuitZoho, supprimerBrouillonZoho, telechargerDocumentSigneZoho, telephoneZoho, webhookZohoValide, type ConfigurationZohoSign } from "@/lib/zoho-sign";
import { configurationSignatureBail, configurationSuiviSignatureBail } from "@/lib/signature-bail";

let config: ConfigurationZohoSign;
let compteur = 0;
const parties = [{ prenom:"Alice", nom:"Test", email:"alice@example.test", telephone:"+33600000001" }, { prenom:"Benoit", nom:"Test", email:"benoit@example.test", telephone:"+32470123456" }];
const mention=texteMentionCaution({caution:"Alice Test",locataires:"Benoit Test",plafond:"mille euros (1 000,00 €)",solidaire:true});
const id = "11000000000001", doc = "11000000000002";
const dossier = () => ({ request_id:id, request_status:"draft", description:"gerimmo:circuit:circuit", is_sequential:true,
 document_ids:[{document_id:doc,document_name:"bail",document_order:"0",total_pages:6}],
 actions:parties.map((s,i)=>({action_id:`1100000000000${i+3}`,action_type:"SIGN",recipient_name:`${s.prenom} ${s.nom}`,recipient_email:s.email,signing_order:i,action_status:"NOACTION",verify_recipient:true,verification_type:"SMS",...telephoneZoho(s.telephone)})) });
const attendu = () => ({id:"circuit",external_document_id:doc,annexes:[],signataires:parties.map((s,i)=>({...s,externalId:`1100000000000${i+3}`}))});
const params = () => ({ config, pdf:new TextEncoder().encode("%PDF-fictif"), nomFichier:"bail.pdf", titre:"Essai", referenceExterne:"circuit", expiration:"2026-11-17", signataires:parties, demandeCreee:vi.fn(async()=>{}) });
function api(reponses:unknown[]) {
 const fetch=vi.fn(async(url:string, _init?:RequestInit)=>url.includes("/oauth/") ? Response.json({access_token:"test-jeton",expires_in:3600}) : Response.json(reponses.shift()));
 vi.stubGlobal("fetch",fetch);return fetch;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));config={prestataire:"zoho",environnement:"sandbox",clientId:`test-${++compteur}`,clientSecret:"secret-test",refreshToken:"refresh-test"};});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("Zoho Sign européen",()=>{
 it("reste désactivé sans compte, consentement et secret de retour",()=>{
  expect(configurationZohoSign({})).toBeNull();
  const env={ZOHO_SIGN_CLIENT_ID:"client",ZOHO_SIGN_CLIENT_SECRET:"secret",ZOHO_SIGN_REFRESH_TOKEN:"refresh",NEXT_PUBLIC_SUPABASE_URL:"http://localhost:54326"};
  expect(configurationSignatureBail(env)).toBeNull();
  expect(configurationSignatureBail({...env,ZOHO_SIGN_BAIL_ACTIF:"true"})).toBeNull();
  expect(configurationSignatureBail({...env,ZOHO_SIGN_BAIL_ACTIF:"true",ZOHO_SIGN_WEBHOOK_SECRET:"webhook"})).toMatchObject({prestataire:"zoho",environnement:"sandbox"});
  expect(configurationSignatureBail({...env,ZOHO_SIGN_BAIL_ACTIF:"true",ZOHO_SIGN_WEBHOOK_SECRET:"webhook",VERCEL:"1"})).toBeNull();
 });
 it("suspend les nouveaux envois sans perdre le suivi et les archives des invitations existantes",()=>{
  const env={ZOHO_SIGN_CLIENT_ID:"client",ZOHO_SIGN_CLIENT_SECRET:"secret",ZOHO_SIGN_REFRESH_TOKEN:"refresh",ZOHO_SIGN_WEBHOOK_SECRET:"webhook",ZOHO_SIGN_BAIL_ACTIF:"false",NEXT_PUBLIC_SUPABASE_URL:"http://localhost:54326"};
  expect(configurationSignatureBail(env)).toBeNull();
  expect(configurationSuiviSignatureBail(env)).toMatchObject({prestataire:"zoho",environnement:"sandbox"});
  expect(configurationSuiviSignatureBail({...env,VERCEL:"1"})).toBeNull();
  expect(configurationSuiviSignatureBail({...env,NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co"})).toBeNull();
  expect(configurationSuiviSignatureBail({...env,ZOHO_SIGN_WEBHOOK_SECRET:""})).toBeNull();
 });
 it.each([["+33612345678","FR","612345678"],["+32470123456","BE","470123456"],["+590690000001","GP","690000001"],["+14155550100","US","4155550100"],["+14165550100","CA","4165550100"]])("sépare correctement %s",(tel,code,num)=>expect(telephoneZoho(tel)).toEqual({recipient_countrycode_iso:code,recipient_phonenumber:num}));
 it("refuse un numéro incomplet sans réduire le contrôle SMS",()=>expect(()=>telephoneZoho("0612345678")).toThrow("téléphone"));
 it.each(["+80012345678","+19999999999"])("refuse un pays indéterminé pour %s au lieu de le supposer",tel=>expect(()=>telephoneZoho(tel)).toThrow("pays"));
 it("crée un brouillon européen de test sans invitation et persiste sa référence",async()=>{
  const fetch=api([{code:0,requests:dossier()}]);const p=params();
  expect(await preparerCircuitZoho(p)).toEqual({demandeId:id,documentId:doc,signataireIds:["11000000000003","11000000000004"]});
  expect(p.demandeCreee).toHaveBeenCalledWith(id);
  expect(fetch.mock.calls.map(c=>c[0])).toEqual(["https://accounts.zoho.eu/oauth/v2/token","https://sign.zoho.eu/api/v1/requests"]);
  const form=fetch.mock.calls[1][1]!.body as FormData;
  expect(form.get("testing")).toBe("true");
  expect(form.getAll("file")).toHaveLength(1);
  expect(JSON.parse(form.get("data") as string).requests).toMatchObject({is_sequential:true,email_reminders:false,actions:[{verification_type:"SMS",delivery_mode:"EMAIL",signing_order:0},{verification_type:"SMS",signing_order:1}]});
  expect(fetch.mock.calls[0][1]!.body).toBeInstanceOf(URLSearchParams);
  expect(fetch.mock.calls[1][1]!.redirect).toBe("error");
 });
 it("accepte aussi un nom PDF avec son extension",async()=>{
  const req=dossier();req.document_ids[0].document_name="bail.pdf";api([{code:0,requests:req}]);
  await expect(preparerCircuitZoho(params())).resolves.toMatchObject({demandeId:id});
 });
 it("refuse un autre document malgré la normalisation de l’extension",async()=>{
  const req=dossier();req.document_ids[0].document_name="autre.pdf";api([{code:0,requests:req}]);
  await expect(preparerCircuitZoho(params())).rejects.toThrow("vérifiée");
 });
 it("ne masque pas une erreur métier HTTP 200 et ne recommence pas la création",async()=>{
  const fetch=api([{code:999,message:"secret-ne-doit-pas-sortir",status:"failure"}]);
  await expect(preparerCircuitZoho(params())).rejects.toThrow("refusé");expect(fetch).toHaveBeenCalledTimes(2);
 });
 it.each([200,400])("explique un compte Zoho non confirmé (HTTP %s) sans révéler la réponse privée",async status=>{
  const fetch=vi.fn(async(url:string)=>url.includes("/oauth/")?Response.json({access_token:"test",expires_in:3600}):Response.json({code:8044,message:"adresse-privee@example.test"},{status}));
  vi.stubGlobal("fetch",fetch);
  await expect(preparerCircuitZoho(params())).rejects.toThrow("confirmer l’adresse e-mail du compte Zoho Sign");
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("ne restitue pas une erreur HTTP inconnue contenant des coordonnées",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.includes("/oauth/")?Response.json({access_token:"test",expires_in:3600}):Response.json({code:9999,message:"adresse-privee@example.test"},{status:400})));
  await expect(preparerCircuitZoho(params())).rejects.toThrow("Zoho Sign n’a pas confirmé l’opération (HTTP 400)");
 });
 it("un défaut de persistance ne déclenche pas l’envoi",async()=>{
  const fetch=api([{code:0,requests:dossier()}]);const p=params();p.demandeCreee.mockRejectedValue(new Error("suivi indisponible"));
  await expect(preparerCircuitZoho(p)).rejects.toThrow("suivi indisponible");expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("place chaque signature sur sa page dédiée et conserve testing=true à l’envoi",async()=>{
  const fetch=api([{code:0,requests:dossier()},{code:0}]);
  await activerDemandeZoho(config,id,attendu());
  const form=fetch.mock.calls[2][1]!.body as FormData;
  const actions=JSON.parse(form.get("data") as string).requests.actions;
  expect(actions.map((a:{fields:{page_no:number}[]})=>a.fields[0].page_no)).toEqual([4,5]);
  expect(actions.every((a:{fields:{is_mandatory:boolean}[]})=>a.fields[0].is_mandatory)).toBe(true);
  expect(form.get("testing")).toBe("true");
 });
 it("la caution saisit une mention obligatoire non préremplie, avant sa signature et avec SMS",async()=>{
  const circuit={...attendu(),modele:"cautionnement",signataires:attendu().signataires.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mention:undefined}))};
  const controle={...dossier(),notes:INSTRUCTIONS_CAUTION_MOBILE,actions:actionsSignatureZoho(dossier(),circuit).map((a,i)=>({...dossier().actions[i],private_notes:a.private_notes,fields:a.fields.map((f,k)=>({...f,field_id:`11000000000${i}${k}1`}))}))};
  const fetch=api([{code:0,requests:dossier()},{code:0},{code:0,requests:controle},{code:0}]);
  await activerDemandeZoho(config,id,circuit);
  const actions=JSON.parse((fetch.mock.calls[2][1]!.body as FormData).get("data") as string).requests.actions;
  expect(actions[0].fields).toHaveLength(2);
  expect(actions[0].private_notes).toBe(noteMentionCaution(mention));
  expect(JSON.parse((fetch.mock.calls[2][1]!.body as FormData).get("data") as string).requests.notes).toBe(INSTRUCTIONS_CAUTION_MOBILE);
  expect(actions[1]).not.toHaveProperty("private_notes");
  expect(actions[0].fields[0].field_label).toContain("e-mail");
  expect(actions[0].fields[0]).toMatchObject({field_type_name:"Textfield",is_mandatory:true});
  expect(actions[0].fields[0]).not.toHaveProperty("default_value");
  expect(actions[0].fields[0].validation.validation_type).toBe("CUSTOM");
  expect(new RegExp(actions[0].fields[0].validation.validation_regex).test("ok")).toBe(false);
  expect(fetch.mock.calls.map(c=>c[1]?.method)).toEqual(["POST",undefined,"PUT",undefined,"POST"]);
  expect(actions[0].fields[1].y_coord).toBeGreaterThan(actions[0].fields[0].y_coord+actions[0].fields[0].abs_height);
  expect(actions[1].fields).toHaveLength(1);
  expect(actions.every((a:{verification_type:string})=>a.verification_type==="SMS")).toBe(true);
  const soumis=JSON.parse((fetch.mock.calls[4][1]!.body as FormData).get("data") as string).requests.actions;
  expect(soumis.flatMap((a:{fields:{field_id:string}[]})=>a.fields.map(f=>f.field_id))).toEqual(controle.actions.flatMap(a=>a.fields.map(f=>f.field_id)));
  expect(soumis.flatMap((a:{fields:unknown[]})=>a.fields)).toHaveLength(3);
  expect(soumis[0].private_notes).toBe(noteMentionCaution(mention));
 });

 it("une reprise de préparation réutilise les champs existants au PUT comme au submit",async()=>{
  const c={...attendu(),modele:"cautionnement",signataires:attendu().signataires.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mention:undefined}))};
  const controle={...dossier(),notes:INSTRUCTIONS_CAUTION_MOBILE,actions:actionsSignatureZoho(dossier(),c).map((a,i)=>({...dossier().actions[i],private_notes:a.private_notes,fields:a.fields.map((f,k)=>({...f,field_id:`11000000000${i}${k}1`}))}))};
  const fetch=api([{code:0,requests:controle},{code:0},{code:0,requests:controle},{code:0}]);
  await activerDemandeZoho(config,id,c);
  for(const call of [2,4]) {
    const actions=JSON.parse((fetch.mock.calls[call][1]!.body as FormData).get("data") as string).requests.actions;
    expect(actions.flatMap((a:{fields:{field_id:string}[]})=>a.fields.map(f=>f.field_id))).toEqual(controle.actions.flatMap(a=>a.fields.map(f=>f.field_id)));
  }
 });

 it("refuse un brouillon contenant déjà des champs en double sans inviter",async()=>{
  const c={...attendu(),modele:"cautionnement",signataires:attendu().signataires.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mention:undefined}))};
  const controle={...dossier(),notes:INSTRUCTIONS_CAUTION_MOBILE,actions:actionsSignatureZoho(dossier(),c).map((a,i)=>({...dossier().actions[i],private_notes:a.private_notes,fields:[...a.fields,...a.fields].map((f,k)=>({...f,field_id:`11000000000${i}${k}1`}))}))};
  const fetch=api([{code:0,requests:controle}]);
  await expect(activerDemandeZoho(config,id,c)).rejects.toThrow("champs Zoho");
  expect(fetch.mock.calls.some(([url])=>url.endsWith("/submit"))).toBe(false);
 });

 it("bloque l’envoi si le texte à copier dans l’invitation a été perdu ou tronqué",async()=>{
  const c={...attendu(),modele:"cautionnement",signataires:attendu().signataires.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mention:undefined}))};
  const controle={...dossier(),notes:INSTRUCTIONS_CAUTION_MOBILE,actions:actionsSignatureZoho(dossier(),c).map((a,i)=>({...dossier().actions[i],private_notes:"note tronquée",fields:a.fields.map((f,k)=>({...f,field_id:`11000000000${i}${k}1`}))}))};
  const fetch=api([{code:0,requests:dossier()},{code:0},{code:0,requests:controle}]);
  await expect(activerDemandeZoho(config,id,c)).rejects.toThrow("texte à copier");
  expect(fetch.mock.calls.some(([url])=>url.endsWith("/submit"))).toBe(false);
 });

 it("refuse une mention perdue chez Zoho avant d’envoyer l’invitation",async()=>{
  const fetch=api([{code:0,requests:dossier()},{code:0},{code:0,requests:dossier()}]);
  const c={...attendu(),modele:"cautionnement",signataires:attendu().signataires.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mention:undefined}))};
  await expect(activerDemandeZoho(config,id,c)).rejects.toThrow("contrôle de la mention");
  expect(fetch.mock.calls.some(([url])=>url.endsWith("/submit"))).toBe(false);
 });
 it("refuse un ancien cautionnement sans mention figée",async()=>{
  const fetch=api([{code:0,requests:dossier()}]);
  await expect(activerDemandeZoho(config,id,{...attendu(),modele:"cautionnement",signataires:attendu().signataires.map(s=>({...s,qualite:"Garant"}))})).rejects.toThrow("préparée à nouveau");
  expect(fetch.mock.calls.some(([url])=>url.endsWith("/submit"))).toBe(false);
 });
 it("contient les signatures mobiles observées quand Zoho conserve leur rapport largeur/hauteur",async()=>{
  const fetch=api([{code:0,requests:dossier()},{code:0}]);
  await activerDemandeZoho(config,id,attendu());
  const form=fetch.mock.calls[2][1]!.body as FormData;
  const actions=JSON.parse(form.get("data") as string).requests.actions;
  // Dimensions des apparences anonymes du PDF d’essai, sans identité ni signature.
  const proportions=[333/54,391/62];
  actions.forEach((a:{fields:{abs_height:number;abs_width:number;x_coord:number}[]},i:number)=>{
   const champ=a.fields[0],largeur=champ.abs_height*proportions[i];
   expect(champ.abs_height).toBeGreaterThanOrEqual(24);
   expect(largeur).toBeLessThanOrEqual(champ.abs_width);
   expect(champ.x_coord+largeur).toBeLessThanOrEqual(595-54);
  });
 });
 it.each(["email","sms","pays","ordre","document","reference"])("bloque avant l’envoi si %s a changé",async(type)=>{
  const req=dossier();if(type==="email")req.actions[0].recipient_email="autre@example.test";
  if(type==="sms")req.actions[0].verify_recipient=false;if(type==="ordre")req.actions[0].signing_order=2;
  if(type==="pays")req.actions[0].recipient_countrycode_iso="BE";
  if(type==="document")req.document_ids[0].document_id="11000000000099";if(type==="reference")req.description="autre";
  const fetch=api([{code:0,requests:req}]);await expect(activerDemandeZoho(config,id,attendu())).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("un statut inconnu ne devient jamais signé",async()=>{
  api([{code:0,requests:{...dossier(),request_status:"nouvel_etat"}}]);await expect(lireDemandeZoho(config,id)).rejects.toThrow("état");
 });
 it.each([["recalled","canceled"],["expired","expired"],["declined","declined"],["rejected","rejected"]])("conserve le sens de l’état %s",async(distant,local)=>{
  api([{code:0,requests:{...dossier(),request_status:distant}}]);
  expect(await lireDemandeZoho(config,id)).toMatchObject({status:local});
 });
 it("reconnaît la corbeille réversible sans confondre avec un brouillon actif",async()=>{
  api([{code:0,requests:{...dossier(),is_deleted:true}}]);
  expect(await lireDemandeZoho(config,id)).toMatchObject({status:"deleted"});
 });
 it("une panne temporaire ne rejoue pas automatiquement une mutation",async()=>{
  const fetch=vi.fn(async(url:string)=>url.includes("/oauth/")?Response.json({access_token:"test",expires_in:3600}):new Response("indisponible",{status:503}));
  vi.stubGlobal("fetch",fetch);
  await expect(annulerDemandeZoho(config,id)).rejects.toThrow("HTTP 503");
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("un dossier terminé et une personne signée sont normalisés séparément",async()=>{
  const req=dossier();req.request_status="completed";req.actions[0].action_status="SIGNED";
  api([{code:0,requests:req}]);expect(await lireDemandeZoho(config,id)).toMatchObject({status:"done",external_id:"circuit",signers:[{status:"signed",email:parties[0].email},{status:"initiated"}]});
 });
 it("refuse de supprimer une demande déjà envoyée",async()=>{
  const fetch=api([{code:0,requests:{...dossier(),request_status:"inprogress"}}]);await expect(supprimerBrouillonZoho(config,id)).rejects.toThrow("brouillon");expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("place un brouillon à la corbeille sans le paramètre testing refusé par cet endpoint",async()=>{
  const fetch=api([{code:0,requests:dossier()},{code:0}]);await supprimerBrouillonZoho(config,id);
  expect(fetch.mock.calls[2][0]).toContain(`/requests/${id}/delete`);
  expect(fetch.mock.calls[2][1]!.method).toBe("PUT");expect(fetch.mock.calls[2][1]!.body).toBeUndefined();
 });
 it("rappelle un circuit existant sans les paramètres réservés à sa création",async()=>{
  const fetch=api([{code:0}]);await annulerDemandeZoho(config,id);
  expect(fetch.mock.calls[1][0]).toContain(`/requests/${id}/recall`);expect(fetch.mock.calls[1][1]!.body).toBeUndefined();
 });
 it("télécharge le contrat signé identifié et refuse un ZIP ou HTML",async()=>{
  const fetch=api([]);fetch.mockImplementation(async url=>url.includes("/oauth/")?Response.json({access_token:"test",expires_in:3600}):new Response("PK-zip"));
  await expect(telechargerDocumentSigneZoho(config,id,doc)).rejects.toThrow("PDF");expect(fetch.mock.calls[1][0]).toContain(`/requests/${id}/documents/${doc}/pdf`);
 });
 it("vérifie le HMAC base64 du corps brut, sans accepter une modification",()=>{
  const brut='{"requests":{"request_id":"1"}}',secret="secret-test";const signature=createHmac("sha256",secret).update(brut).digest("base64");
  expect(webhookZohoValide(brut,signature,secret)).toBe(true);
  expect(webhookZohoValide(brut+" ",signature,secret)).toBe(false);
  expect(webhookZohoValide(brut,"faux",secret)).toBe(false);
 });
});
