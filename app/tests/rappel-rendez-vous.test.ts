/**
 * Tests d'intégration — le rappel de rendez-vous (RM-10.5), 18/09.
 *
 * « Veille systématique, J-7 si posé assez tôt. » Rien ne le portait : ni
 * table, ni tâche. L'écran du locataire l'annonçait ; la phrase a été retirée
 * le 11/09 plutôt que laissée à mentir.
 *
 * Ce que ces tests gardent : les DEUX destinataires sont rappelés (le locataire
 * doit être là, l'artisan doit venir) ; les échéances sont des dates exactes,
 * pas des fenêtres ; un rappel ne part qu'une fois par destinataire ; et la
 * liste ne s'ouvre ni à l'agence, ni au locataire.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let org: string;
let gerant: string;
let intervention: string;
let artisan: string;

type LigneRappel = {
  intervention_id: string;
  echeance: "veille" | "j7";
  destinataire: "locataire" | "artisan";
  adresse: string;
  prenom: string | null;
  emetteur: string;
  artisan: string;
  lot: string;
  adresse_bien: string;
  incident_numero: string;
  categorie: string;
};

const id = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ id: string }>(sql, args)).rows[0].id;

const compte = async (prefixe: string) =>
  id(
    `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
       raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
       email_change,email_change_token_new,email_change_token_current)
     values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`,
    [prefixe]
  );

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : "",
  ]);
  await db.query(`set local role ${role}`);
}

async function aRappeler(): Promise<LigneRappel[]> {
  await simuler(null, "postgres");
  const { rows } = await db.query<LigneRappel>(`select * from public.rendez_vous_a_rappeler(200)`);
  return rows;
}

/** Place le rendez-vous à N jours, à 9 h heure de Paris. */
async function rendezVousDans(jours: number) {
  await db.query("reset role");
  await db.query(
    `update public.incident_interventions
        set debut_prevu = ((now() at time zone 'Europe/Paris')::date + $2::int + time '09:00')
                          at time zone 'Europe/Paris',
            fin_prevue  = ((now() at time zone 'Europe/Paris')::date + $2::int + time '11:00')
                          at time zone 'Europe/Paris'
      where id = $1`,
    [intervention, jours]
  );
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
afterEach(async () => {
  await db.query("rollback");
});

beforeEach(async () => {
  await db.query("begin");
  await db.query("reset role");
  org = await id(
    "insert into public.organizations(name,status,type) values('Rappels','active','agence') returning id"
  );
  gerant = await compte("gerant");
  const compteLocataire = await compte("locataire");
  const compteArtisan = await compte("artisan");
  await db.query(
    `insert into public.memberships(account_id,organization_id,role) values
       ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$2,'artisan')`,
    [gerant, org, compteLocataire, compteArtisan]
  );
  const locataire = await id(
    `insert into public.persons(organization_id,nom,prenom,email,account_id)
     values($1,'Dupont','Marc','marc.dupont@exemple.fr',$2) returning id`,
    [org, compteLocataire]
  );
  const bien = await id(
    `insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
     values($1,'Immeuble Rappel','appartement','9 rue du Rappel','75004','Paris') returning id`,
    [org]
  );
  const lot = await id(
    "insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot 3 — 2e gauche','loue') returning id",
    [org, bien]
  );
  const bail = await id(
    `insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges)
     values($1,$2,$3,'actif',current_date-200,700,50) returning id`,
    [org, lot, locataire]
  );
  const incident = await id(
    `insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,
       canal,categorie,description,etat,imputation,imputation_justification)
     values($1,'INC-RAPPEL-001',$2,$3,$4,'espace_locataire','plomberie_canalisation',
       'Fuite sous évier','qualifie','proprietaire','Joint usé') returning id`,
    [org, lot, bail, locataire]
  );
  artisan = await id(
    `insert into public.artisans(raison_sociale,siret,telephone,email,statut_plateforme,siret_etat,visibilite,account_id)
     values('Plomberie Durand',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000',
       'contact@plomberie-durand.fr','valide','verifie','publique',$1) returning id`,
    [compteArtisan]
  );
  intervention = await id(
    `insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut)
     values($1,$2,$3,'entretien_courant','planifiee') returning id`,
    [org, incident, artisan]
  );
  await rendezVousDans(1);
});

describe.skipIf(!DB_URL)("qui est rappelé, et quand", () => {
  it("rappelle les DEUX : celui qui doit être là et celui qui doit venir", async () => {
    const lignes = await aRappeler();
    expect(lignes.map((l) => l.destinataire).sort()).toEqual(["artisan", "locataire"]);
    expect(lignes.every((l) => l.echeance === "veille")).toBe(true);
    const locataire = lignes.find((l) => l.destinataire === "locataire")!;
    expect(locataire.adresse).toBe("marc.dupont@exemple.fr");
    expect(locataire.prenom).toBe("Marc");
    const art = lignes.find((l) => l.destinataire === "artisan")!;
    expect(art.adresse).toBe("contact@plomberie-durand.fr");
    // Chacun reçoit de quoi se rendre au bon endroit, sous le bon dossier.
    expect(art.lot).toBe("Lot 3 — 2e gauche");
    expect(art.adresse_bien).toBe("9 rue du Rappel");
    expect(art.incident_numero).toBe("INC-RAPPEL-001");
  });

  it("rappelle aussi à sept jours, quand le rendez-vous est posé assez tôt", async () => {
    await rendezVousDans(7);
    const lignes = await aRappeler();
    expect(lignes.length).toBe(2);
    expect(lignes.every((l) => l.echeance === "j7")).toBe(true);
  });

  it("ne dit rien les autres jours : ce sont des dates, pas des fenêtres", async () => {
    // Un message « demain » envoyé à J-3 serait faux, et un rappel faux est
    // pire que pas de rappel.
    for (const jours of [0, 2, 3, 6, 8, 30]) {
      await rendezVousDans(jours);
      expect(await aRappeler()).toEqual([]);
    }
  });

  it("ne rappelle pas un rendez-vous annulé ou refusé", async () => {
    for (const statut of ["annulee", "refusee"]) {
      await db.query("reset role");
      await db.query(
        `update public.incident_interventions
            set statut = $2::public.intervention_statut,
                refus_motif = case when $2 = 'refusee' then 'Indisponible' else refus_motif end
          where id=$1`,
        [intervention, statut]
      );
      expect(await aRappeler()).toEqual([]);
    }
  });

  it("ne rappelle pas une intervention déjà terminée", async () => {
    // Elle ne peut l'être qu'avec son compte rendu (RM-7.5.1) : le chemin du
    // test est celui du produit, on ne force pas l'état à la main.
    await db.query("reset role");
    await db.query(
      `insert into public.intervention_comptes_rendus
         (organization_id,intervention_id,artisan_id,travaux_realises,montant_final_cents)
       values($1,$2,$3,'Joint remplacé',9000)`,
      [org, intervention, artisan]
    );
    // Et sa photo (RM-7.5.2) : les deux pièces conditionnent la facturation.
    const photo = await id(
      `insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
       values($1::uuid,'photo_incident','Après travaux',$1::text||'/rappel/photo.png','image/png',10,'rappel-photo')
       returning id`,
      [org]
    );
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [
      `${org}/rappel/photo.png`,
    ]);
    await db.query(
      `insert into public.intervention_photos(organization_id,intervention_id,document_id,moment)
       values($1,$2,$3,'apres')`,
      [org, intervention, photo]
    );
    await db.query(
      `update public.incident_interventions
          set statut='terminee'::public.intervention_statut, terminee_le=now() where id=$1`,
      [intervention]
    );
    expect(await aRappeler()).toEqual([]);
  });

  it("ne rappelle pas une mission sans date", async () => {
    await db.query("reset role");
    await db.query(
      `update public.incident_interventions set debut_prevu=null, fin_prevue=null where id=$1`,
      [intervention]
    );
    expect(await aRappeler()).toEqual([]);
  });

  it("n'écrit plus rien pour une agence suspendue", async () => {
    const sa = await compte("sa");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
      [sa]
    );
    await simuler(sa);
    await db.query(
      `update public.organizations set status='suspendue'::public.organization_status where id=$1`,
      [org]
    );
    expect(await aRappeler()).toEqual([]);
  });

  it("saute le destinataire sans adresse sans priver l'autre du sien", async () => {
    // C'est la raison d'être du suivi par destinataire : l'adresse fausse de
    // l'un ne doit pas faire manquer son rendez-vous à l'autre.
    await db.query("reset role");
    await db.query(`update public.artisans set email=null where email='contact@plomberie-durand.fr'`);
    const lignes = await aRappeler();
    expect(lignes.length).toBe(1);
    expect(lignes[0].destinataire).toBe("locataire");
  });
});

describe.skipIf(!DB_URL)("un rappel, une fois", () => {
  async function tracer(l: LigneRappel) {
    await simuler(null, "postgres");
    const {
      rows: [{ marquer_rappel_envoye: pose }],
    } = await db.query<{ marquer_rappel_envoye: boolean }>(
      `select public.marquer_rappel_envoye($1,$2,$3,$4)`,
      [l.intervention_id, l.echeance, l.destinataire, l.adresse]
    );
    return pose;
  }

  it("une fois tracé, le destinataire sort de la liste — l'autre y reste", async () => {
    const lignes = await aRappeler();
    const locataire = lignes.find((l) => l.destinataire === "locataire")!;
    expect(await tracer(locataire)).toBe(true);
    const restantes = await aRappeler();
    expect(restantes.length).toBe(1);
    expect(restantes[0].destinataire).toBe("artisan");
  });

  it("deux passes qui se chevauchent ne doublent pas la trace", async () => {
    const [ligne] = await aRappeler();
    expect(await tracer(ligne)).toBe(true);
    expect(await tracer(ligne)).toBe(false);
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*) as n from public.intervention_rappels where intervention_id=$1`,
      [ligne.intervention_id]
    );
    expect(Number(n)).toBe(1);
  });

  it("le rappel de la veille reste dû quand celui de J-7 est déjà parti", async () => {
    await rendezVousDans(7);
    for (const l of await aRappeler()) expect(await tracer(l)).toBe(true);
    await rendezVousDans(1);
    const veille = await aRappeler();
    expect(veille.length).toBe(2);
    expect(veille.every((l) => l.echeance === "veille")).toBe(true);
  });
});

describe.skipIf(!DB_URL)("la liste est réservée à la tâche", () => {
  // Première barrière : le droit d'exécution est retiré à `authenticated`, si
  // bien que le refus tombe avant l'entrée dans la fonction. La garde du corps
  // sert au cran d'après. On vérifie le refus, pas sa formulation.
  const refuse = /permission denied|reserve a la tache/i;

  it("même le gérant de l'agence ne peut pas la lire", async () => {
    await simuler(gerant);
    await expect(db.query(`select * from public.rendez_vous_a_rappeler(200)`)).rejects.toThrow(
      refuse
    );
  });

  it("ni tracer un rappel à la place de la tâche", async () => {
    const [ligne] = await aRappeler();
    await simuler(gerant);
    await expect(
      db.query(`select public.marquer_rappel_envoye($1,$2,$3,$4)`, [
        ligne.intervention_id,
        ligne.echeance,
        ligne.destinataire,
        ligne.adresse,
      ])
    ).rejects.toThrow(refuse);
  });

  it("le gérant voit en revanche la trace de ses propres rappels", async () => {
    // Il en a besoin : face à un rendez-vous manqué, la première question est
    // de savoir si le rappel est bien parti.
    const [ligne] = await aRappeler();
    await simuler(null, "postgres");
    await db.query(`select public.marquer_rappel_envoye($1,$2,$3,$4)`, [
      ligne.intervention_id,
      ligne.echeance,
      ligne.destinataire,
      ligne.adresse,
    ]);
    await simuler(gerant);
    const { rows } = await db.query(
      `select destinataire, adresse from public.intervention_rappels where intervention_id=$1`,
      [ligne.intervention_id]
    );
    expect(rows.length).toBe(1);
  });
});
