// Génère e2e/matrice-ecrans.json : l'inventaire des routes (routes-inventaire.json)
// résolu avec des identifiants RÉELS de la base locale. Les routes dont les
// données n'existent pas encore sont écartées (listées en sortie) — relancer
// après les parcours E2E qui créent bail, EDL, incident…
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.SUPALOCAL_DB ?? "postgres://postgres@127.0.0.1:55432/gerimmo_local" });

const un = async (sql, params = []) => (await pool.query(sql, params)).rows[0] ?? null;

// Le seed des parcours crée ses dossiers profonds dans Agence Alpha. Après les
// tests SQL, d'autres agences peuvent être plus anciennes : prendre simplement
// la première amputait alors la matrice de tous les écrans bien/lot/bail/EDL.
const agence = await un("select id from organizations where type = 'agence' order by (name = 'Agence Alpha') desc, created_at limit 1");
const pd = await un("select id from organizations where type <> 'agence' order by created_at limit 1");
const ORG = agence?.id;
// Préférer le dossier E2E (seed-parcours) : il porte un mandat dont l'agent
// est titulaire, donc ses écrans profonds sont dans le « portefeuille » de
// l'agent — un bien sans mandat rendrait un 404 légitime sous ce persona.
const ids = {
  ORG,
  ORG_PD: pd?.id,
  BIEN: (await un("select id from biens where organization_id = $1 order by (nom like 'E2E%') desc, created_at limit 1", [ORG]))?.id,
  // La fiche du locataire du bail le plus récent : elle est dans le
  // périmètre « personnes » de l'agent (locataires des baux de ses lots)
  PERSONNE: (await un(
    "select coalesce((select b.locataire_principal from baux b where b.organization_id = $1 order by b.created_at desc limit 1), (select p.id from persons p where p.organization_id = $1 order by p.created_at limit 1)) as id",
    [ORG]
  ))?.id,
  BAIL: (await un("select id from baux where organization_id = $1 order by created_at desc limit 1", [ORG]))?.id,
  INCIDENT: (await un("select id from incidents where organization_id = $1 limit 1", [ORG]))?.id,
  QUITTANCE: (await un("select id from quittances where organization_id = $1 limit 1", [ORG]))?.id,
  ARTISAN: (await un("select id from artisans order by created_at limit 1"))?.id,
  PUBLICATION: (await un("select id from publications order by created_at limit 1"))?.id,
  ARTICLE: (await un("select slug from publications where statut = 'publiee' order by publie_le desc limit 1"))?.slug,
  DIAGNOSTIC: (await un("select id from diagnostics where organization_id = $1 and archived_at is null limit 1", [ORG]))?.id,
  SOLLICITATION: (await un("select id from incident_sollicitations where statut = 'envoyee' order by envoyee_le desc limit 1"))?.id,
  INTERVENTION: (await un("select id from incident_interventions order by confiee_le desc limit 1"))?.id,
  // Les équipes du point du matin sont fixes (lib/missions.ts) : la première.
  EQUIPE: "exploitation",
  // Un compte de client (jamais la supervision) pour la fiche de débogage.
  ACCOUNT: (await un("select m.account_id as id from memberships m where m.role in ('agent','admin_agence') and m.status='active' order by m.created_at limit 1"))?.id,
};
const lot = await un(
  "select l.id, l.bien_id from lots l join biens b on b.id = l.bien_id where l.organization_id = $1 order by (b.nom like 'E2E%') desc, l.created_at limit 1",
  [ORG]
);
ids.LOT = lot?.id;
if (lot) ids.BIEN = lot.bien_id;
const edl = ids.BAIL ? await un("select id from etats_des_lieux where bail_id = $1 limit 1", [ids.BAIL]) : null;
ids.EDL = edl?.id;

const inventaire = JSON.parse(fs.readFileSync(path.join(ICI, "..", "routes-inventaire.json"), "utf8"));
const matrice = [];
const ecartees = [];
for (const route of inventaire) {
  let chemin = route.path;
  // L'espace « propriétaire » réutilise les routes /agence avec l'organisation PD
  if (route.persona === "proprietaire") chemin = chemin.replace("/agence/ORG", `/agence/${ids.ORG_PD}`);
  let manquant = null;
  chemin = chemin.replace(/\b(ORG_PD|ORG|BIEN|LOT|BAIL|EDL|INCIDENT|PERSONNE|QUITTANCE|ARTISAN|PUBLICATION|ARTICLE|DIAGNOSTIC|SOLLICITATION|INTERVENTION|EQUIPE|ACCOUNT)\b/g, (m) => {
    if (!ids[m]) manquant = m;
    return ids[m] ?? m;
  });
  if (manquant) {
    ecartees.push(`${route.path} (pas de ${manquant})`);
    continue;
  }
  const persona = route.persona === "admin-agence" ? "admin" : route.persona;
  matrice.push({ path: chemin, persona, label: route.label });
}
fs.writeFileSync(path.join(ICI, "..", "matrice-ecrans.json"), JSON.stringify(matrice, null, 1));
console.log(`${matrice.length} écrans dans la matrice ; ${ecartees.length} écartés :`);
for (const e of ecartees) console.log("  -", e);
await pool.end();
