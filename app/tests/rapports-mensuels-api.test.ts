import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { remettreRapportMensuel } from "@/lib/rapports-mensuels";

// La base et le stockage restent locaux ; seul le transport externe est simulé.
const email = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ envoyerEmail: email }));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const base = process.env.SUPALOCAL_DB;
const chrome = [process.env.GERIMMO_CHROME, "/usr/bin/google-chrome"].find(c => c && existsSync(c));
const actif = Boolean(base && url && cle && chrome);
verifierBaseDeTest(base);
describe.skipIf(!actif)("Compte rendu — API, RLS, vrai PDF et archivage", () => {
  const sql = new Client({ connectionString: base });
  const db = createClient(url ?? "http://localhost:54322", cle ?? "locale", { auth: { persistSession: false, autoRefreshToken: false } });
  let orgId: string, mandatId: string, personId: string, rapportId: string, userId: string;
  let documentId: string | undefined;
  let bienId: string, lotId: string, bailId: string;
  beforeAll(async () => {
    expect(new URL(url!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    process.env.GERIMMO_CHROME = chrome;
    await sql.connect();
    const auth = await db.auth.signInWithPassword({ email: "admin.alpha@gerimmo-demo.fr", password: "Gerimmo-Demo-2026" });
    expect(auth.error).toBeNull(); userId = auth.data.user!.id;
    const org = await db.from("memberships").select("organization_id").eq("account_id", userId).eq("role", "admin_agence").limit(1).single();
    expect(org.error).toBeNull(); orgId = org.data!.organization_id;
    await sql.query("update public.organizations set address_line1='10 rue de la Recette',postal_code='75001',city='Paris',email_contact='agence@recette.test' where id=$1", [orgId]);
    // Jeu dédié sans mouvement financier ; le rapport à zéro est valide.
    personId = (await sql.query("insert into public.persons (organization_id,nom,prenom,email,address_line1,postal_code,city,qualite) values ($1,'Rapport test','Mensuel','rapport-'||gen_random_uuid()||'@recette.test','20 rue du Mandant','69003','Lyon','Personne physique') returning id", [orgId])).rows[0].id;
    mandatId = (await sql.query("insert into public.mandats (organization_id,person_id,etat) values ($1,$2,'actif') returning id", [orgId, personId])).rows[0].id;
    bienId = (await sql.query("insert into public.biens (organization_id,nom,type,address_line1,postal_code,city) values ($1,'Bien rapport de recette','appartement','1 rue du Test','75001','Paris') returning id", [orgId])).rows[0].id;
    lotId = (await sql.query("insert into public.lots (organization_id,bien_id,nom) values ($1,$2,'Lot du rapport') returning id", [orgId,bienId])).rows[0].id;
    await sql.query("insert into public.detentions (organization_id,lot_id,person_id,quote_part,date_debut) values ($1,$2,$3,100,'2026-01-01')", [orgId,lotId,personId]);
    await sql.query("insert into public.mandat_lignes (organization_id,mandat_id,lot_id,date_debut) values ($1,$2,$3,'2026-01-01')", [orgId,mandatId,lotId]);
    bailId = (await sql.query("insert into public.baux (organization_id,lot_id) values ($1,$2) returning id", [orgId,lotId])).rows[0].id;
    rapportId = (await sql.query("insert into public.rapports_gestion (organization_id,mandat_id,mois,net) values ($1,$2,'2026-08-01',0) returning id", [orgId,mandatId])).rows[0].id;
  });
  afterAll(async () => {
    if (documentId) {
      const doc = await db.from("documents").select("storage_path").eq("id", documentId).single();
      if (doc.data) await db.storage.from("documents").remove([doc.data.storage_path]);
      await sql.query("delete from public.documents where id=$1", [documentId]);
    }
    if (rapportId) {
      await sql.query("delete from public.alerts where details->>'rapport_id'=$1", [rapportId]);
      await sql.query("delete from public.tech_log where details->>'rapport_id'=$1", [rapportId]);
      await sql.query("delete from public.rapports_gestion where id=$1", [rapportId]);
    }
    if (mandatId) await sql.query("delete from public.mandats where id=$1", [mandatId]);
    if (bailId) await sql.query("delete from public.baux where id=$1", [bailId]);
    if (lotId) {
      await sql.query("delete from public.detentions where lot_id=$1", [lotId]);
      await sql.query("delete from public.lots where id=$1", [lotId]);
    }
    if (bienId) {
      await sql.query("delete from public.lots where bien_id=$1", [bienId]);
      await sql.query("delete from public.biens where id=$1", [bienId]);
    }
    if (personId) await sql.query("delete from public.persons where id=$1", [personId]);
    await db.auth.signOut(); await sql.end();
  });
  it("reprend un échec d’envoi avec les mêmes octets et une seule alerte de versement", async () => {
    email.mockResolvedValueOnce({ erreur: "Transport fictif indisponible" }).mockResolvedValue({ id: "test-accepte" });
    const r = await remettreRapportMensuel(db, { id: userId } as never, orgId, rapportId, "Recette sans envoi externe", "admin_agence");
    documentId = r.documentId;
    expect(r.erreur).toContain("Transport fictif"); expect(documentId).toBeTruthy();
    expect((await db.from("rapports_gestion").select("statut,commentaire").eq("id", rapportId).single()).data).toMatchObject({ statut: "envoye", commentaire: "Recette sans envoi externe" });
    const retour = await remettreRapportMensuel(db, { id: userId } as never, orgId, rapportId, "Ne doit pas remplacer le commentaire figé", "admin_agence");
    expect(retour.erreur).toBeUndefined(); expect(retour.documentId).toBe(documentId);
    expect(email.mock.calls[1][0]).toEqual(email.mock.calls[0][0]);
    const octets = Buffer.from(email.mock.calls[0][0].piecesJointes[0].contenuBase64, "base64");
    if (process.env.GERIMMO_CATALOGUE_PDF_DIR) {
      mkdirSync(process.env.GERIMMO_CATALOGUE_PDF_DIR, { recursive: true });
      writeFileSync(join(process.env.GERIMMO_CATALOGUE_PDF_DIR, "compte-rendu-joint.pdf"), octets);
    }
    expect(octets.subarray(0,5).toString()).toBe("%PDF-"); expect(octets.length).toBeGreaterThan(1000);
    expect((await sql.query("select count(*)::int as n from public.alerts where details->>'rapport_id'=$1", [rapportId])).rows[0].n).toBe(1);
    expect((await sql.query("select details->>'resultat' as resultat from public.tech_log where details->>'rapport_id'=$1 order by created_at", [rapportId])).rows.map(r => r.resultat)).toEqual(["echec", "accepte_prestataire"]);
  });
});
