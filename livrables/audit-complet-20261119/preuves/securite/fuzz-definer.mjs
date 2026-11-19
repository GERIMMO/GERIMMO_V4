// Sonde d'autorisation : chaque fonction SECURITY DEFINER exécutable par `authenticated`, appelée par un
// compte étranger avec les identifiants d'une autre organisation. Tout est annulé (ROLLBACK). Banc fictif uniquement.
import pg from '/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/complet/wt/app/node_modules/pg/lib/index.js';
import fs from 'node:fs';
const DB = process.env.FUZZ_DB; if (!/127\.0\.0\.1.*gerimmo_ci_/.test(DB)) throw new Error('banc local uniquement');
const [ATT_UID, ATT_SESSION, ATT_ORG, VICT_ORG, LABEL] = process.argv.slice(2);
const c = new pg.Client({ connectionString: DB }); await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const fns = await q(`select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) ident, p.proargnames names, p.proargtypes::regtype[]::text[] types, p.proargmodes modes, p.provolatile vol, pg_get_function_result(p.oid) res
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 2`);
const tables = new Set((await q(`select table_name from information_schema.columns where table_schema='public' and column_name='organization_id'`)).map(r => r.table_name));
const cand = { bail:['baux'], lot:['lots'], bien:['biens'], doc:['documents'], document:['documents'], justificatif:['documents'], edl:['etats_des_lieux'], restitution:['restitutions'], retenue:['retenues'],
  intervention:['interventions'], sollicitation:['sollicitations','demandes_devis'], appel:['appels_loyer','appels_charges'], rapport:['rapports_gestion'], mandat:['mandats'], ligne:['bail_personnes'], demande:['demandes_signature','demandes_pieces'],
  artisan:['artisans'], reprise:['reprises'], person:['persons'], personne:['persons'], locataire:['persons'], societe:['persons'], incident:['incidents'], quittance:['quittances'], encaissement:['encaissements'], fourniture:['factures_fourniture','contrats_fourniture'],
  facture:['factures_fourniture','factures_artisan'], compteur:['compteurs'], releve:['releves'], cle:['cles_repartition'], circuit:['bail_signature_circuits'], devis:['devis'], creneau:['intervention_creneaux'], conge:['conges'], plan:['plans_apurement'], echeance:['echeanciers_charges'], depense:['depenses'], invitation:['invitations_locataires'], piece:['documents'], alerte:['alertes'], message:['messages'], fil:['fils_messages'], remplacant:['persons'] };
const ids = {};
async function idPour(nom) {
  const cle = nom.replace(/^p_/, '').replace(/_id$/, '');
  if (ids[cle] !== undefined) return ids[cle];
  for (const t of (cand[cle] || [])) { if (!tables.has(t)) continue; const r = await q(`select id from public.${t} where organization_id=$1 limit 1`, [VICT_ORG]).catch(() => []); if (r[0]) return (ids[cle] = r[0].id); }
  return (ids[cle] = null);
}
const enums = Object.fromEntries((await q(`select t.typname, (array_agg(e.enumlabel order by e.enumsortorder))[1] v from pg_type t join pg_enum e on e.enumtypid=t.oid group by 1`)).map(r => [r.typname, r.v]));
async function valeur(nom, type) {
  if (type === 'uuid') { if (nom === 'p_org' || nom === 'p_organization' || nom === 'p_organisation') return VICT_ORG; const v = await idPour(nom); return v ?? '00000000-0000-4000-8000-000000000001'; }
  if (type === 'uuid[]') { const v = await idPour(nom.replace(/s$/, '')); return v ? [v] : []; }
  if (/^(integer|smallint|bigint)$/.test(type)) return /annee|exercice/.test(nom) ? 2026 : 1;
  if (type === 'numeric') return 1; if (type === 'boolean') return false; if (type === 'date') return /mois/.test(nom) ? '2026-11-01' : '2026-11-19';
  if (/timestamp/.test(type)) return '2026-11-19T10:00:00Z'; if (type === 'jsonb' || type === 'json') return /lignes|compteurs|cles/.test(nom) ? [] : {};
  if (type === 'text') return 'sonde'; if (type === 'text[]') return []; if (enums[type]) return enums[type];
  return null;
}
const resultats = [];
for (const f of fns) {
  const names = f.names || []; const modes = f.modes; const types = f.types;
  const nomsEntree = modes ? names.filter((_, i) => ['i', 'b', 'v'].includes(modes[i])) : names; const entrees = types.map((t, i) => ({ nom: nomsEntree[i] || `a${i}`, type: t }));
  const vals = []; for (const e of entrees) vals.push(await valeur(e.nom, e.type));
  const params = entrees.map((e, i) => `$${i + 1}::${e.type}`).join(',');
  const sql = /SETOF|TABLE/.test(f.res) ? `select count(*)::int n, left(coalesce(json_agg(x)::text,''),300) apercu from public.${f.proname}(${params}) x` : `select 1 n, left(coalesce(to_jsonb(public.${f.proname}(${params}))::text,'null'),300) apercu`;
  let issue, n = null, apercu = '';
  try {
    await c.query('begin'); await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ATT_UID, role: 'authenticated', session_id: ATT_SESSION, aal: 'aal1' })]);
    await c.query(`set local statement_timeout='8s'`);
    const r = await c.query(sql, vals); n = r.rows[0].n; apercu = r.rows[0].apercu; issue = 'ok';
  } catch (e) { issue = 'refus'; apercu = (e.code || '') + ' ' + String(e.message).slice(0, 160); }
  finally { await c.query('rollback').catch(() => {}); }
  resultats.push({ fn: f.proname, args: f.ident, issue, n, apercu, valeurs: entrees.map((e, i) => `${e.nom}=${typeof vals[i] === 'string' && vals[i].length > 30 ? vals[i].slice(0, 8) : JSON.stringify(vals[i])}`).join(' ') });
}
fs.writeFileSync(`${process.env.FUZZ_OUT}/resultats-${LABEL}.json`, JSON.stringify(resultats, null, 1));
const ok = resultats.filter(r => r.issue === 'ok');
const vide = r => r.n === 0 || /^(null|false|\[\]|\{\}|""|0)$/.test(r.apercu) || r.apercu === '';
console.log(`${LABEL}: ${resultats.length} fonctions ; refus ${resultats.length - ok.length} ; succès vides ${ok.filter(vide).length} ; succès NON VIDES ${ok.filter(r => !vide(r)).length}`);
for (const r of ok.filter(r => !vide(r))) console.log(' •', r.fn, '|', r.apercu.replace(/\s+/g, ' ').slice(0, 200));
await c.end();
