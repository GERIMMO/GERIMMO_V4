/**
 * Petites reprises du lot T2 (T2R-7) — ARGENT : le premier terme imprimé au bail est l'appel de loyer créé en base.
 *
 * Le lot T2 imprime au bail le premier terme au prorata (`calculPremiereEcheance` : loyer et charges proratisés et arrondis
 * CHACUN au centime, puis additionnés). Sa grille de 5 472 cas comparait ce calcul à un témoin écrit en JavaScript, pas à la
 * base. Ce test crée de vrais baux actifs et laisse `generer_appels_loyer_interne` créer leurs appels : le premier appel doit
 * porter, ligne à ligne, le loyer, les charges et le total que le bail imprime — et le même drapeau « prorata ».
 *
 * 472 baux : chaque jour d'entrée de février 2024 (29 jours), février 2025 (28), avril 2026 (30) et octobre 2026 (31) ;
 * trois couples loyer/charges en provisions (dont deux aux centimes impairs) et un en forfait.
 * Nécessite SUPABASE_DB_URL ; tout se passe dans une transaction annulée après chaque test (aucun DDL : pas de mise en série).
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { contexte } from "./fixtures/contexte-document";
import { Fusion } from "@/lib/documents/gabarit";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { calculPremiereEcheance } from "@/lib/documents/modeles/mentions-location";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const MOIS: [number, number, number][] = [[2024, 2, 29], [2025, 2, 28], [2026, 4, 30], [2026, 10, 31]];
const MONTANTS: [number, number, "provision" | "forfait"][] = [[650, 90, "provision"], [650.5, 50.5, "provision"], [733.37, 33.33, "provision"], [650.5, 50.5, "forfait"]];

/** Le montant que le bail imprime pour le premier terme : celui du prorata s'il y en a un, sinon la période complète. */
function premierTermeImprime(loyer: number, charges: number, debut: string, mode: string): number {
  const ctx = contexte();
  Object.assign(ctx.bail, { loyer_hc: loyer, charges, date_debut: debut, charges_mode: mode });
  const texte = construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }).html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/[  ]/g, " ");
  const imprime = texte.match(/premier terme est dû au prorata[^:]*: ([\d ]+,\d\d) €/)?.[1] ?? texte.match(/période complète de location : ([\d ]+,\d\d) €/)?.[1];
  if (!imprime) throw new Error(`premier terme introuvable dans le bail (${debut}, ${loyer} + ${charges})`);
  return Number(imprime.replace(/ /g, "").replace(",", "."));
}

describe.skipIf(!url)("T2R-7 — le premier terme imprimé au bail est l'appel de loyer créé par la base (avec base)", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });

  it("472 baux actifs, entrée chaque jour de quatre mois de 28 à 31 jours : zéro écart, ligne à ligne", { timeout: 300_000 }, async () => {
    const un = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0];
    const org = (await un("insert into public.organizations(name,type,status) values ('ESSAI T2R-7','proprietaire_direct','active') returning id", [])).id;
    const bien = (await un("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'ESSAI','appartement','1 rue des Essais','75001','Paris') returning id", [org])).id;
    const locataire = (await un("insert into public.persons(organization_id,nom,prenom) values($1,'ESSAI','Locataire') returning id", [org])).id;
    const ecarts: string[] = [];
    let baux = 0, proratas = 0;
    for (const [annee, mois, jours] of MOIS) for (let jour = 1; jour <= jours; jour++) for (const [loyer, charges, mode] of MONTANTS) {
      const debut = `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
      const lot = (await un("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id", [org, bien, `Lot ${baux}`])).id;
      const bail = (await un("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,charges_mode,date_debut,jour_echeance,locataire_principal) values($1,$2,$3,'actif',$4,$5,$6,$7,5,$8) returning id",
        [org, lot, mode === "forfait" ? "colocation" : "nu", loyer, charges, mode, debut, locataire])).id;
      await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
      const appel = await un("select to_char(periode,'YYYY-MM') as mois, loyer_hc::float8 as loyer, charges::float8 as charges, montant_du::float8 as total, prorata from public.appels_loyer where bail_id=$1 order by periode limit 1", [bail]);
      baux++;
      if (!appel) { ecarts.push(`${debut} ${loyer}+${charges} (${mode}) : aucun appel créé`); continue; }
      const calcul = calculPremiereEcheance(loyer, charges, debut);
      const attendu = calcul.prorata ?? calcul.complet;
      if (calcul.prorata) proratas++;
      const imprime = premierTermeImprime(loyer, charges, debut, mode);
      const ok = appel.mois === debut.slice(0, 7) && appel.loyer === attendu.loyer && appel.charges === attendu.charges && appel.total === attendu.total
        && imprime === appel.total && appel.prorata === (calcul.prorata !== null);
      if (!ok) ecarts.push(`${debut} ${loyer}+${charges} (${mode}) : appel ${appel.mois} ${appel.loyer}+${appel.charges}=${appel.total} prorata=${appel.prorata} ; bail ${attendu.loyer}+${attendu.charges}=${attendu.total}, imprimé ${imprime}`);
    }
    expect(ecarts).toEqual([]);
    // Le test n'est pas muet : tous les baux ont été comparés, et la plupart ont un vrai prorata (entrée après le 1er).
    expect(baux).toBe(472);
    expect(proratas).toBe(472 - 4 * MONTANTS.length);
  });

  it("témoin chiffré : 650,50 € + 50,50 €, entrée le 15 novembre 2026 → 16 jours sur 30, appel de 373,86 €, comme au bail", async () => {
    {
      const un = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0];
      const org = (await un("insert into public.organizations(name,type,status) values ('ESSAI T2R-7 témoin','proprietaire_direct','active') returning id", [])).id;
      const bien = (await un("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'ESSAI','appartement','1 rue des Essais','75001','Paris') returning id", [org])).id;
      const locataire = (await un("insert into public.persons(organization_id,nom,prenom) values($1,'ESSAI','Locataire') returning id", [org])).id;
      const lot = (await un("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot témoin','loue') returning id", [org, bien])).id;
      const bail = (await un("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,charges_mode,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',650.5,50.5,'provision','2026-11-15',5,$3) returning id", [org, lot, locataire])).id;
      await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
      const appel = await un("select loyer_hc::float8 as loyer, charges::float8 as charges, montant_du::float8 as total, prorata from public.appels_loyer where bail_id=$1 order by periode limit 1", [bail]);
      expect(appel).toEqual({ loyer: 346.93, charges: 26.93, total: 373.86, prorata: true });
      expect(premierTermeImprime(650.5, 50.5, "2026-11-15", "provision")).toBe(373.86);
    }
  });
});
