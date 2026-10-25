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
// Le propriétaire de démonstration d'abord : des organisations laissées par d'autres essais ne doivent pas devenir « son » espace.
const pd = await un("select id from organizations where type <> 'agence' order by (name = 'Parc de Claire Moreau') desc, created_at limit 1");
const ORG = agence?.id;
const artisanPrive = await un("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com' limit 1");
// Préférer le dossier E2E (seed-parcours) : il porte un mandat dont l'agent
// est titulaire, donc ses écrans profonds sont dans le « portefeuille » de
// l'agent — un bien sans mandat rendrait un 404 légitime sous ce persona.
const ids = {
  ORG,
  PROSPECT: "nouveau", // Formulaire sans mutation ; historique peuple dans la recette locale.
  ORG_PD: pd?.id,
  INVITATION: (await un("select i.id from invitations_locataires i join auth.users u on u.id=i.account_id where u.email='locataire.alpha@example.com' order by i.cree_le desc limit 1"))?.id,
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
  SOLLICITATION: (await un("select id from incident_sollicitations where artisan_id=$1 and statut = 'envoyee' order by envoyee_le desc limit 1", [artisanPrive?.id]))?.id,
  INTERVENTION: (await un("select id from incident_interventions where artisan_id=$1 order by confiee_le desc limit 1", [artisanPrive?.id]))?.id,
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

// Chaque espace propriétaire doit montrer ses propres dossiers, jamais ceux de l'agence.
const lotProprietaire = await un("select id, bien_id from lots where organization_id=$1 order by created_at limit 1", [ids.ORG_PD]);
ids.LOT_PD = lotProprietaire?.id;
ids.BIEN_PD = lotProprietaire?.bien_id;
ids.BAIL_PD = (await un("select id from baux where organization_id=$1 order by created_at desc limit 1", [ids.ORG_PD]))?.id;

// Les dossiers privés de la matrice appartiennent au même compte artisan du seed E2E.
// Les missions et sollicitations ci-dessus sont également bornées à ce compte.
ids.CLIENT_EXTERNE = (await un("select id from artisan_clients where artisan_id=$1 order by created_at limit 1",[artisanPrive?.id]))?.id;
ids.CHANTIER_EXTERNE = (await un("select id from artisan_chantiers where artisan_id=$1 order by created_at limit 1",[artisanPrive?.id]))?.id;
ids.FACTURE_EXTERNE = (await un("select id from artisan_factures_externes where artisan_id=$1 order by created_at limit 1",[artisanPrive?.id]))?.id;
// Invitation d'un artisan (décision du 15/10/2026) : vue SANS session, la page ne lit rien en base et ne dit rien de
// l'invitation ; n'importe quel identifiant bien formé montre donc l'écran public (création du compte).
ids.INVITATION_ARTISAN = "00000000-0000-4000-8000-000000000000";
// Versions archivées des conditions (24/10/2026) : la dernière version archivée des conditions clients, s'il y en a une ;
// sans archive dans la base du banc, l'écran est écarté (et dit pourquoi).
ids.DOCUMENT = "conditions_clients";
// Lien de la caution (décision du 23/10/2026) : un jeton bien formé mais inconnu montre l'écran public « lien non
// valable », sans rien lire du dossier.
ids.JETON_CAUTION = "A".repeat(43);
ids.VERSION = (await un("select version from versions_conditions where document = 'conditions_clients' order by publiee_le desc limit 1"))?.version;

const inventaire = JSON.parse(fs.readFileSync(path.join(ICI, "..", "routes-inventaire.json"), "utf8"));
const matrice = [];
const ecartees = [];
const exclusions = [];
for (const route of inventaire) {
  let chemin = route.path;
  // L'espace « propriétaire » réutilise les écrans de l'agence avec l'organisation PD, sous /espace/<id> (décision D27 :
  // /agence/<id> redirige à vie vers /espace/<id> pour lui, un modèle encore écrit « /agence/ORG » est donc ramené à /espace).
  if (route.persona === "proprietaire") chemin = chemin.replace(/^\/(?:agence|espace)\/ORG(?![A-Z_])/, `/espace/${ids.ORG_PD}`);
  let manquant = null;
  chemin = chemin.replace(/\b(LOT_PD|BIEN_PD|BAIL_PD|PROSPECT|INVITATION_ARTISAN|INVITATION|ORG_PD|ORG|BIEN|LOT|BAIL|EDL|INCIDENT|PERSONNE|QUITTANCE|ARTISAN|PUBLICATION|ARTICLE|DIAGNOSTIC|SOLLICITATION|INTERVENTION|EQUIPE|ACCOUNT|CLIENT_EXTERNE|CHANTIER_EXTERNE|FACTURE_EXTERNE|DOCUMENT|VERSION|JETON_CAUTION)\b/g, (m) => {
    if (!ids[m]) manquant = m;
    return ids[m] ?? m;
  });
  if (manquant) {
    ecartees.push(`${route.path} (pas de ${manquant})`);
    exclusions.push({ ...route, raison: `Donnée de recette absente : ${manquant}` });
    continue;
  }
  const persona = route.persona === "admin-agence" ? "admin" : route.persona;
  matrice.push({ path: chemin, persona, label: route.label });
}
fs.writeFileSync(path.join(ICI, "..", "matrice-ecrans.json"), JSON.stringify(matrice, null, 1));
const audit = path.join(ICI, "..", ".audit");
fs.mkdirSync(audit, { recursive: true });
fs.writeFileSync(path.join(audit, "couverture-prevue.json"), JSON.stringify({
  nature: "Périmètre prévu, pas un résultat de validation. Les parcours d’actions et les prestataires se vérifient séparément.",
  parProfil: Object.fromEntries([...new Set(inventaire.map(r => r.persona))].map(persona => [persona, {
    inventoriees: inventaire.filter(r => r.persona === persona).length,
    retenues: matrice.filter(r => r.persona === (persona === "admin-agence" ? "admin" : persona)).length,
    exclues: exclusions.filter(r => r.persona === persona),
  }])),
}, null, 2));
console.log(`${matrice.length} écrans dans la matrice ; ${ecartees.length} écartés :`);
for (const e of ecartees) console.log("  -", e);
await pool.end();
