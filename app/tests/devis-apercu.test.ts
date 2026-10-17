import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lireSaisieDevisArtisan } from "../src/lib/saisie-devis-artisan";

const m = vi.hoisted(() => ({ acces:vi.fn(), pdf:vi.fn(), upload:vi.fn(), update:vi.fn(), select:vi.fn(), single:vi.fn(), service:vi.fn(), client:vi.fn(), download:vi.fn(), rpc:vi.fn(), user:vi.fn() }));
vi.mock("@/lib/parcours-devis-serveur",()=>({chargerPreparationDevis:m.acces}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.client}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:m.service}));
vi.mock("@/lib/documents/rendu",()=>({rendrePdf:m.pdf}));
import { POST, GET } from "../src/app/api/devis/[sollicitationId]/pdf/route";
const contexte={params:Promise.resolve({sollicitationId:"demande-a"})};
const octets=Buffer.from("%PDF-validated");
function saisie(){const f=new FormData();Object.entries({revision:"1",validation_artisan:"oui",diagnostic:"Joint usé",delai:"Sous cinq jours",duree:"Une heure",valide_jusqu_au:"2099-01-30",contraintes:"Couper l’eau",lignes_devis:JSON.stringify([{code:"plomberie_heure",libelle:"Remplacement du joint",quantite:2,prix_unitaire_ht_cents:2500,tva_bps:1000,montant_ttc_cents:1}])}).forEach(([k,v])=>f.set(k,v));return f;}
function requete(f=saisie()){return new Request("http://localhost/api/devis/demande-a/pdf",{method:"POST",body:f});}
function acces(){
  const q={update:m.update,select:m.select,eq:vi.fn(),neq:vi.fn(),single:m.single,maybeSingle:m.single};
  q.eq.mockReturnValue(q);q.neq.mockReturnValue(q);m.select.mockReturnValue(q);m.update.mockReturnValue(q);
  const service={from:vi.fn(()=>q),storage:{from:vi.fn(()=>({download:m.download,upload:m.upload}))}};
  const supabase={storage:{from:vi.fn(()=>({upload:m.upload}))},rpc:m.rpc,auth:{getUser:m.user}};
  return {service,supabase,preparation:{revision:1,reference_id:"11111111-1111-1111-1111-111111111111",statut:"brouillon"},profil:{adresse:"Adresse entreprise test",mentions:"Mentions entreprise"},fiche:{artisan_id:"artisan-a",raison_sociale:"Artisan connecté",siret:"12345678900012",telephone:null,email:null},demande:{statut:"envoyee",organization_id:"org-a",agence_nom:"Client destinataire",incident_numero:"INC-A",ville:"Paris",code_postal:"75012"}};
}
let a:ReturnType<typeof acces>;
beforeEach(()=>{
  vi.resetAllMocks();a=acces();m.acces.mockResolvedValue(a);m.service.mockReturnValue(a.service);m.client.mockResolvedValue(a.supabase);
  m.single.mockResolvedValue({data:{revision:2},error:null});m.upload.mockResolvedValue({error:null});m.pdf.mockResolvedValue(octets);
  m.user.mockResolvedValue({data:{user:{id:"client-a"}}});m.rpc.mockResolvedValue({data:{id:"sent-quote"},error:null});
});
describe("Validation et archivage du devis Gerimmo",()=>{
  it("recalcule les montants, fige l’identité autorisée et le PDF sans envoyer",async()=>{
    const f=saisie();f.set("artisan_nom","Usurpation");f.set("montant_ttc_cents","1");
    const r=await POST(requete(f),contexte);expect(r.status).toBe(200);expect(r.headers.get("X-Devis-Revision")).toBe("2");
    const doc=m.pdf.mock.calls[0][0];expect(doc.html).toContain("Artisan connecté");expect(doc.html).not.toContain("Usurpation");expect(doc.html).toContain("55,00");expect(doc.html).toContain("Validé par l’artisan");
    expect(m.update.mock.calls[0][0]).toMatchObject({statut:"valide",revision:2,pdf_sha:createHash("sha256").update(octets).digest("hex"),entreprise:{artisan_adresse:"Adresse entreprise test"}});
    expect(m.rpc).not.toHaveBeenCalled();expect(r.headers.get("Cache-Control")).toContain("no-store");
  });
  it("refuse une demande hors du compte artisan",async()=>{m.acces.mockRejectedValue(new Error("Accès refusé"));expect((await POST(requete(),contexte)).status).toBe(403);expect(m.pdf).not.toHaveBeenCalled();});
  it("exige la relecture explicite de l’artisan",async()=>{const f=saisie();f.delete("validation_artisan");expect((await POST(requete(f),contexte)).status).toBe(422);expect(m.pdf).not.toHaveBeenCalled();});
  it("refuse un envoi déjà effectué ou une révision obsolète",async()=>{a.demande.statut="devis_depose";expect((await POST(requete(),contexte)).status).toBe(409);a.demande.statut="envoyee";const f=saisie();f.set("revision","0");expect((await POST(requete(f),contexte)).status).toBe(409);expect(m.pdf).not.toHaveBeenCalled();});
  it("exige l’adresse entreprise et les informations du devis",async()=>{a.profil.adresse="";expect((await POST(requete(),contexte)).status).toBe(422);a.profil.adresse="Adresse";const f=saisie();f.set("diagnostic","");expect((await POST(requete(f),contexte)).status).toBe(422);expect(m.pdf).not.toHaveBeenCalled();});
  it("ne marque pas comme validé un PDF dont le stockage échoue",async()=>{m.upload.mockResolvedValue({error:{message:"stockage"}});expect((await POST(requete(),contexte)).status).toBe(503);expect(m.update).not.toHaveBeenCalled();});
  it("signale un conflit pendant la génération",async()=>{m.single.mockResolvedValue({data:null,error:{message:"conflit"}});expect((await POST(requete(),contexte)).status).toBe(409);});
  it("garde une erreur exploitable si le moteur PDF échoue",async()=>{m.pdf.mockRejectedValue(new Error("moteur"));const r=await POST(requete(),contexte);expect(r.status).toBe(503);expect(await r.json()).toMatchObject({erreur:expect.stringContaining("saisies sont conservées")});});
  it("refuse les dates inexistantes et expirées",()=>{const f=saisie();f.set("valide_jusqu_au","2027-02-30");expect(()=>lireSaisieDevisArtisan(f)).toThrow("date de validité");f.set("valide_jusqu_au","2020-01-01");expect(()=>lireSaisieDevisArtisan(f)).toThrow("dépassée");});
});
describe("Lecture du PDF validé",()=>{
  it("retourne exactement le document enregistré sans le régénérer",async()=>{m.rpc.mockResolvedValue({data:{id:"11111111-abcd",pdf_bucket:"documents",pdf_path:"org-a/doc.pdf",pdf_sha:createHash("sha256").update(octets).digest("hex"),reference_id:"11111111-abcd",statut:"envoye"},error:null});m.download.mockResolvedValue({data:new Blob([octets]),error:null});const r=await GET(new Request("http://localhost/"),contexte);expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(octets);expect(m.pdf).not.toHaveBeenCalled();});
  it("n’expose pas un brouillon au demandeur",async()=>{m.rpc.mockResolvedValue({data:null,error:{message:"non envoyé"}});m.acces.mockRejectedValue(new Error("Pas artisan"));expect((await GET(new Request("http://localhost/"),contexte)).status).toBe(403);expect(m.download).not.toHaveBeenCalled();});
  it("ne remplace pas un PDF quand le stockage ou son intégrité échoue",async()=>{m.rpc.mockResolvedValue({data:{id:"11111111-abcd",pdf_bucket:"documents",pdf_path:"org-a/doc.pdf",pdf_sha:"incorrect",reference_id:"11111111-abcd",statut:"envoye"},error:null});m.download.mockResolvedValue({data:new Blob([octets]),error:null});expect((await GET(new Request("http://localhost/"),contexte)).status).toBe(503);expect(m.pdf).not.toHaveBeenCalled();});
  it("ne régénère jamais à défaut de service d’archives",async()=>{m.service.mockReturnValue(null);expect((await GET(new Request("http://localhost/"),contexte)).status).toBe(503);expect(m.pdf).not.toHaveBeenCalled();});
});
