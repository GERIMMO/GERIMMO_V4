/**
 * Audit gestion du 29/09 : une agence ne loue ni n'encaisse sans mandat en
 * cours sur le lot (controler_mise_en_location, encaissement_exige_mandat).
 * Les bancs qui encaissent ou activent un bail d'agence posent donc un mandat
 * actif couvrant le lot — écrit en administration, déclencheurs suspendus le
 * temps de l'insertion (la mécanique du mandat a ses propres tests).
 */
type Requetable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Couvre par un mandat actif le lot désigné (id de lot ou id de bail). */
export async function couvrirParMandat(db: Requetable, bailOuLot: string): Promise<void> {
  const {
    rows: [{ role }],
  } = await db.query("select current_user::text as role");
  await db.query("reset role");
  await db.query("set session_replication_role = replica");
  try {
    await db.query(
      `with l as (
         select l.id, l.organization_id from public.lots l
          where l.id = coalesce((select b.lot_id from public.baux b where b.id = $1), $1)
            and not public.lot_couvert_par_mandat(l.id)
       ), p as (
         insert into public.persons (organization_id, nom, prenom)
         select organization_id, 'Mandant', 'Banc' from l returning id, organization_id
       ), m as (
         insert into public.mandats (organization_id, person_id, etat, date_debut)
         select organization_id, id, 'actif', current_date from p returning id, organization_id
       )
       insert into public.mandat_lignes (organization_id, mandat_id, lot_id, date_debut)
       select m.organization_id, m.id, l.id, current_date from m cross join l`,
      [bailOuLot]
    );
  } finally {
    await db.query("set session_replication_role = origin");
    if (role !== "postgres") await db.query(`set local role ${role}`);
  }
}
