import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m=vi.hoisted(()=>({email:vi.fn()}));
vi.mock("@/lib/email",()=>({envoyerEmail:m.email}));
vi.mock("@/lib/marque-organisation-serveur",()=>({chargerMarque:vi.fn(async()=>({name:"Organisation test"}))}));
import { notifierDevisRecu } from "../src/lib/notifications";
const pj={nom:"DEV-TEST.pdf",contenuBase64:Buffer.from("%PDF").toString("base64")};
function base(membre:unknown={role:"proprietaire_direct",accounts:{email:"demandeur@example.test"}}){
  const donnees:Record<string,unknown>={incident_devis:{id:"d1",incident_id:"i1",artisan_id:"a1",montant_ttc_cents:5500,sollicitation_id:"s1"},incidents:{id:"i1",numero:"INC-TEST",categorie:"plomberie_canalisation",responsable_account_id:"autre"},artisans:{raison_sociale:"Artisan test"},incident_sollicitations:{created_by:"demandeur"},memberships:membre};
  const filtres:unknown[][]=[];
  const db={from:vi.fn((table:string)=>{const q={select:vi.fn(),eq:vi.fn((...args:unknown[])=>{filtres.push([table,...args]);return q;}),in:vi.fn(),maybeSingle:vi.fn(async()=>({data:donnees[table]??null,error:null})),insert:vi.fn(async()=>({error:null}))};q.select.mockReturnValue(q);q.in.mockReturnValue(q);return q;}),rpc:vi.fn(async()=>({data:null,error:null}))};
  return {db:db as unknown as SupabaseClient,filtres};
}
beforeEach(()=>{m.email.mockReset();m.email.mockResolvedValue({id:"mail-test"});});
describe("E-mail du devis",()=>{
  it("joint le PDF et adresse le demandeur encore membre actif, jamais un destinataire fourni par le formulaire",async()=>{const {db,filtres}=base();expect(await notifierDevisRecu(db,"org","d1",pj)).toEqual({envoyee:true});expect(m.email).toHaveBeenCalledWith(expect.objectContaining({to:"demandeur@example.test",piecesJointes:[pj],cleIdempotence:"devis-gerimmo-d1"}));expect(filtres).toContainEqual(["memberships","status","active"]);expect(filtres).toContainEqual(["memberships","account_id","demandeur"]);});
  it("n’envoie rien si le demandeur a perdu son accès",async()=>{const {db}=base(null);expect(await notifierDevisRecu(db,"org","d1",pj)).toMatchObject({envoyee:false});expect(m.email).not.toHaveBeenCalled();});
  it("signale un échec du fournisseur d’e-mails sans succès trompeur",async()=>{m.email.mockResolvedValue({erreur:"Indisponible"});expect(await notifierDevisRecu(base().db,"org","d1",pj)).toEqual({envoyee:false,motif:"echec_envoi"});});
});
