// Recopier uniquement le banc de présentation fictif, API et interface arrêtées.
// Aucun nom de base, serveur ou répertoire de production n’est accepté.
import { Client } from "pg";
import { createHash } from "node:crypto";
import { cp, lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

const url = new URL(process.env.SUPALOCAL_DB ?? "");
const base = "gerimmo_ci_demo_vente";
const stockage = "/private/tmp/gerimmo-v1-vitrine-objets";
if (url.protocol !== "postgres:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" + base + "_api" || url.search || !url.port) {
  throw new Error("La base locale de démonstration est obligatoire.");
}
const [action, nom, modele, ...autres] = process.argv.slice(2);
const creation = action === "figer";
const edition = creation ? nom : modele;
const nomValide = valeur => /^[a-z]{1,14}$/.test(valeur ?? "");
if (autres.length || (creation ? modele !== undefined : action !== "restaurer" || !nomValide(nom) || nom === "modele")
    || (edition !== undefined && !nomValide(edition))) {
  throw new Error("Utiliser figer [édition] ou restaurer <copie> [édition], avec des noms alphabétiques.");
}
const modeleBase = edition ? "_reference_" + edition : "_reference";
const modeleFichiers = edition ? "-reference-" + edition : "-reference";
const source = base + (creation ? "_api" : modeleBase);
const destination = base + (creation ? modeleBase : "_" + nom + "_api");
const fichiersSource = stockage + (creation ? "" : modeleFichiers);
const fichiersDestination = stockage + (creation ? modeleFichiers : "-" + nom);

async function connexion(nomBase) {
  const cible = new URL(url);
  cible.pathname = "/" + nomBase;
  const db = new Client({ connectionString: cible.href });
  await db.connect();
  return db;
}
async function inventaireBase(nomBase) {
  const db = await connexion(nomBase);
  try {
    if (creation || edition) {
      const profil = await db.query(`select o.name,o.email_contact,o.telephone
        from public.organizations o where exists (
          select from public.quittances q join public.baux b on b.id=q.bail_id
          join public.persons p on p.id=b.locataire_principal
          where q.organization_id=o.id and p.email='sam@example.invalid'
        )`);
      if (profil.rowCount !== 1 || profil.rows[0].name !== "Parc d’Élise Morel"
          || profil.rows[0].email_contact !== "elise.morel@example.invalid" || profil.rows[0].telephone !== "04 65 71 02 14") {
        throw new Error("Vérifier le profil d’Élise Morel et sa quittance avant la présentation.");
      }
    }
    const { rows: [ligne] } = await db.query(`select
      (select count(*) from auth.users) comptes,
      (select count(*) from auth.users where email is null or split_part(email,'@',2) not in ('example.com','example.invalid')) autres,
      (select count(*) from auth.users where email in ('sam.riviere@example.invalid','jeanne.martin@example.invalid')) occupants,
      (select count(*) from public.organizations) organisations,
      (select count(*) from public.baux) baux,
      (select count(*) from public.documents) documents,
      (select count(*) from public.factures_fourniture where payee_le is not null) factures_reglees,
      (select count(*) from public.incident_interventions where statut='planifiee') rdv`);
    if (Number(ligne.autres) || Number(ligne.occupants) !== 2 || Number(ligne.factures_reglees) < 2 || !Number(ligne.rdv)) {
      throw new Error("Le jeu de présentation attendu est absent ou contient des comptes non fictifs.");
    }
    return ligne;
  } finally { await db.end(); }
}
async function empreintes(racine, chemin = "") {
  const inventaire = [];
  for (const entree of await readdir(join(racine, chemin), { withFileTypes: true })) {
    const fichier = join(chemin, entree.name);
    if (entree.isDirectory()) inventaire.push(...await empreintes(racine, fichier));
    else if (entree.isFile()) inventaire.push(fichier + " " + createHash("sha256").update(await readFile(join(racine, fichier))).digest("hex"));
    else throw new Error("Un fichier spécial est présent dans le stockage.");
  }
  return inventaire.sort();
}
const admin = await connexion("postgres");
try {
  if (await realpath(fichiersSource) !== fichiersSource) throw new Error("Le stockage source ne peut pas être un lien.");
  const existe = await lstat(fichiersDestination).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (existe || (await admin.query("select from pg_database where datname=$1", [destination])).rowCount) {
    throw new Error("La destination existe déjà. Les copies précédentes sont conservées.");
  }
  const avant = await inventaireBase(source);
  if ((await admin.query("select from pg_stat_activity where datname=$1", [source])).rowCount) {
    throw new Error("Arrêter les services du banc local avant de copier la base.");
  }
  const fichiers = await empreintes(fichiersSource);
  if (!fichiers.length) throw new Error("Stockage source vide.");
  const preuve = JSON.stringify({ inventaire: avant, fichiers });
  if (!creation && await readFile(fichiersSource + ".json", "utf8") !== preuve) throw new Error("Le modèle diffère de sa preuve de création.");
  // CREATE DATABASE bloque les nouvelles connexions pendant la copie PostgreSQL.
  await admin.query('create database "' + destination + '" template "' + source + '"');
  process.umask(0o077);
  await cp(fichiersSource, fichiersDestination, { recursive: true, force: false, errorOnExist: true });
  if (JSON.stringify(avant) !== JSON.stringify(await inventaireBase(destination))
      || JSON.stringify(fichiers) !== JSON.stringify(await empreintes(fichiersDestination))
      || JSON.stringify(fichiers) !== JSON.stringify(await empreintes(fichiersSource))) {
    throw new Error("Copie non validée. Ne pas démarrer cette copie.");
  }
  await writeFile(fichiersDestination + ".json", preuve, { flag: "wx", mode: 0o600 });
  console.log(destination, avant, fichiers.length, "fichiers identiques par SHA-256.");
} finally { await admin.end(); }
