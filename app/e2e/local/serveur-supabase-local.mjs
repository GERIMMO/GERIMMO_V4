// Émulateur Supabase local pour l'E2E hors ligne.
//
// Reproduit le sous-ensemble de l'API Supabase que l'application utilise
// réellement (relevé du 2026-09-10) au-dessus du Postgres local monté par
// preparer-base.sh : auth (mot de passe, session, inscription), REST
// PostgREST-lite (filtres, embeds imbriqués, !fk, !inner, count, single),
// RPC (fonctions SQL réelles), storage (fichiers sur disque + RLS).
//
// Fidélité clé : chaque requête REST s'exécute dans une transaction avec
// `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE` — les politiques
// RLS des migrations s'appliquent donc EXACTEMENT comme en production.
//
// Usage : node e2e/local/serveur-supabase-local.mjs   (port 54321)
// Puis : NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npm run dev

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, types as typesPg } from "pg";

// LES DATES RESTENT DES DATES, comme chez PostgREST.
//
// `pg` convertit d'office une colonne `date` en objet Date JavaScript, qui part
// ensuite en JSON sous la forme « 2026-09-25T00:00:00.000Z ». PostgREST, lui,
// rend « 2026-09-25 » — une date sans heure et sans fuseau, ce qu'elle est.
// L'écart n'est pas cosmétique : le code de l'application construit des
// horodatages en concaténant (`${iso}T00:00:00`), ce qui donne une date
// invalide sur la forme longue. Relevé au navigateur le 11/09 : le bandeau
// d'essai affichait « (NaN jour restants) » sur tout l'espace agence, et
// seulement sur le banc — la production, servie par PostgREST, allait bien.
// Un banc qui ment sur la forme des données fait passer les défauts qu'il
// devrait attraper.
typesPg.setTypeParser(1082, (v) => v); // date
typesPg.setTypeParser(1182, (v) => v); // date[]

const PORT = Number(process.env.SUPALOCAL_PORT ?? 54321);
const DB_URL = process.env.SUPALOCAL_DB ?? "postgres://postgres@127.0.0.1:55432/gerimmo_local";
const SECRET = "gerimmo-local-secret";
const STOCKAGE = process.env.SUPALOCAL_STORAGE ?? "/tmp/gerimmo-storage";

const pool = new Pool({ connectionString: DB_URL, max: 8 });

// ── JWT HS256 minimal ──────────────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function signer(claims) {
  const tete = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = b64u(JSON.stringify(claims));
  const sig = crypto.createHmac("sha256", SECRET).update(`${tete}.${corps}`).digest("base64url");
  return `${tete}.${corps}.${sig}`;
}
function verifier(jeton) {
  try {
    const [t, c, s] = jeton.split(".");
    const attendu = crypto.createHmac("sha256", SECRET).update(`${t}.${c}`).digest("base64url");
    if (s !== attendu) return null;
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    if (claims.exp && claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

// ── Catalogue (clés étrangères, clés primaires, fonctions) ─────────────────
const catalogue = { fks: [], fkParNom: new Map(), pks: new Map(), fns: new Map() };
async function chargerCatalogue() {
  const { rows: fks } = await pool.query(`
    select c.conname as nom,
           tf.relname as table_source,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols_source,
           tr.relname as table_cible,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as cols_cible
    from pg_constraint c
    join pg_class tf on tf.oid = c.conrelid
    join pg_class tr on tr.oid = c.confrelid
    join pg_namespace n on n.oid = tf.relnamespace
    where c.contype = 'f' and n.nspname in ('public', 'storage', 'auth')`);
  catalogue.fks = fks;
  catalogue.fkParNom = new Map(fks.map((f) => [f.nom, f]));
  const { rows: pks } = await pool.query(`
    select t.relname as table_nom,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'p' and n.nspname = 'public'`);
  catalogue.pks = new Map(pks.map((p) => [p.table_nom, p.cols]));
  const { rows: fns } = await pool.query(`
    select p.proname as nom, p.proretset as retourne_set,
           format_type(p.prorettype, null) as type_retour,
           coalesce(p.proargnames, '{}')::text[] as arg_noms,
           (select array_agg(format_type(t.t, null) order by t.ord)
              from unnest(p.proargtypes) with ordinality t(t, ord)) as arg_types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'`);
  for (const f of fns) if (!catalogue.fns.has(f.nom)) catalogue.fns.set(f.nom, f);
}

// Trouve la relation entre deux tables (ou par nom explicite de contrainte).
// Rend { direction: 'un' (parent porte la FK → objet) | 'plusieurs' (la table
// embarquée porte la FK → tableau), colsParent, colsEmbed }.
function resoudreRelation(tableParent, tableEmbed, fkNom) {
  const candidats = fkNom
    ? [catalogue.fkParNom.get(fkNom)].filter(Boolean)
    : catalogue.fks.filter(
        (f) =>
          (f.table_source === tableParent && f.table_cible === tableEmbed) ||
          (f.table_source === tableEmbed && f.table_cible === tableParent),
      );
  if (!candidats.length) throw erreurRest(400, "PGRST200", `Relation introuvable entre ${tableParent} et ${tableEmbed}${fkNom ? ` via ${fkNom}` : ""}`);
  if (!fkNom && candidats.length > 1) {
    // Plusieurs FK : PostgREST exige la désambiguïsation — comme lui, on refuse.
    throw erreurRest(400, "PGRST201", `Relation ambiguë entre ${tableParent} et ${tableEmbed} : préciser !fk`);
  }
  const fk = candidats[0];
  if (fk.table_source === tableParent && fk.table_cible === tableEmbed) {
    return { direction: "un", colsParent: fk.cols_source, colsEmbed: fk.cols_cible };
  }
  return { direction: "plusieurs", colsParent: fk.cols_cible, colsEmbed: fk.cols_source };
}

// ── Analyseur du paramètre select (syntaxe PostgREST) ──────────────────────
function decouperNiveauZero(s, sep = ",") {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}
function analyserSelect(sel) {
  const arbre = [];
  for (let brut of decouperNiveauZero(sel.replace(/\s+/g, ""))) {
    if (!brut) continue;
    const parIdx = brut.indexOf("(");
    if (parIdx === -1) {
      let alias = null, nom = brut;
      const i = brut.indexOf(":");
      if (i > -1) { alias = brut.slice(0, i); nom = brut.slice(i + 1); }
      arbre.push({ type: "col", nom, alias });
    } else {
      const tete = brut.slice(0, parIdx);
      const interieur = brut.slice(parIdx + 1, brut.lastIndexOf(")"));
      let alias = null, reste = tete;
      const i = tete.indexOf(":");
      if (i > -1) { alias = tete.slice(0, i); reste = tete.slice(i + 1); }
      const morceaux = reste.split("!");
      const table = morceaux[0];
      let fk = null, inner = false;
      for (const m of morceaux.slice(1)) {
        if (m === "inner") inner = true;
        else fk = m;
      }
      arbre.push({ type: "embed", table, alias: alias ?? table, fk, inner, enfants: analyserSelect(interieur) });
    }
  }
  return arbre.length ? arbre : [{ type: "col", nom: "*", alias: null }];
}

// ── Filtres PostgREST ──────────────────────────────────────────────────────
const OPS = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "like", ilike: "ilike",
};
function litValeurIn(v) {
  // in.(a,b,"c d") → liste de valeurs
  const corps = v.replace(/^\(/, "").replace(/\)$/, "");
  return decouperNiveauZero(corps).map((x) => {
    const t = x.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  });
}
// Rend { sql, params } pour un filtre (col, expression) — expression du type
// eq.5 | not.eq.5 | is.null | in.(a,b) | ilike.*x*
function traduireFiltre(col, expr, params, prefixe = "") {
  let neg = false;
  let e = expr;
  if (e.startsWith("not.")) { neg = true; e = e.slice(4); }
  const p = e.indexOf(".");
  const op = p === -1 ? e : e.slice(0, p);
  const val = p === -1 ? "" : e.slice(p + 1);
  const colonne = `${prefixe}"${col}"`;
  let sql;
  if (op === "is") {
    const v = val.toLowerCase();
    sql = v === "null" ? `${colonne} is null` : `${colonne} is ${v === "true" ? "true" : "false"}`;
  } else if (op === "in") {
    const liste = litValeurIn(val);
    if (!liste.length) sql = "false";
    else {
      params.push(liste);
      sql = `${colonne} = any($${params.length})`;
    }
  } else if (OPS[op]) {
    let v = val;
    if (op === "like" || op === "ilike") v = v.replace(/\*/g, "%");
    params.push(v);
    sql = `${colonne} ${OPS[op]} $${params.length}`;
  } else if (op === "cs") {
    params.push(val);
    sql = `${colonne} @> $${params.length}`;
  } else {
    throw erreurRest(400, "PGRST100", `Opérateur de filtre non géré : ${op}`);
  }
  return neg ? `not (${sql})` : sql;
}
// or=(cond,cond,and(cond,cond)) — conditions col.op.val
function traduireOr(expr, params) {
  const corps = expr.replace(/^\(/, "").replace(/\)$/, "");
  const conds = decouperNiveauZero(corps).map((c) => {
    c = c.trim();
    if (c.startsWith("and(")) {
      const interieur = c.slice(4, -1);
      return "(" + decouperNiveauZero(interieur).map((x) => traduireCond(x, params)).join(" and ") + ")";
    }
    if (c.startsWith("or(")) {
      const interieur = c.slice(3, -1);
      return "(" + decouperNiveauZero(interieur).map((x) => traduireCond(x, params)).join(" or ") + ")";
    }
    return traduireCond(c, params);
  });
  return "(" + conds.join(" or ") + ")";
}
function traduireCond(c, params) {
  const i = c.indexOf(".");
  return traduireFiltre(c.slice(0, i), c.slice(i + 1), params);
}

// ── Erreurs façon PostgREST ────────────────────────────────────────────────
function erreurRest(statut, code, message, details = null, hint = null) {
  const e = new Error(message);
  e.rest = { statut, corps: { code, message, details, hint } };
  return e;
}
function erreurDepuisPg(e) {
  const statut = e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400;
  return erreurRest(statut, e.code ?? "XX000", e.message, e.detail ?? null, e.hint ?? null);
}

// ── Exécution SQL sous identité (RLS réel) ─────────────────────────────────
async function sousIdentite(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const role = claims?.role === "authenticated" ? "authenticated" : "anon";
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims ?? { role: "anon" }),
    ]);
    await client.query(`set local role ${role}`);
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (e) {
    try { await client.query("rollback"); } catch {}
    throw e.rest ? e : erreurDepuisPg(e);
  } finally {
    client.release();
  }
}
// Requêtes d'administration (auth, storage interne) : superutilisateur.
async function admin(fn) {
  const client = await pool.connect();
  try {
    const r = await fn(client);
    return r;
  } finally {
    client.release();
  }
}

// ── Lecture REST : requête de base + embeds par lots ───────────────────────
function colonnesDeBase(arbre) {
  const cols = arbre.filter((n) => n.type === "col").map((n) => n.nom);
  return cols.includes("*") ? null : cols; // null = toutes
}
function clausesDepuisParams(url, params, embedsConnus) {
  const clauses = [];
  const filtresEmbeds = new Map(); // chemin d'embed → [{col, expr}]
  let ordre = null, limite = null, decalage = null;
  for (const [cle, valeur] of url.searchParams) {
    if (["select", "on_conflict", "columns", "apikey"].includes(cle)) continue;
    if (cle === "order") {
      ordre = valeur.split(",").map((o) => {
        const [col, ...mods] = o.split(".");
        const desc = mods.includes("desc");
        const nullsfirst = mods.includes("nullsfirst");
        const nullslast = mods.includes("nullslast");
        return `"${col}" ${desc ? "desc" : "asc"}${nullsfirst ? " nulls first" : nullslast ? " nulls last" : ""}`;
      }).join(", ");
    } else if (cle === "limit") limite = Number(valeur);
    else if (cle === "offset") decalage = Number(valeur);
    else if (cle === "or") clauses.push(traduireOr(valeur, params));
    else if (cle.includes(".") && embedsConnus.has(cle.split(".")[0])) {
      // filtre sur ressource embarquée : person.account_id=eq.X
      const [chemin, ...resteCol] = [cle.split(".").slice(0, -1).join("."), cle.split(".").at(-1)];
      const liste = filtresEmbeds.get(chemin) ?? [];
      liste.push({ col: resteCol[0], expr: valeur });
      filtresEmbeds.set(chemin, liste);
    } else {
      clauses.push(traduireFiltre(cle, valeur, params));
    }
  }
  return { clauses, ordre, limite, decalage, filtresEmbeds };
}

async function chargerEmbeds(client, tableParent, lignes, arbre, filtresEmbeds, chemin = "") {
  for (const noeud of arbre) {
    if (noeud.type !== "embed") continue;
    const rel = resoudreRelation(tableParent, noeud.table, noeud.fk);
    const cheminIci = chemin ? `${chemin}.${noeud.alias}` : noeud.alias;
    const cleParent = rel.colsParent[0];
    const cleEmbed = rel.colsEmbed[0];
    const valeurs = [...new Set(lignes.map((l) => l[cleParent]).filter((v) => v !== null && v !== undefined))];
    let lignesEmbed = [];
    if (valeurs.length) {
      const params = [valeurs];
      const filtres = (filtresEmbeds.get(cheminIci) ?? filtresEmbeds.get(noeud.alias) ?? [])
        .map((f) => traduireFiltre(f.col, f.expr, params));
      const colsDemandees = colonnesDeBase(noeud.enfants);
      const colsSql = colsDemandees === null
        ? "*"
        : [...new Set([...colsDemandees, cleEmbed, ...noeud.enfants.filter((n) => n.type === "embed").flatMap((n) => {
            try { return resoudreRelation(noeud.table, n.table, n.fk).colsParent; } catch { return []; }
          })])].map((c) => `"${c}"`).join(", ");
      const sql = `select ${colsSql} from "${noeud.table}" where "${cleEmbed}" = any($1)${filtres.length ? " and " + filtres.join(" and ") : ""}`;
      const r = await client.query(sql, params);
      lignesEmbed = r.rows;
      await chargerEmbeds(client, noeud.table, lignesEmbed, noeud.enfants, filtresEmbeds, cheminIci);
      // Ne garder que les colonnes demandées (+ alias) dans la sortie
      if (colsDemandees !== null) {
        const garde = new Set([
          ...noeud.enfants.filter((n) => n.type === "col").map((n) => n.nom),
          ...noeud.enfants.filter((n) => n.type === "embed").map((n) => n.alias),
        ]);
        lignesEmbed = lignesEmbed.map((l) => {
          const sortie = {};
          for (const n of noeud.enfants) {
            if (n.type === "col") sortie[n.alias ?? n.nom] = l[n.nom];
            else sortie[n.alias] = l[n.alias];
          }
          void garde;
          return { ...sortie, ["__cle__"]: l[cleEmbed] };
        });
      } else {
        lignesEmbed = lignesEmbed.map((l) => ({ ...l, ["__cle__"]: l[cleEmbed] }));
      }
    }
    const parCle = new Map();
    for (const l of lignesEmbed) {
      const { __cle__, ...reste } = l;
      const liste = parCle.get(__cle__) ?? [];
      liste.push(reste);
      parCle.set(__cle__, liste);
    }
    for (const ligne of lignes) {
      const assoc = parCle.get(ligne[cleParent]) ?? [];
      ligne[noeud.alias] = rel.direction === "un" ? (assoc[0] ?? null) : assoc;
    }
    if (noeud.inner) {
      // !inner : les parents sans correspondance sortent (fidèle à PostgREST —
      // un filtre d'embed SANS inner laisse le parent et vide l'embed)
      const garder = lignes.filter((l) =>
        rel.direction === "un" ? l[noeud.alias] !== null : (l[noeud.alias]?.length ?? 0) > 0,
      );
      lignes.length = 0;
      lignes.push(...garder);
    }
  }
  return lignes;
}

function projeterSortie(lignes, arbre) {
  const cols = colonnesDeBase(arbre);
  if (cols === null) return lignes;
  return lignes.map((l) => {
    const sortie = {};
    for (const n of arbre) {
      if (n.type === "col") sortie[n.alias ?? n.nom] = l[n.nom];
      else sortie[n.alias] = l[n.alias];
    }
    return sortie;
  });
}

async function lireTable(claims, table, url, entetes) {
  const sel = url.searchParams.get("select") ?? "*";
  const arbre = analyserSelect(sel);
  const embedsConnus = new Set(arbre.filter((n) => n.type === "embed").flatMap((n) => {
    const noms = [n.alias, n.table];
    for (const e of n.enfants.filter((x) => x.type === "embed")) noms.push(`${n.alias}.${e.alias}`, e.alias, e.table);
    return noms;
  }));
  const params = [];
  const { clauses, ordre, limite, decalage, filtresEmbeds } = clausesDepuisParams(url, params, embedsConnus);
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";

  const prefer = entetes.prefer ?? "";
  const veutCompte = /count=exact/.test(prefer);

  return sousIdentite(claims, async (client) => {
    let total = null;
    if (veutCompte) {
      const rc = await client.query(`select count(*)::int as n from "${table}"${where}`, params);
      total = rc.rows[0].n;
    }
    if (entetes.methode === "HEAD") return { lignes: [], total };
    const colsDemandees = colonnesDeBase(arbre);
    const colsSql = colsDemandees === null
      ? "*"
      : [...new Set([...colsDemandees, ...arbre.filter((n) => n.type === "embed").flatMap((n) => {
          try { return resoudreRelation(table, n.table, n.fk).colsParent; } catch { return []; }
        })])].map((c) => `"${c}"`).join(", ");
    let sql = `select ${colsSql} from "${table}"${where}`;
    if (ordre) sql += ` order by ${ordre}`;
    if (limite !== null) sql += ` limit ${limite}`;
    if (decalage !== null) sql += ` offset ${decalage}`;
    const r = await client.query(sql, params);
    let lignes = r.rows;
    await chargerEmbeds(client, table, lignes, arbre, filtresEmbeds);
    lignes = projeterSortie(lignes, arbre);
    return { lignes, total };
  });
}

async function ecrireTable(claims, table, url, entetes, corps, methode) {
  const sel = url.searchParams.get("select");
  const arbre = sel ? analyserSelect(sel) : null;
  const prefer = entetes.prefer ?? "";
  const representation = /return=representation/.test(prefer) || !!sel;
  // Fidèle à PostgREST : RETURNING (et donc les politiques SELECT) seulement
  // en representation ; en minimal, l'écriture n'exige que sa propre politique.
  const retour = representation ? " returning *" : "";

  return sousIdentite(claims, async (client) => {
    let lignes = [];
    if (methode === "POST") {
      const objets = Array.isArray(corps) ? corps : [corps];
      if (!objets.length) return { lignes: [], statut: 201 };
      const cols = [...new Set(objets.flatMap((o) => Object.keys(o)))];
      const valeurs = [];
      const rangs = objets.map((o) => {
        const cases = cols.map((c) => {
          valeurs.push(o[c] === undefined ? null : preparerValeur(o[c]));
          return `$${valeurs.length}`;
        });
        return `(${cases.join(", ")})`;
      });
      let sql = `insert into "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) values ${rangs.join(", ")}`;
      if (/resolution=merge-duplicates/.test(prefer)) {
        const conflit = url.searchParams.get("on_conflict") ?? (catalogue.pks.get(table) ?? ["id"]).join(",");
        const maj = cols.map((c) => `"${c}" = excluded."${c}"`).join(", ");
        sql += ` on conflict (${conflit.split(",").map((c) => `"${c}"`).join(", ")}) do update set ${maj}`;
      } else if (/resolution=ignore-duplicates/.test(prefer)) {
        sql += " on conflict do nothing";
      }
      sql += retour;
      const r = await client.query(sql, valeurs);
      lignes = r.rows ?? [];
    } else {
      const params = [];
      const { clauses } = clausesDepuisParams(url, params, new Set());
      const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      if (!clauses.length && methode !== "POST") {
        throw erreurRest(400, "PGRST102", "Mise à jour/suppression sans filtre refusée");
      }
      if (methode === "PATCH") {
        const cols = Object.keys(corps);
        if (!cols.length) return { lignes: [], statut: 204 };
        const set = cols.map((c) => {
          params.push(preparerValeur(corps[c]));
          return `"${c}" = $${params.length}`;
        }).join(", ");
        const r = await client.query(`update "${table}" set ${set}${where}${retour}`, params);
        lignes = r.rows ?? [];
      } else if (methode === "DELETE") {
        const r = await client.query(`delete from "${table}"${where}${retour}`, params);
        lignes = r.rows ?? [];
      }
    }
    if (representation && arbre) {
      await chargerEmbeds(client, table, lignes, arbre, new Map());
      lignes = projeterSortie(lignes, arbre);
    }
    return { lignes, statut: methode === "POST" ? 201 : representation ? 200 : 204, representation };
  });
}
/**
 * Traduit une valeur JSON en paramètre Postgres.
 *
 * `type` est le type PG attendu quand on le connaît (appels RPC). Il est
 * indispensable pour les TABLEAUX : `["plomberie"]` envoyé tel quel à un
 * paramètre `artisan_metier[]` échouait en « malformed array literal », parce
 * qu'on le sérialisait en JSON avant de le caster. node-postgres sait, lui,
 * convertir un tableau JS en tableau PG — à condition qu'on le lui laisse.
 * Un tableau destiné à un `jsonb` (créneaux d'intervention) reste, lui,
 * sérialisé : c'est bien du JSON qu'on veut y mettre.
 *
 * Sans type (écritures de table), on garde l'ancien comportement.
 */
function preparerValeur(v, type) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v) && typeof type === "string" && type.endsWith("[]")) return v;
  return JSON.stringify(v);
}

// ── RPC ────────────────────────────────────────────────────────────────────
async function appelerRpc(claims, nom, corps) {
  const fn = catalogue.fns.get(nom);
  if (!fn) throw erreurRest(404, "PGRST202", `Fonction public.${nom} introuvable`);
  const args = corps ?? {};
  const noms = (fn.arg_noms ?? []).slice(0, (fn.arg_types ?? []).length);
  const fournis = noms
    .map((n, i) => ({ nom: n, type: (fn.arg_types ?? [])[i] }))
    .filter((a) => Object.prototype.hasOwnProperty.call(args, a.nom));
  const params = fournis.map((a) => preparerValeur(args[a.nom], a.type));
  const listeArgs = fournis.map((a, i) => `"${a.nom}" => $${i + 1}::${a.type}`).join(", ");
  return sousIdentite(claims, async (client) => {
    if (fn.retourne_set || fn.type_retour.startsWith("TABLE") || fn.type_retour.startsWith("SETOF")) {
      const r = await client.query(
        `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as j from public."${nom}"(${listeArgs}) t`,
        params,
      );
      return r.rows[0].j;
    }
    if (fn.type_retour === "void") {
      await client.query(`select public."${nom}"(${listeArgs})`, params);
      return null;
    }
    const r = await client.query(`select to_jsonb(public."${nom}"(${listeArgs})) as j`, params);
    return r.rows[0].j;
  });
}

// ── Auth ───────────────────────────────────────────────────────────────────
function sessionPour(user) {
  const expires_in = 3600;
  const maintenant = Math.floor(Date.now() / 1000);
  const claims = {
    sub: user.id, email: user.email, phone: "", role: "authenticated",
    aud: "authenticated", session_id: crypto.randomUUID(),
    app_metadata: user.raw_app_meta_data ?? {}, user_metadata: user.raw_user_meta_data ?? {},
    iat: maintenant, exp: maintenant + expires_in, iss: `http://127.0.0.1:${PORT}/auth/v1`,
  };
  return {
    access_token: signer(claims),
    token_type: "bearer",
    expires_in,
    expires_at: maintenant + expires_in,
    refresh_token: signer({ sub: user.id, type: "refresh", iat: maintenant }),
    user: utilisateurJson(user),
  };
}
function utilisateurJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.email_confirmed_at, phone: u.phone ?? "",
    confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at,
    app_metadata: u.raw_app_meta_data ?? {}, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], created_at: u.created_at, updated_at: u.updated_at, is_anonymous: false,
  };
}
async function utilisateurParId(id) {
  const { rows } = await admin((c) => c.query("select * from auth.users where id = $1", [id]));
  return rows[0] ?? null;
}

async function routerAuth(methode, chemin, url, corps, claims) {
  if (chemin === "token" && methode === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const { rows } = await admin((c) =>
        c.query(
          "select * from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password) and deleted_at is null",
          [corps.email, corps.password],
        ),
      );
      if (!rows[0]) return { statut: 400, corps: { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" } };
      await admin((c) => c.query("update auth.users set last_sign_in_at = now() where id = $1", [rows[0].id]));
      return { statut: 200, corps: sessionPour(rows[0]) };
    }
    if (grant === "refresh_token") {
      const c2 = verifier(corps.refresh_token ?? "");
      if (!c2 || c2.type !== "refresh") return { statut: 400, corps: { error: "invalid_grant", msg: "Invalid Refresh Token" } };
      const u = await utilisateurParId(c2.sub);
      if (!u) return { statut: 400, corps: { error: "invalid_grant", msg: "Utilisateur disparu" } };
      return { statut: 200, corps: sessionPour(u) };
    }
    return { statut: 400, corps: { error: "unsupported_grant_type" } };
  }
  if (chemin === "signup" && methode === "POST") {
    const meta = corps.data ?? {};
    try {
      const { rows } = await admin((c) =>
        c.query(
          `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
             email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
             confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
           values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
             '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now(), '', '', '', '', '')
           returning *`,
          [corps.email, corps.password, JSON.stringify(meta)],
        ),
      );
      return { statut: 200, corps: sessionPour(rows[0]) };
    } catch (e) {
      if (e.code === "23505") return { statut: 422, corps: { code: "user_already_exists", msg: "User already registered" } };
      throw e;
    }
  }
  if (chemin === "user" && methode === "GET") {
    if (!claims?.sub) return { statut: 401, corps: { code: "no_authorization", msg: "Jeton absent ou invalide" } };
    const u = await utilisateurParId(claims.sub);
    if (!u) return { statut: 401, corps: { code: "user_not_found", msg: "Utilisateur introuvable" } };
    return { statut: 200, corps: utilisateurJson(u) };
  }
  if (chemin === "user" && methode === "PUT") {
    if (!claims?.sub) return { statut: 401, corps: { code: "no_authorization", msg: "Jeton absent ou invalide" } };
    if (corps.password) {
      await admin((c) =>
        c.query(
          "update auth.users set encrypted_password = extensions.crypt($1, extensions.gen_salt('bf')), updated_at = now() where id = $2",
          [corps.password, claims.sub],
        ),
      );
    }
    if (corps.data) {
      await admin((c) =>
        c.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb, updated_at = now() where id = $2", [JSON.stringify(corps.data), claims.sub]),
      );
    }
    const u = await utilisateurParId(claims.sub);
    return { statut: 200, corps: utilisateurJson(u) };
  }
  if (chemin === "logout" && methode === "POST") return { statut: 204, corps: null };
  if (["recover", "otp", "resend", "magiclink"].includes(chemin) && methode === "POST") {
    // Hors ligne : pas d'email sortant. On répond OK pour ne pas casser les
    // parcours ; le lien n'arrivera jamais (limite documentée du mode local).
    return { statut: 200, corps: {} };
  }
  if (chemin === "verify") return { statut: 400, corps: { msg: "verify non géré en mode local" } };
  return { statut: 404, corps: { msg: `auth/${chemin} non géré` } };
}

// ── Storage ────────────────────────────────────────────────────────────────
function cheminSur(base, bucket, objet) {
  const complet = path.normalize(path.join(base, bucket, objet));
  if (!complet.startsWith(path.normalize(base) + path.sep)) throw erreurRest(400, "storage", "Chemin invalide");
  return complet;
}
async function routerStorage(methode, segments, url, brut, entetes, claims) {
  // segments : après /storage/v1/ → ex. ["object", "documents", "org", "fichier.pdf"]
  const [tete, ...reste] = segments;
  if (tete !== "object") return { statut: 404, corps: { message: `storage/${tete} non géré` } };

  if (reste[0] === "sign" && methode === "POST") {
    const bucket = reste[1];
    const objet = reste.slice(2).join("/");
    await sousIdentite(claims, async (client) => {
      const r = await client.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, objet]);
      if (!r.rows.length) throw erreurRest(404, "storage", "Object not found");
    });
    const corps = JSON.parse(brut.toString() || "{}");
    const jeton = signer({ url: `${bucket}/${objet}`, exp: Math.floor(Date.now() / 1000) + (corps.expiresIn ?? 3600) });
    return { statut: 200, corps: { signedURL: `/object/sign/${bucket}/${objet}?token=${jeton}` } };
  }
  if (reste[0] === "sign" && methode === "GET") {
    const bucket = reste[1];
    const objet = decodeURIComponent(reste.slice(2).join("/"));
    const c = verifier(url.searchParams.get("token") ?? "");
    if (!c || c.url !== `${bucket}/${objet}`) return { statut: 401, corps: { message: "Jeton signé invalide" } };
    return { statut: 200, fichier: cheminSur(STOCKAGE, bucket, objet) };
  }
  if ((reste[0] === "authenticated" || reste[0] !== "sign") && methode === "GET") {
    const base = reste[0] === "authenticated" ? reste.slice(1) : reste;
    const bucket = base[0];
    const objet = decodeURIComponent(base.slice(1).join("/"));
    await sousIdentite(claims, async (client) => {
      const r = await client.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, objet]);
      if (!r.rows.length) throw erreurRest(404, "storage", "Object not found");
    });
    return { statut: 200, fichier: cheminSur(STOCKAGE, bucket, objet) };
  }
  if (methode === "POST" || methode === "PUT") {
    const bucket = reste[0];
    const objet = decodeURIComponent(reste.slice(1).join("/"));
    const upsert = (entetes["x-upsert"] ?? "false") === "true" || methode === "PUT";
    const mime = entetes["content-type"] ?? "application/octet-stream";
    const meta = { mimetype: mime, size: brut.length, cacheControl: entetes["cache-control"] ?? "no-cache" };
    // Pas de RETURNING sous l'identité utilisateur : comme le vrai service
    // Storage, l'écriture n'exige que la politique INSERT (les politiques
    // SELECT de la GED supposent une fiche `documents` créée APRÈS l'upload).
    // Pas d'ON CONFLICT : avec RLS il exigerait des politiques UPDATE même
    // sans conflit réel. On tente l'insert ; en cas de doublon et d'upsert
    // demandé, on met à jour sous la même identité (politique UPDATE requise,
    // comme en vrai).
    try {
      await sousIdentite(claims, (client) =>
        client.query(
          "insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)",
          [bucket, objet, claims?.sub ?? null, JSON.stringify(meta)],
        ),
      );
    } catch (e) {
      if (upsert && e.rest?.corps?.code === "23505") {
        await sousIdentite(claims, (client) =>
          client.query(
            "update storage.objects set metadata = $3, updated_at = now() where bucket_id = $1 and name = $2",
            [bucket, objet, JSON.stringify(meta)],
          ),
        );
      } else throw e;
    }
    const id = await admin(async (client) => {
      const r = await client.query("select id from storage.objects where bucket_id = $1 and name = $2", [bucket, objet]);
      return r.rows[0]?.id ?? null;
    });
    const dest = cheminSur(STOCKAGE, bucket, objet);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, brut);
    return { statut: 200, corps: { Key: `${bucket}/${objet}`, Id: id, path: objet, fullPath: `${bucket}/${objet}` } };
  }
  if (methode === "DELETE") {
    const bucket = reste[0];
    const corps = JSON.parse(brut.toString() || "{}");
    const objets = corps.prefixes ?? (reste.length > 1 ? [decodeURIComponent(reste.slice(1).join("/"))] : []);
    await sousIdentite(claims, async (client) => {
      await client.query("delete from storage.objects where bucket_id = $1 and name = any($2)", [bucket, objets]);
    });
    // Les noms réellement partis (la politique DELETE a pu en garder) :
    const restants = await admin(async (client) => {
      const r = await client.query("select name from storage.objects where bucket_id = $1 and name = any($2)", [bucket, objets]);
      return new Set(r.rows.map((x) => x.name));
    });
    const supprimes = objets.filter((nom) => !restants.has(nom));
    for (const nom of supprimes) {
      try { fs.unlinkSync(cheminSur(STOCKAGE, bucket, nom)); } catch {}
    }
    return { statut: 200, corps: supprimes.map((nom) => ({ name: nom, bucket_id: bucket })) };
  }
  return { statut: 404, corps: { message: "storage : route non gérée" } };
}

// ── Serveur HTTP ───────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, x-client-info, x-upsert, accept, accept-profile, content-profile, range, cache-control, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range, x-supabase-api-version",
};

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  const brut = Buffer.concat(morceaux);
  const entetes = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  entetes.methode = req.method;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const bearer = (entetes.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = bearer && bearer !== "null" ? verifier(bearer) : null;

  const repondreJson = (statut, corps, extra = {}) => {
    const donnees = corps === null ? "" : JSON.stringify(corps);
    res.writeHead(statut, { "Content-Type": "application/json", ...CORS, ...extra });
    res.end(donnees);
  };

  try {
    const segments = url.pathname.split("/").filter(Boolean);
    // /auth/v1/…
    if (segments[0] === "auth" && segments[1] === "v1") {
      const corps = brut.length ? JSON.parse(brut.toString()) : {};
      const r = await routerAuth(req.method, segments.slice(2).join("/"), url, corps, claims);
      return repondreJson(r.statut, r.corps);
    }
    // /rest/v1/rpc/:fn
    if (segments[0] === "rest" && segments[1] === "v1" && segments[2] === "rpc") {
      const corps = brut.length ? JSON.parse(brut.toString()) : {};
      const resultat = await appelerRpc(claims, segments[3], corps);
      const accept = entetes.accept ?? "";
      if (accept.includes("vnd.pgrst.object")) {
        const tableau = Array.isArray(resultat) ? resultat : [resultat];
        if (tableau.length !== 1 || tableau[0] === null) {
          return repondreJson(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${tableau.length === 1 ? 0 : tableau.length} rows`, hint: null });
        }
        return repondreJson(200, tableau[0]);
      }
      return repondreJson(200, resultat);
    }
    // /rest/v1/:table
    if (segments[0] === "rest" && segments[1] === "v1" && segments[2]) {
      const table = segments[2];
      if (req.method === "GET" || req.method === "HEAD") {
        const { lignes, total } = await lireTable(claims, table, url, entetes);
        const accept = entetes.accept ?? "";
        const extra = total !== null ? { "Content-Range": `0-${Math.max(lignes.length - 1, 0)}/${total}` } : {};
        if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Type": "application/json", ...CORS, ...extra });
          return res.end();
        }
        if (accept.includes("vnd.pgrst.object")) {
          if (lignes.length !== 1) {
            return repondreJson(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${lignes.length} rows`, hint: null }, extra);
          }
          return repondreJson(200, lignes[0], extra);
        }
        return repondreJson(200, lignes, extra);
      }
      if (["POST", "PATCH", "DELETE"].includes(req.method)) {
        const corps = brut.length ? JSON.parse(brut.toString()) : {};
        const r = await ecrireTable(claims, table, url, entetes, corps, req.method);
        const accept = entetes.accept ?? "";
        if (accept.includes("vnd.pgrst.object")) {
          if (r.lignes.length !== 1) {
            return repondreJson(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${r.lignes.length} rows`, hint: null });
          }
          return repondreJson(r.statut === 204 ? 200 : r.statut, r.lignes[0]);
        }
        if (r.statut === 204 || (!/return=representation/.test(entetes.prefer ?? "") && !url.searchParams.get("select"))) {
          return repondreJson(req.method === "POST" ? 201 : 204, null);
        }
        return repondreJson(r.statut, r.lignes);
      }
    }
    // /storage/v1/…
    if (segments[0] === "storage" && segments[1] === "v1") {
      const r = await routerStorage(req.method, segments.slice(2), url, brut, entetes, claims);
      if (r.fichier) {
        try {
          const contenu = fs.readFileSync(r.fichier);
          res.writeHead(200, { "Content-Type": "application/octet-stream", ...CORS });
          return res.end(contenu);
        } catch {
          return repondreJson(404, { message: "Fichier absent du disque" });
        }
      }
      return repondreJson(r.statut, r.corps);
    }
    return repondreJson(404, { message: `Route non gérée : ${req.method} ${url.pathname}` });
  } catch (e) {
    if (e.rest) return repondreJson(e.rest.statut, e.rest.corps);
    console.error("[supalocal]", req.method, url.pathname, e);
    return repondreJson(500, { code: "XX000", message: String(e.message ?? e) });
  }
});

await chargerCatalogue();
fs.mkdirSync(STOCKAGE, { recursive: true });
serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`Émulateur Supabase local prêt : http://127.0.0.1:${PORT} → ${DB_URL}`);
});
