// Seed E2E « parcours complet » — Agence Alpha, contre l'émulateur Supabase local.
//
// Construit un dossier de gestion complet en rejouant EXACTEMENT les appels
// que les server actions de l'app font elles-mêmes (mêmes RPC, mêmes inserts,
// mêmes chemins storage / tables documents + document_liens) :
//   parc.ts (creerBien, modifierLot, ajouterDetention, deposerDiagnostic,
//            proposerPiecesLot, changerEtatLot), personnes.ts, mandats.ts,
//   baux.ts (creerBail, deposerBailSigne → controler_mise_en_location +
//            dépôt GED + activer_bail), edl.ts (creerEdl → generer_grille_edl),
//   loyers.ts (genererAppels → generer_appels_loyer, ajouterEncaissement →
//              insert encaissements + emettre_quittances),
//   incidents.ts (declarerMonIncident → declarer_mon_incident +
//                 joindre_photo_incident, côté locataire).
//
// Idempotent : tous les objets sont préfixés « E2E » et vérifiés par select
// avant création. Aucun SQL direct — uniquement supabase-js, RLS réelles.
//
//   node e2e/local/seed-parcours.mjs

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const URL_LOCALE = "http://127.0.0.1:54321";
const CLE_ANON = "cle-locale";
const MDP = "Gerimmo-Demo-2026";

// ------------------------------------------------------------
// Outils
// ------------------------------------------------------------

/** Arrêt net à la première erreur : étape + erreur JSON, exit 1. */
function ok(etape, { data, error }) {
  if (error) {
    console.error(`✗ ${etape} : ${JSON.stringify(error)}`);
    process.exit(1);
  }
  return data;
}

function echec(etape, detail) {
  console.error(`✗ ${etape} : ${detail}`);
  process.exit(1);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}
const aujourdhui = new Date();
const dateJour = iso(aujourdhui);
const premierDuMois = `${dateJour.slice(0, 7)}-01`;
function plusMois(nb) {
  const d = new Date(aujourdhui);
  d.setUTCMonth(d.getUTCMonth() + nb);
  return iso(d);
}

function sha256(octets) {
  return createHash("sha256").update(octets).digest("hex");
}

// PDF minimal (~1 Ko), valide pour detecterMimeReel (« %PDF- ») et pdfComplet
// (« %%EOF » final). Contenu DÉTERMINISTE par marqueur : au re-run, la même
// empreinte retrouve le document déjà en GED (anti-doublon de l'app) et on
// le réutilise au lieu de redéposer.
function pdfMinimal(marqueur) {
  const texte = `E2E ${marqueur}`.replace(/[()\\]/g, "");
  const objets = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  ];
  const flux = `BT /F1 14 Tf 72 770 Td (${texte}) Tj ET`;
  objets.push(`4 0 obj\n<< /Length ${flux.length} >>\nstream\n${flux}\nendstream\nendobj\n`);
  objets.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  let corps = "%PDF-1.4\n";
  const positions = [];
  for (const o of objets) {
    positions.push(corps.length);
    corps += o;
  }
  const debutXref = corps.length;
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const p of positions) xref += `${String(p).padStart(10, "0")} 00000 n \n`;
  corps +=
    xref +
    `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;
  // Bourrage en commentaire PDF pour approcher 1 Ko sans changer le rendu
  const manque = 1024 - corps.length;
  if (manque > 0) corps = corps.replace("%PDF-1.4\n", `%PDF-1.4\n%${"E2E".repeat(Math.ceil(manque / 3)).slice(0, Math.max(0, manque - 2))}\n`);
  return Buffer.from(corps, "latin1");
}

// JPEG 1×1 valide (FF D8 FF …), déterministe — même logique de réutilisation.
const JPEG_1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64"
);

// Dépôt GED — même séquence que src/lib/ged-depot.ts (deposerFichierGed) :
// anti-doublon par empreinte, upload Storage <org>/<uuid>.<ext>, fiche
// documents, rattachement document_liens (organisation). Ici, un doublon
// d'empreinte est RÉUTILISÉ (re-run idempotent) au lieu d'être refusé.
async function deposerGed(sb, userId, orgId, octets, mime, ext, type, titre) {
  const empreinte = sha256(octets);
  const doublon = ok(
    `GED · recherche doublon « ${titre} »`,
    await sb
      .from("documents")
      .select("id")
      .eq("organization_id", orgId)
      .eq("empreinte", empreinte)
      .is("purged_at", null)
      .maybeSingle()
  );
  if (doublon) return doublon.id;

  const chemin = `${orgId}/${randomUUID()}.${ext}`;
  ok(
    `GED · upload storage « ${titre} »`,
    await sb.storage.from("documents").upload(chemin, octets, { contentType: mime })
  );
  const document = ok(
    `GED · fiche documents « ${titre} »`,
    await sb
      .from("documents")
      .insert({
        organization_id: orgId,
        type,
        titre,
        storage_path: chemin,
        mime_type: mime,
        taille_octets: octets.length,
        empreinte,
        deposited_by: userId,
      })
      .select("id")
      .single()
  );
  ok(
    `GED · document_liens « ${titre} »`,
    await sb.from("document_liens").insert({
      document_id: document.id,
      organization_id: orgId,
      entite: "organisation",
      entite_id: orgId,
    })
  );
  return document.id;
}

// ------------------------------------------------------------
// Connexions (deux clients séparés, sans session persistée)
// ------------------------------------------------------------

const admin = createClient(URL_LOCALE, CLE_ANON, { auth: { persistSession: false } });
const locataire = createClient(URL_LOCALE, CLE_ANON, { auth: { persistSession: false } });

const connAdmin = ok(
  "connexion admin.alpha",
  await admin.auth.signInWithPassword({ email: "admin.alpha@gerimmo-demo.fr", password: MDP })
);
const adminId = connAdmin.user.id;

const connLoc = ok(
  "connexion locataire.alpha",
  await locataire.auth.signInWithPassword({
    email: "locataire.alpha@gerimmo-demo.fr",
    password: MDP,
  })
);
const locataireUid = connLoc.user.id;

// Organisation « Agence Alpha » (via les adhésions du compte, comme l'app)
const adhesions = ok(
  "adhésions admin.alpha",
  await admin
    .from("memberships")
    .select("role, organisation:organizations(id, name)")
    .eq("account_id", adminId)
);
const orgId = (adhesions ?? []).find((a) => a.organisation?.name === "Agence Alpha")
  ?.organisation?.id;
if (!orgId) echec("organisation", "Agence Alpha introuvable dans les adhésions d'admin.alpha");

// ------------------------------------------------------------
// 1. Bien « E2E Résidence des Tests » + son lot unique
//    (parc.ts / creerBien → rpc creer_bien_avec_lot, puis modifierLot)
// ------------------------------------------------------------

const NOM_BIEN = "E2E Résidence des Tests";
let bien = ok(
  "recherche bien E2E",
  await admin
    .from("biens")
    .select("id, nom")
    .eq("organization_id", orgId)
    .eq("nom", NOM_BIEN)
    .maybeSingle()
);
if (!bien) {
  const bienId = ok(
    "rpc creer_bien_avec_lot",
    await admin.rpc("creer_bien_avec_lot", {
      p_org: orgId,
      p_nom: NOM_BIEN,
      p_type: "appartement",
      p_address_line1: "18 rue des Acacias",
      p_address_line2: null,
      p_postal_code: "75012",
      p_city: "Paris",
      p_annee: 1998,
      p_copropriete: false,
      p_surface: 45,
      p_pieces: 2,
    })
  );
  bien = { id: bienId, nom: NOM_BIEN };
  console.log(`· bien créé : ${bienId}`);
} else {
  console.log(`· bien existant : ${bien.id}`);
}

const lot = ok(
  "lot unique du bien",
  await admin
    .from("lots")
    .select("id, nom, etat, pieces")
    .eq("bien_id", bien.id)
    .eq("organization_id", orgId)
    .maybeSingle()
);
if (!lot) echec("lot unique", "aucun lot rattaché au bien E2E");
if (lot.nom === "Lot unique") {
  // parc.ts / modifierLot : le nom du lot se corrige par update direct
  ok(
    "renommage lot E2E",
    await admin
      .from("lots")
      .update({ nom: "E2E Lot 1" })
      .eq("id", lot.id)
      .eq("organization_id", orgId)
  );
  lot.nom = "E2E Lot 1";
}

// ------------------------------------------------------------
// 2. Personnes : « E2E Locataire » (compte locataire.alpha) et
//    « E2E Mandant » (sans compte) — personnes.ts
// ------------------------------------------------------------

// La fiche du seed (Julie Leblanc) porte DÉJÀ le compte locataire.alpha et son
// email (unique par agence) : créer une seconde fiche sur le même compte
// rendrait la résolution de declarer_mon_incident ambiguë (limit 1 sans
// order by). On renomme donc la fiche rattachée au compte — le même update
// que personnes.ts / modifierPersonne — pour qu'elle devienne « E2E Locataire ».
let ficheLocataire = ok(
  "recherche fiche du compte locataire.alpha",
  await admin
    .from("persons")
    .select("id, nom, prenom, email")
    .eq("organization_id", orgId)
    .eq("account_id", locataireUid)
    .is("archived_at", null)
    .maybeSingle()
);
if (!ficheLocataire) {
  // Chemin de secours : fiche créée AVEC account_id, comme parc.ts le fait
  // pour le propriétaire direct (insert persons avec account_id).
  ficheLocataire = ok(
    "création fiche E2E Locataire",
    await admin
      .from("persons")
      .insert({
        organization_id: orgId,
        account_id: locataireUid,
        nom: "Locataire",
        prenom: "E2E",
        email: "locataire.alpha@gerimmo-demo.fr",
      })
      .select("id, nom, prenom, email")
      .single()
  );
  console.log(`· fiche locataire créée : ${ficheLocataire.id}`);
} else if (ficheLocataire.nom !== "Locataire" || ficheLocataire.prenom !== "E2E") {
  ok(
    "renommage fiche locataire en « E2E Locataire »",
    await admin
      .from("persons")
      .update({ nom: "Locataire", prenom: "E2E" })
      .eq("id", ficheLocataire.id)
      .eq("organization_id", orgId)
  );
  console.log(`· fiche locataire renommée : ${ficheLocataire.id}`);
} else {
  console.log(`· fiche locataire existante : ${ficheLocataire.id}`);
}

// Propriétaire mandant « E2E Mandant », sans compte — personnes.ts /
// creerPersonne (email obligatoire et unique par agence).
const EMAIL_MANDANT = "e2e.mandant@gerimmo-demo.fr";
let mandant = ok(
  "recherche E2E Mandant",
  await admin
    .from("persons")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", EMAIL_MANDANT)
    .is("archived_at", null)
    .maybeSingle()
);
if (!mandant) {
  mandant = ok(
    "création E2E Mandant",
    await admin
      .from("persons")
      .insert({
        organization_id: orgId,
        nom: "Mandant",
        prenom: "E2E",
        email: EMAIL_MANDANT,
        telephone: null,
        date_naissance: null,
      })
      .select("id")
      .single()
  );
  console.log(`· mandant créé : ${mandant.id}`);
} else {
  console.log(`· mandant existant : ${mandant.id}`);
}

// ------------------------------------------------------------
// 3. Détention 100 % du mandant sur le lot (parc.ts / ajouterDetention)
//    + mandat de gestion actif (mandats.ts)
// ------------------------------------------------------------

const detention = ok(
  "recherche détention",
  await admin
    .from("detentions")
    .select("id")
    .eq("lot_id", lot.id)
    .eq("person_id", mandant.id)
    .is("date_fin", null)
    .maybeSingle()
);
if (!detention) {
  ok(
    "détention 100 % mandant",
    await admin.from("detentions").insert({
      lot_id: lot.id,
      organization_id: orgId,
      person_id: mandant.id,
      quote_part: 100,
    })
  );
  console.log("· détention 100 % posée");
} else {
  console.log("· détention existante");
}

// Mandat : non exigé par lot_blocages_location pour activer le bail, mais un
// dossier de gestion complet en porte un — même séquence que mandats.ts
// (creerMandat → ajouterLigneMandat → changerEtatMandat ×2).
let mandat = ok(
  "recherche mandat",
  await admin
    .from("mandats")
    .select("id, etat")
    .eq("organization_id", orgId)
    .eq("person_id", mandant.id)
    .neq("etat", "resilie")
    .maybeSingle()
);
if (!mandat) {
  mandat = ok(
    "création mandat (brouillon)",
    await admin
      .from("mandats")
      .insert({
        organization_id: orgId,
        person_id: mandant.id,
        etat: "brouillon",
        date_rapport: 10,
        seuil_delegation: null,
        created_by: adminId,
      })
      .select("id, etat")
      .single()
  );
}
const ligneMandat = ok(
  "recherche ligne de mandat",
  await admin
    .from("mandat_lignes")
    .select("id")
    .eq("mandat_id", mandat.id)
    .eq("lot_id", lot.id)
    .is("date_fin", null)
    .maybeSingle()
);
if (!ligneMandat) {
  ok(
    "ligne de mandat (lot + taux)",
    await admin.from("mandat_lignes").insert({
      organization_id: orgId,
      mandat_id: mandat.id,
      lot_id: lot.id,
      taux_honoraires: 6,
    })
  );
}
// Titulaire du mandat : agent.alpha — choisi par l'admin d'agence
// (RM-18.1.4, déclencheur mandat_titulaire_protege) ; c'est ce qui fait
// entrer tout le dossier E2E dans le « portefeuille » de l'agent
// (périmètre du 09/09) et rend ses écrans profonds visibles en E2E.
{
  const agent = ok(
    "compte de l'agent titulaire",
    await admin
      .from("memberships")
      .select("account_id, compte:accounts(email)")
      .eq("organization_id", orgId)
      .eq("role", "agent")
      .limit(1)
      .maybeSingle()
  );
  if (agent?.account_id) {
    ok(
      "mandat : titulaire agent.alpha",
      await admin
        .from("mandats")
        .update({ agent_account_id: agent.account_id })
        .eq("id", mandat.id)
        .eq("organization_id", orgId)
    );
  }
}
// brouillon → a_signer → actif (une transition à la fois, comme l'app)
for (const [de, vers] of [
  ["brouillon", "a_signer"],
  ["a_signer", "actif"],
]) {
  if (mandat.etat === de) {
    const maj = ok(
      `mandat ${de} → ${vers}`,
      await admin
        .from("mandats")
        .update({ etat: vers })
        .eq("id", mandat.id)
        .eq("organization_id", orgId)
        .eq("etat", de)
        .select("id")
    );
    if ((maj ?? []).length === 0) echec(`mandat ${de} → ${vers}`, "0 ligne modifiée");
    mandat.etat = vers;
  }
}
console.log(`· mandat ${mandat.id} (${mandat.etat})`);

// ------------------------------------------------------------
// Diagnostics exigés par lot_blocages_location : DPE (lot, habitation)
// et ERP (bien) — parc.ts / deposerDiagnostic : dépôt GED (type
// « diagnostic ») + insert diagnostics avec document_id.
// ------------------------------------------------------------

const dpe = ok(
  "recherche DPE",
  await admin
    .from("diagnostics")
    .select("id")
    .eq("lot_id", lot.id)
    .eq("type", "dpe")
    .is("archived_at", null)
    .maybeSingle()
);
if (!dpe) {
  const docDpe = await deposerGed(
    admin,
    adminId,
    orgId,
    pdfMinimal("Rapport DPE — E2E Residence des Tests"),
    "application/pdf",
    "pdf",
    "diagnostic",
    `DPE — ${dateJour}`
  );
  ok(
    "insert diagnostic DPE",
    await admin.from("diagnostics").insert({
      organization_id: orgId,
      bien_id: null,
      lot_id: lot.id,
      type: "dpe",
      date_realisation: dateJour,
      date_expiration: plusMois(120),
      diagnostiqueur: "E2E Diagnostics",
      document_id: docDpe,
      classe_dpe: "C",
    })
  );
  console.log("· DPE déposé (classe C)");
} else {
  console.log("· DPE existant");
}

const erp = ok(
  "recherche ERP",
  await admin
    .from("diagnostics")
    .select("id, date_expiration")
    .eq("bien_id", bien.id)
    .eq("type", "erp")
    .is("archived_at", null)
    .maybeSingle()
);
if (!erp || (erp.date_expiration && erp.date_expiration < dateJour)) {
  const docErp = await deposerGed(
    admin,
    adminId,
    orgId,
    pdfMinimal(`Etat des risques et pollutions — E2E ${dateJour.slice(0, 7)}`),
    "application/pdf",
    "pdf",
    "diagnostic",
    `ERP — état des risques — ${dateJour}`
  );
  ok(
    "insert diagnostic ERP",
    await admin.from("diagnostics").insert({
      organization_id: orgId,
      bien_id: bien.id,
      lot_id: null,
      type: "erp",
      date_realisation: dateJour,
      date_expiration: plusMois(6),
      diagnostiqueur: "E2E Diagnostics",
      document_id: docErp,
      classe_dpe: null,
    })
  );
  console.log("· ERP déposé");
} else {
  console.log("· ERP existant");
}

// ------------------------------------------------------------
// Pièces du lot (parc.ts / proposerPiecesLot) — la grille d'EDL s'appuiera
// dessus au lieu des sept lignes génériques. 2 pièces → liste habituelle.
// ------------------------------------------------------------

const piecesExistantes = ok(
  "pièces du lot",
  await admin.from("lot_pieces").select("id").eq("lot_id", lot.id)
);
if ((piecesExistantes ?? []).length === 0) {
  const habituelles = ["Entrée", "Séjour", "Chambre", "Cuisine", "Salle de bain", "WC"];
  ok(
    "insert lot_pieces",
    await admin
      .from("lot_pieces")
      .insert(habituelles.map((nom, i) => ({ lot_id: lot.id, organization_id: orgId, nom, ordre: i })))
  );
  console.log("· pièces du lot proposées");
} else {
  console.log("· pièces du lot déjà présentes");
}

// ------------------------------------------------------------
// Lot en préparation → disponible (parc.ts / changerEtatLot ; le trigger
// base revérifie lot_blocages_location au passage).
// ------------------------------------------------------------

if (lot.etat === "brouillon") {
  const majLot = await admin
    .from("lots")
    .update({ etat: "disponible" })
    .eq("id", lot.id)
    .eq("organization_id", orgId);
  if (majLot.error) {
    // Diagnostic : lire les blocages restants comme l'app le fait
    const { data: causes } = await admin.rpc("lot_blocages_location", { p_lot: lot.id });
    echec(
      "lot → disponible",
      `${JSON.stringify(majLot.error)} — blocages : ${JSON.stringify(causes)}`
    );
  }
  lot.etat = "disponible";
  console.log("· lot passé en disponible");
} else {
  console.log(`· lot déjà « ${lot.etat} »`);
}

// ------------------------------------------------------------
// 4. Bail NU actif — baux.ts : creerBail (insert brouillon), puis
//    deposerBailSigne (controler_mise_en_location → dépôt GED type « bail »
//    → update document_signe → rpc activer_bail).
// ------------------------------------------------------------

let bail = ok(
  "recherche bail E2E",
  await admin
    .from("baux")
    .select("id, etat, document_signe")
    .eq("organization_id", orgId)
    .eq("lot_id", lot.id)
    .in("etat", ["brouillon", "actif", "preavis"])
    .maybeSingle()
);
if (!bail) {
  bail = ok(
    "création bail (brouillon)",
    await admin
      .from("baux")
      .insert({
        organization_id: orgId,
        lot_id: lot.id,
        etat: "brouillon",
        type: "nu",
        locataire_principal: ficheLocataire.id,
        date_debut: premierDuMois,
        loyer_hc: 650,
        charges: 50,
        charges_mode: "provision",
        depot_garantie: 650,
        jour_echeance: 1,
        irl_trimestre: null,
        revision_irl: false,
      })
      .select("id, etat, document_signe")
      .single()
  );
  console.log(`· bail créé (brouillon) : ${bail.id}`);
} else {
  console.log(`· bail existant : ${bail.id} (${bail.etat})`);
}

if (bail.etat === "brouillon") {
  // Contrôles de mise en location AVANT le dépôt, comme deposerPieceBail
  const controle = await admin.rpc("controler_mise_en_location", { p_bail: bail.id });
  if (controle.error) {
    const { data: causes } = await admin.rpc("lot_blocages_location", { p_lot: lot.id });
    echec(
      "controler_mise_en_location",
      `${JSON.stringify(controle.error)} — blocages : ${JSON.stringify(causes)}`
    );
  }
  const docBail = await deposerGed(
    admin,
    adminId,
    orgId,
    pdfMinimal("Bail signe — E2E Lot 1 — locataire E2E"),
    "application/pdf",
    "pdf",
    "bail",
    "Bail signé"
  );
  ok(
    "rattachement du bail signé",
    await admin
      .from("baux")
      .update({ document_signe: docBail })
      .eq("id", bail.id)
      .eq("organization_id", orgId)
  );
  ok("rpc activer_bail", await admin.rpc("activer_bail", { p_bail: bail.id }));
  bail.etat = "actif";
  console.log("· bail signé déposé et activé — lot loué");
}

// ------------------------------------------------------------
// 5. État des lieux d'ENTRÉE en brouillon + grille générée
//    (edl.ts / creerEdl : insert etats_des_lieux puis rpc generer_grille_edl)
// ------------------------------------------------------------

let edl = ok(
  "recherche EDL d'entrée",
  await admin
    .from("etats_des_lieux")
    .select("id, etat")
    .eq("bail_id", bail.id)
    .eq("type", "entree")
    .maybeSingle()
);
if (!edl) {
  edl = ok(
    "création EDL d'entrée",
    await admin
      .from("etats_des_lieux")
      .insert({ organization_id: orgId, bail_id: bail.id, type: "entree" })
      .select("id, etat")
      .single()
  );
  const nbLignes = ok("rpc generer_grille_edl", await admin.rpc("generer_grille_edl", { p_edl: edl.id }));
  console.log(`· EDL d'entrée créé (brouillon), grille : ${nbLignes} lignes`);
} else {
  const lignes = ok(
    "lignes de la grille EDL",
    await admin.from("edl_lignes").select("id").eq("edl_id", edl.id)
  );
  if ((lignes ?? []).length === 0 && edl.etat !== "signe") {
    ok("rpc generer_grille_edl", await admin.rpc("generer_grille_edl", { p_edl: edl.id }));
  }
  console.log(`· EDL d'entrée existant : ${edl.id} (${edl.etat})`);
}

// ------------------------------------------------------------
// 6. Appel de loyer du mois courant + encaissement partiel de 300 €
//    (loyers.ts : rpc generer_appels_loyer ; insert encaissements puis
//     rpc emettre_quittances — le reçu partiel s'émet tout seul)
// ------------------------------------------------------------

const nbAppels = ok("rpc generer_appels_loyer", await admin.rpc("generer_appels_loyer", { p_bail: bail.id }));
console.log(`· appels générés : ${nbAppels}`);
const appel = ok(
  "appel du mois courant",
  await admin
    .from("appels_loyer")
    .select("id, periode, montant_du")
    .eq("bail_id", bail.id)
    .eq("periode", premierDuMois)
    .maybeSingle()
);
if (!appel) echec("appel du mois courant", "aucun appel de loyer pour " + premierDuMois);

const NOTE_ENC = "E2E encaissement partiel";
let encaissement = ok(
  "recherche encaissement E2E",
  await admin
    .from("encaissements")
    .select("id, montant")
    .eq("bail_id", bail.id)
    .eq("note", NOTE_ENC)
    .maybeSingle()
);
if (!encaissement) {
  encaissement = ok(
    "encaissement partiel 300 €",
    await admin
      .from("encaissements")
      .insert({
        organization_id: orgId,
        bail_id: bail.id,
        montant: 300,
        date_paiement: dateJour,
        mode: "virement",
        note: NOTE_ENC,
      })
      .select("id, montant")
      .single()
  );
  const emission = ok("rpc emettre_quittances", await admin.rpc("emettre_quittances", { p_bail: bail.id }));
  const ligne = (emission ?? [])[0] ?? {};
  console.log(
    `· encaissement 300 € enregistré — ${ligne.nb_quittances ?? 0} quittance(s), ${ligne.nb_recus ?? 0} reçu(s) émis`
  );
} else {
  console.log(`· encaissement existant : ${encaissement.id}`);
}

// ------------------------------------------------------------
// 7. Incident déclaré PAR LE LOCATAIRE (incidents.ts / declarerMonIncident :
//    rpc declarer_mon_incident, puis photo par le chemin de joindrePhotos —
//    upload storage locataire + rpc joindre_photo_incident).
// ------------------------------------------------------------

const DESC_INCIDENT = "E2E Fuite sous l'évier";
let incident = ok(
  "recherche incident E2E",
  await admin
    .from("incidents")
    .select("id, numero, etat")
    .eq("organization_id", orgId)
    .eq("description", DESC_INCIDENT)
    .maybeSingle()
);
if (!incident) {
  const incidentId = ok(
    "rpc declarer_mon_incident (locataire)",
    await locataire.rpc("declarer_mon_incident", {
      p_org: orgId,
      p_categorie: "plomberie_joint",
      p_description: DESC_INCIDENT,
      p_piece: "Cuisine",
      p_anciennete: null,
      p_urgence: "normale",
    })
  );

  // Photo jointe — même séquence que joindrePhotos (client LOCATAIRE) :
  // anti-doublon d'empreinte, upload <org>/<uuid>.jpg, rpc joindre_photo_incident.
  const empreintePhoto = sha256(JPEG_1x1);
  const { data: doublons } = await locataire
    .from("documents")
    .select("empreinte")
    .eq("organization_id", orgId)
    .in("empreinte", [empreintePhoto])
    .is("purged_at", null);
  if ((doublons ?? []).length === 0) {
    const cheminPhoto = `${orgId}/${randomUUID()}.jpg`;
    ok(
      "upload photo incident (locataire)",
      await locataire.storage
        .from("documents")
        .upload(cheminPhoto, JPEG_1x1, { contentType: "image/jpeg" })
    );
    ok(
      "rpc joindre_photo_incident",
      await locataire.rpc("joindre_photo_incident", {
        p_org: orgId,
        p_incident: incidentId,
        p_storage_path: cheminPhoto,
        p_mime: "image/jpeg",
        p_taille: JPEG_1x1.length,
        p_empreinte: empreintePhoto,
      })
    );
    console.log("· photo jointe à l'incident");
  } else {
    console.log("· photo déjà en GED — non redéposée");
  }

  incident = ok(
    "relecture incident créé",
    await admin
      .from("incidents")
      .select("id, numero, etat")
      .eq("id", incidentId)
      .single()
  );
  console.log(`· incident déclaré par le locataire : ${incident.numero}`);
} else {
  console.log(`· incident existant : ${incident.id} (${incident.numero ?? "?"})`);
}

// ------------------------------------------------------------
// Récapitulatif
// ------------------------------------------------------------

const recap = {
  bien: bien.id,
  lot: lot.id,
  bail: bail.id,
  edl: edl.id,
  incident: incident.id,
  appel: appel.id,
  encaissement: encaissement.id,
};
console.log("\nRécapitulatif :");
console.log(JSON.stringify(recap, null, 2));
