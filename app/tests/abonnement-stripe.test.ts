/**
 * L'encaissement : ce que Stripe dit, et ce que ça fait au compte.
 *
 * LA TRADUCTION EST LE CŒUR MÉTIER. C'est elle qui décide quand un client perd
 * l'usage de son outil de travail — on la teste donc cas par cas, en nommant à
 * chaque fois la conséquence humaine, et pas seulement la valeur attendue.
 *
 * LE TEST LE PLUS IMPORTANT DU FICHIER est celui de l'impasse : un compte
 * fermé faute de paiement doit pouvoir enregistrer le paiement qui le rouvre.
 * Toute table portant `organization_id` est gardée par le refus d'écriture des
 * comptes suspendus ; appliquée aux tables d'abonnement, cette garde ferait une
 * boucle parfaite, invisible jusqu'au premier client qui paie.
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
let client: string;

async function creerOrg(statut: string, essai: "hier" | "demain" | null = null): Promise<string> {
  const date = essai === "hier" ? "current_date - 1" : essai === "demain" ? "current_date + 1" : "null";
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, essai_fin)
     values ('Encaissement', $1::public.organization_status, ${date}) returning id`,
    [statut]
  );
  return id;
}

async function poserClient(o: string, c: string) {
  await db.query(
    `insert into public.abonnements (organization_id, stripe_customer_id) values ($1,$2)`,
    [o, c]
  );
}

/** Applique un état Stripe et rend le statut d'organisation qui en résulte. */
async function appliquer(
  c: string,
  statut: string,
  options: { quantite?: number; annulation?: boolean; souscription?: string } = {}
): Promise<string | null> {
  const { rows } = await db.query<{ organization_id: string | null }>(
    `select public.abonnement_appliquer($1,$2,$3,$4,$5,$6) as organization_id`,
    [
      c,
      options.souscription ?? `sub_${Math.random().toString(36).slice(2, 12)}`,
      statut,
      options.quantite ?? 2,
      new Date("2026-10-15T00:00:00Z").toISOString(),
      options.annulation ?? false,
    ]
  );
  const o = rows[0].organization_id;
  if (!o) return null;
  const { rows: r2 } = await db.query<{ status: string }>(
    "select status::text from public.organizations where id = $1",
    [o]
  );
  return r2[0].status;
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
  org = await creerOrg("essai", "demain");
  client = `cus_${Math.random().toString(36).slice(2, 12)}`;
  await poserClient(org, client);
});

describe("Ce que Stripe dit, et ce que ça fait au compte", () => {
  it("« active » ouvre le compte", async () => {
    expect(await appliquer(client, "active")).toBe("active");
  });

  it("« trialing » ouvre le compte : la carte est posée, l'essai court", async () => {
    expect(await appliquer(client, "trialing")).toBe("active");
  });

  it("« past_due » NE FERME RIEN — Stripe relance, une carte expirée n'est pas un impayé", async () => {
    await appliquer(client, "active");
    // Le prélèvement échoue. Couper ici ferait perdre sa journée à une agence
    // pour une raison qu'elle ignore encore : sa banque a refusé.
    expect(await appliquer(client, "past_due")).toBe("active");
  });

  it("« past_due » se voit dans l'écran, sans fermer", async () => {
    await appliquer(client, "past_due");
    const { rows } = await db.query<{ stripe_statut: string }>(
      "select stripe_statut from public.abonnements where organization_id = $1",
      [org]
    );
    expect(rows[0].stripe_statut).toBe("past_due");
  });

  it("« canceled » ferme, une fois l'essai terminé", async () => {
    const fini = await creerOrg("active", "hier");
    const c = `cus_${Math.random().toString(36).slice(2, 12)}`;
    await poserClient(fini, c);
    expect(await appliquer(c, "canceled")).toBe("suspendue");
  });

  it("« canceled » pendant l'essai retombe en essai, pas en suspendue", async () => {
    // Elle n'a jamais payé et son essai n'est pas fini : fermer là serait lui
    // reprendre un droit acquis.
    expect(await appliquer(client, "canceled")).toBe("essai");
  });

  it("« unpaid » et « incomplete_expired » ferment comme « canceled »", async () => {
    const fini = await creerOrg("active", "hier");
    const c1 = `cus_a${Math.random().toString(36).slice(2, 10)}`;
    await poserClient(fini, c1);
    expect(await appliquer(c1, "unpaid")).toBe("suspendue");

    const fini2 = await creerOrg("active", "hier");
    const c2 = `cus_b${Math.random().toString(36).slice(2, 10)}`;
    await poserClient(fini2, c2);
    expect(await appliquer(c2, "incomplete_expired")).toBe("suspendue");
  });

  it("« incomplete » ne touche à rien : la première carte n'est pas confirmée", async () => {
    expect(await appliquer(client, "incomplete")).toBe("essai");
  });

  it("une organisation ARCHIVÉE n'est jamais réveillée par un paiement", async () => {
    const archivee = await creerOrg("archivee");
    const c = `cus_${Math.random().toString(36).slice(2, 12)}`;
    await poserClient(archivee, c);
    // L'archivage est un geste humain. Aucun événement de facturation ne le
    // défait — au pire, quelqu'un a payé pour un compte qu'il a fait fermer.
    expect(await appliquer(c, "active")).toBe("archivee");
  });

  it("un changement de statut laisse une trace au journal d'audit", async () => {
    await appliquer(client, "active");
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.audit_log
        where organization_id = $1 and action = 'abonnement_statut'`,
      [org]
    );
    expect(rows[0].n).toBe("1");
  });

  it("un client inconnu ne fait pas d'erreur : il n'y a rien à rejouer", async () => {
    // Lever ici ferait rendre 500 au webhook, et Stripe rejouerait l'événement
    // indéfiniment — pour un client qui n'est pas le nôtre.
    const { rows } = await db.query<{ o: string | null }>(
      `select public.abonnement_appliquer('cus_inconnu','sub_x','active',1,now(),false) as o`
    );
    expect(rows[0].o).toBeNull();
  });
});

describe("L'impasse du compte fermé", () => {
  it("un compte SUSPENDU peut encore enregistrer son paiement", async () => {
    // LE test du fichier. Si `abonnements` était gardée comme les autres tables
    // à `organization_id`, cette écriture serait refusée — le client ne
    // pourrait pas payer parce qu'il n'a pas payé, et le défaut ne se verrait
    // qu'en production, au premier encaissement.
    const ferme = await creerOrg("suspendue");
    const c = `cus_${Math.random().toString(36).slice(2, 12)}`;
    await poserClient(ferme, c);
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.abonnements where organization_id = $1",
      [ferme]
    );
    expect(rows[0].n, "la garde d'abonnement a repris les tables d'abonnement").toBe("1");
    expect(await appliquer(c, "active")).toBe("active");
  });

  it("le journal des événements s'écrit aussi sur un compte fermé", async () => {
    const ferme = await creerOrg("suspendue");
    const c = `cus_${Math.random().toString(36).slice(2, 12)}`;
    await poserClient(ferme, c);
    await db.query(
      `insert into public.abonnement_evenements (stripe_event_id, type, organization_id)
       values ('evt_ferme','customer.subscription.updated',$1)`,
      [ferme]
    );
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.abonnement_evenements where stripe_event_id='evt_ferme'"
    );
    expect(rows[0].n).toBe("1");
  });
});

describe("Les webhooks ne se rejouent pas deux fois — mais se rejouent quand il faut", () => {
  it("le premier passage est nouveau, le second ne l'est pas", async () => {
    const { rows: a } = await db.query<{ n: boolean }>(
      `select public.abonnement_evenement_a_traiter('evt_1','customer.subscription.updated',null) as n`
    );
    expect(a[0].n).toBe(true);
    const { rows: b } = await db.query<{ n: boolean }>(
      `select public.abonnement_evenement_a_traiter('evt_1','customer.subscription.updated',null) as n`
    );
    expect(b[0].n).toBe(false);
  });

  it("un traitement RATÉ efface sa trace : la relance de Stripe doit aboutir", async () => {
    // Le piège de tout dédoublonnage. Sans cet effacement, l'échec d'un
    // traitement rendrait la relance indistinguable d'un doublon : l'événement
    // serait perdu pour toujours, et le compte resterait fermé alors que le
    // client a payé.
    await db.query(
      `select public.abonnement_evenement_a_traiter('evt_2','customer.subscription.updated',null)`
    );
    await db.query(`select public.abonnement_evenement_rejouable('evt_2')`);
    const { rows } = await db.query<{ n: boolean }>(
      `select public.abonnement_evenement_a_traiter('evt_2','customer.subscription.updated',null) as n`
    );
    expect(rows[0].n).toBe(true);
  });

  it("un traitement RÉUSSI garde sa trace, même si on demande à le rejouer", async () => {
    await db.query(
      `select public.abonnement_evenement_a_traiter('evt_3','customer.subscription.updated',null)`
    );
    await db.query(`select public.abonnement_evenement_solde('evt_3', null)`);
    await db.query(`select public.abonnement_evenement_rejouable('evt_3')`);
    const { rows } = await db.query<{ n: boolean }>(
      `select public.abonnement_evenement_a_traiter('evt_3','customer.subscription.updated',null) as n`
    );
    expect(rows[0].n).toBe(false);
  });
});

describe("La quantité suit le parc", () => {
  async function bien(o: string): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1, 'Bien '||gen_random_uuid(), 'appartement'::public.bien_type, '1 rue X','75001','Paris')
       returning id`,
      [o]
    );
    return id;
  }

  it("le premier bien est offert : la quantité à facturer reste nulle", async () => {
    await bien(org);
    const { rows } = await db.query<{ q: number }>(
      "select public.abonnement_quantite_cible($1) as q",
      [org]
    );
    expect(rows[0].q).toBe(0);
  });

  it("le deuxième bien se facture", async () => {
    await bien(org);
    await bien(org);
    const { rows } = await db.query<{ q: number }>(
      "select public.abonnement_quantite_cible($1) as q",
      [org]
    );
    expect(rows[0].q).toBe(1);
  });

  it("ajouter un bien lève le drapeau de resynchronisation", async () => {
    await db.query(
      "update public.abonnements set stripe_subscription_id='sub_q', a_resynchroniser=false where organization_id=$1",
      [org]
    );
    await bien(org);
    const { rows } = await db.query<{ a: boolean }>(
      "select a_resynchroniser as a from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].a).toBe(true);
  });

  it("sans souscription, aucun drapeau : il n'y a rien à aligner", async () => {
    await bien(org);
    const { rows } = await db.query<{ a: boolean }>(
      "select a_resynchroniser as a from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].a).toBe(false);
  });

  it("la file de synchronisation nomme l'écart, pas seulement la ligne", async () => {
    await db.query(
      "update public.abonnements set stripe_subscription_id='sub_f', quantite=0 where organization_id=$1",
      [org]
    );
    await bien(org);
    await bien(org);
    await bien(org);
    const { rows } = await db.query<{
      organization_id: string;
      quantite_posee: number;
      quantite_cible: number;
    }>("select * from public.abonnements_a_synchroniser(50) where organization_id = $1", [org]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantite_posee).toBe(0);
    expect(rows[0].quantite_cible).toBe(2);
  });

  it("une synchronisation en échec laisse le drapeau levé : elle repassera", async () => {
    await db.query(
      "update public.abonnements set stripe_subscription_id='sub_e', quantite=2 where organization_id=$1",
      [org]
    );
    await db.query("select public.abonnement_synchro_faite($1, 5, 'Stripe injoignable')", [org]);
    const { rows } = await db.query<{ a: boolean; q: number; e: string }>(
      "select a_resynchroniser as a, quantite as q, derniere_erreur as e from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].a).toBe(true);
    // La quantité ne bouge PAS sur un échec : elle dirait que Stripe facture
    // cinq unités alors qu'il en facture deux.
    expect(rows[0].q).toBe(2);
    expect(rows[0].e).toContain("injoignable");
  });

  it("une synchronisation réussie baisse le drapeau et enregistre le montant", async () => {
    await db.query(
      "update public.abonnements set stripe_subscription_id='sub_s', a_resynchroniser=true where organization_id=$1",
      [org]
    );
    await db.query("select public.abonnement_synchro_faite($1, 3, null)", [org]);
    const { rows } = await db.query<{ a: boolean; q: number; m: string }>(
      "select a_resynchroniser as a, quantite as q, montant_mensuel_cents::text as m from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].a).toBe(false);
    expect(rows[0].q).toBe(3);
    expect(rows[0].m).toBe("1797"); // 3 × 5,99 €
  });

  it("une organisation archivée sort de la file : on ne la facture plus", async () => {
    await db.query(
      "update public.abonnements set stripe_subscription_id='sub_a', a_resynchroniser=true where organization_id=$1",
      [org]
    );
    await db.query("select public.tache_systeme()");
    await db.query(
      "update public.organizations set status='archivee'::public.organization_status where id=$1",
      [org]
    );
    await db.query("select set_config('gerimmo.systeme', '', true)");
    const { rows } = await db.query(
      "select 1 from public.abonnements_a_synchroniser(50) where organization_id = $1",
      [org]
    );
    expect(rows).toHaveLength(0);
  });
});

describe("Le client Stripe ne se remplace pas", () => {
  it("un second enregistrement n'écrase pas le premier", async () => {
    // Deux clients pour une même organisation, c'est deux factures et un moyen
    // de paiement orphelin. La fonction est appelée à chaque clic sur
    // « S'abonner » : elle doit être sans effet quand le dossier existe.
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id)
       values ($1,'cus_premier')
       on conflict (organization_id) do update set stripe_customer_id='cus_premier'`,
      [org]
    );
    await db.query(
      `insert into public.abonnements (organization_id, stripe_customer_id) values ($1,'cus_second')
       on conflict (organization_id) do update
       set stripe_customer_id = coalesce(public.abonnements.stripe_customer_id, excluded.stripe_customer_id)`,
      [org]
    );
    const { rows } = await db.query<{ c: string }>(
      "select stripe_customer_id as c from public.abonnements where organization_id=$1",
      [org]
    );
    expect(rows[0].c).toBe("cus_premier");
  });
});

describe("Le passage réservé au système ne s'ouvre pas à un utilisateur", () => {
  it("personne d'autre que la plateforme ne peut lever le drapeau", async () => {
    // `abonnement_appliquer` pose `gerimmo.systeme` pour écrire un statut
    // d'organisation, que le déclencheur réserve au super admin. Ce passage ne
    // vaut que parce qu'AUCUNE fonction atteignable depuis un navigateur ne
    // touche à ce drapeau. Si l'une venait à le faire, n'importe quel client
    // pourrait rouvrir son propre compte — et ce test échoue avant.
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and pg_get_functiondef(p.oid) ilike '%gerimmo.systeme%'
        and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
             or has_function_privilege('anon', p.oid, 'EXECUTE'))
      order by p.proname`);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("un utilisateur connecté ne change pas le statut de son organisation", async () => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: "00000000-0000-0000-0000-000000000001", role: "authenticated" }),
    ]);
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(
        "update public.organizations set status='active'::public.organization_status where id=$1",
        [org]
      );
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    expect(message).toMatch(/super admin/i);
  });
});
