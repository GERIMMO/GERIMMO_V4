import { afterEach, describe, expect, it, vi } from "vitest";
import { ajouterPagesSignature, configurationSignatureBail, empreinteSignatureBail, partiesSignatureBail, telephoneSignature } from "@/lib/signature-bail";
import type { ContexteBail, PersonneDocument } from "@/lib/documents/modeles/communs";
import type { DocumentAssemble } from "@/lib/documents/gabarit";

const personne=(id:string):PersonneDocument=>({id,prenom:"Prénom",nom:id,email:`${id}@example.test`,telephone:"06 12 34 56 78",qualite:"personne physique",date_naissance:null,commune_naissance:null,address_line1:null,postal_code:null,city:null});
const contexte=()=>({organisation:{type:"proprietaire_direct"},locataires:[personne("locataire"),personne("colocataire")],garants:[{...personne("garant"),garant_de:"locataire"}],bailleurs:[{...personne("bailleur"),quote_part:100}]} as ContexteBail);
afterEach(()=>vi.unstubAllGlobals());

describe("parties du bail à signer",()=>{
 it("préserve les colocataires et les garants et place tous les propriétaires en dernier",()=>{
  const ctx=contexte();ctx.bailleurs.push({...personne("indivisaire"),quote_part:50});
  const res=partiesSignatureBail(ctx);
  expect(res.manquants).toEqual([]);expect(res.signataires.map(s=>s.qualite)).toEqual(["Locataire","Colocataire","Garant","Propriétaire","Propriétaire"]);
 });
 it("bloque une identité incomplète, sans téléphone ou avec un e-mail invalide",()=>{
  const ctx=contexte();Object.assign(ctx.locataires[0],{prenom:null,telephone:null,email:"invalide"});
  expect(partiesSignatureBail(ctx).manquants).toHaveLength(3);
 });
 it("ne fabrique pas un signataire pour une SCI ni pour un mandat d’agence",()=>{
  const ctx=contexte();ctx.organisation.type="agence";ctx.bailleurs[0].qualite="SCI";
  expect(partiesSignatureBail(ctx).manquants.join(" ")).toMatch(/mandataire.*représentant/);
 });
 it("refuse qu’une même personne apparaisse comme locataire et bailleur",()=>{
  const ctx=contexte();ctx.bailleurs=[{...ctx.locataires[0],quote_part:100}];
  expect(partiesSignatureBail(ctx).manquants.join()).toContain("plusieurs rôles");
 });
 it.each([["06 12 34 56 78","+33612345678"],["0032 470 12 34 56","+32470123456"],["+44 (7700) 900123","+447700900123"],["1234",""],["06abc12345678",""]])("normalise ou refuse %s",(s,n)=>expect(telephoneSignature(s)).toBe(n));
});

describe("accord explicite et isolation des essais",()=>{
 const env={SIGNATURE_BAIL_PRESTATAIRE:"zoho",ZOHO_SIGN_CLIENT_ID:"test",ZOHO_SIGN_CLIENT_SECRET:"test",ZOHO_SIGN_REFRESH_TOKEN:"test",ZOHO_SIGN_WEBHOOK_SECRET:"webhook",ZOHO_SIGN_BAIL_ACTIF:"true",ZOHO_SIGN_ENV:"sandbox",NEXT_PUBLIC_SUPABASE_URL:"http://localhost:54325"};
 it("refuse d’activer par la seule présence d’une clé",()=>expect(configurationSignatureBail({...env,ZOHO_SIGN_BAIL_ACTIF:undefined})).toBeNull());
 it("exige le secret de retour",()=>expect(configurationSignatureBail({...env,ZOHO_SIGN_WEBHOOK_SECRET:""})).toBeNull());
 it("autorise une sandbox locale explicitement activée",()=>expect(configurationSignatureBail(env)?.environnement).toBe("sandbox"));
 it.each([{VERCEL:"1"},{NEXT_PUBLIC_SUPABASE_URL:"https://rddlxunppddzpsaatdaz.supabase.co"},{NEXT_PUBLIC_SUPABASE_URL:"https://localhost.evil.test"}])("refuse une sandbox sur un environnement déployé ou distant (%j)",s=>expect(configurationSignatureBail({...env,...s})).toBeNull());
});

describe("version du PDF",()=>{
 it("ignore seulement le changement de date d’édition, jamais une date du bail",()=>{
  const a='<div>Établi le <span class="v">18/10/2026</span></div><p>Entrée le 01/11/2026</p>';
  expect(empreinteSignatureBail(a,[])).toBe(empreinteSignatureBail(a.replace("18/10/2026","19/10/2026"),[]));
  expect(empreinteSignatureBail(a,[])).not.toBe(empreinteSignatureBail(a.replace("01/11/2026","02/11/2026"),[]));
 });
 it("crée des emplacements distincts, échappe les noms et lie les annexes par empreinte",()=>{
  const doc={html:"<body>Contrat</body>",reference:"BAIL-TEST"} as DocumentAssemble;
  const parties=partiesSignatureBail(contexte()).signataires;parties[0].nom="<script>alert(1)</script>";
  const rendu=ajouterPagesSignature(doc,parties,[{id:"a",titre:"DPE",storage_path:"org/dpe.pdf",empreinte:"abc"}]).html;
  expect(rendu.match(/\{\{s\d+\|signature\|190\|80\}\}/g)).toHaveLength(4);
  expect(rendu).toContain("{{s4|signature|190|80}}");expect(rendu).not.toContain("<script>");expect(rendu).toContain("SHA-256 : abc");
 });
});
