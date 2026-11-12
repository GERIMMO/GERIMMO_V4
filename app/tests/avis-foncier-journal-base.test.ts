import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {describe, expect, it} from "vitest";
import {verifierBaseDeTest} from "./garde-base";
const url=process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("Avis et écritures au niveau du bien",()=>{
  it("enregistre une fois la facture et la dépense datée sans lot inventé",async()=>{
    const db=new Client({connectionString:url});await db.connect();
    try {
      await db.query("begin");
      const id=async(sql:string,args:unknown[]=[])=>String((await db.query(sql,args)).rows[0].id);
      const org=await id("insert into organizations(name,type,status) values('SCI fictive G08','proprietaire_direct','active') returning id");
      const compte=await id("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(gen_random_uuid(),$1,'{}','{}') returning id",[randomUUID()+"@example.invalid"]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[compte,org]);
      const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien G08','immeuble','1 rue fictive','45000','Orléans') returning id",[org]);
      const doc=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Avis fictif',$2,'application/pdf',10,$3) returning id",[org,org+"/avis.pdf","a".repeat(64)]);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role:"authenticated",aal:"aal2"})]);
      await db.query("set local role authenticated");
      const enregistrer=()=>db.query("select enregistrer_avis_foncier($1,$2,$3,'2025-09-05',2025,'Avis fictif',180000,24000,800)",[org,bien,doc]);
      await db.query("savepoint mois_ouvert");
      await db.query("reset role");
      await db.query("insert into clotures_comptables(organization_id,mois) values($1,'2025-09-01')",[org]);
      await db.query("set local role authenticated");
      await db.query("savepoint tentative");
      await expect(enregistrer()).rejects.toThrow(/Mois clôturé/);
      await db.query("rollback to tentative");
      expect((await db.query("select id from factures_fourniture where document_id=$1",[doc])).rows).toEqual([]);
      expect((await db.query("select id from contrats_fourniture where bien_id=$1",[bien])).rows).toEqual([]);
      await db.query("rollback to mois_ouvert");
      await enregistrer();
      await db.query("savepoint reprise");
      await expect(enregistrer()).rejects.toThrow(/déjà enregistré/);
      await db.query("rollback to reprise");
      const e=await db.query("select bien_id,lot_id,montant::float8,date_piece::text from journal_par_bien where avis_fiscal_id=$1",[doc]);
      expect(e.rows).toEqual([{bien_id:bien,lot_id:null,montant:1552,date_piece:"2025-09-05"}]);
      expect((await db.query("select total_cents::int total from factures_fourniture where document_id=$1",[doc])).rows).toEqual([{total:24800}]);
      await db.query("reset role");
      await db.query("savepoint retour");
      await expect(db.query(readFileSync("supabase/retours-arriere/20261112200752_ecritures_batiment_source.retour.sql","utf8"))).rejects.toThrow(/Conserver leurs preuves/);
      await db.query("rollback to retour");
      expect((await db.query("select count(*)::int n from ecritures where avis_fiscal_id=$1",[doc])).rows[0].n).toBe(1);
    } finally {await db.query("rollback");await db.end();}
  });
});
