import "server-only";
// L'ARCHIVE COMPLÈTE DES DONNÉES D'UN ESPACE (plan de conformité du 23/10/2026, R49 : RGPD art. 15, 20 et 28.3 g).
//
// Demandée par le titulaire seul, avec son second facteur ou un mot de passe saisi depuis moins de quinze minutes
// (`demander_export_complet`, migration 20261024130000). Préparée ensuite, hors de la réponse à sa demande : un fichier
// CSV par table de l'organisation, le compte et ses acceptations des conditions en JSON, tous les fichiers de l'espace
// (documents signés et certificats compris), dans une archive ZIP déposée dans le compartiment privé
// `exports-complets`. Le titulaire la télécharge par le lien de son espace, valable 24 heures ; elle est supprimée après sept
// jours (mission « purge »). Chaque demande, préparation et téléchargement est inscrit au journal d'audit ; chaque pièce
// sensible contenue (pièces d'identité, justificatifs) l'est au journal des accès aux pièces.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { neutraliserFormule } from "@/lib/csv-sur";
import { creerZip, nomZipSur, type EntreeZip } from "@/lib/zip";

export const COMPARTIMENT_EXPORTS = "exports-complets";
/** Au-delà, l'archive n'est pas préparée : la demande échoue avec un message, sans rien déposer. */
export const TAILLE_MAX_EXPORT_OCTETS = 400 * 1024 * 1024;
/** La redirection technique est émise après contrôle de session et valable une minute. */
export const DUREE_LIEN_EXPORT_SECONDES = 60;
const DUREE_LIEN_ESPACE_MS = 24 * 60 * 60 * 1000;

type PorteeLien = { orgId: string; accountId: string; exportId: string };

/** Preuve limitée à cette opération. Une rotation de la clé de service invalide les liens
 * d’espace précédents. Le titulaire peut en obtenir de nouveaux tant que l’archive existe. */
function preuveLienArchive(p: PorteeLien, echeance: string): string | null {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) return null;
  return createHmac("sha256", cle)
    .update(JSON.stringify(["gerimmo/export-complet/v1", p.orgId, p.accountId, p.exportId, echeance]))
    .digest("base64url");
}

export function lienArchiveEspace(route: string, p: PorteeLien & { finConservation?: string }, maintenant = Date.now()): string | null {
  const expiration = p.finConservation === undefined ? maintenant + DUREE_LIEN_ESPACE_MS
    : Math.min(maintenant + DUREE_LIEN_ESPACE_MS, Date.parse(p.finConservation));
  if (!Number.isFinite(expiration) || expiration <= maintenant) return null;
  const jusquau = String(expiration);
  const preuve = preuveLienArchive(p, jusquau);
  if (!preuve) return null;
  return `${route}?${new URLSearchParams({ archive: p.exportId, jusquau, preuve })}`;
}

export function verifierLienArchiveEspace(p: PorteeLien, query: URLSearchParams, maintenant = Date.now()): boolean {
  const echeance = query.get("jusquau") ?? "";
  const preuve = query.get("preuve") ?? "";
  if (!/^\d{13}$/.test(echeance) || !/^[A-Za-z0-9_-]{43}$/.test(preuve)) return false;
  if (+echeance <= maintenant || +echeance > maintenant + DUREE_LIEN_ESPACE_MS) return false;
  const attendue = preuveLienArchive(p, echeance);
  return attendue !== null && timingSafeEqual(Buffer.from(preuve), Buffer.from(attendue));
}

const TYPES_SENSIBLES = new Set(["piece_identite", "justificatif"]);

/** Une valeur JSON en cellule CSV : texte protégé contre les formules, nombres et booléens tels quels, objets en JSON. */
export function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  const texte =
    typeof valeur === "string" ? neutraliserFormule(valeur)
    : typeof valeur === "number" || typeof valeur === "boolean" ? String(valeur)
    : JSON.stringify(valeur);
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Les lignes d'une table en CSV (séparateur « ; », BOM pour les tableurs), colonnes dans l'ordre de première apparition. */
export function tableEnCsv(lignes: Record<string, unknown>[]): string {
  const colonnes: string[] = [];
  for (const l of lignes) for (const c of Object.keys(l)) if (!colonnes.includes(c)) colonnes.push(c);
  const corps = lignes.map((l) => colonnes.map((c) => celluleCsv(l[c])).join(";"));
  return `﻿${[colonnes.join(";"), ...corps].join("\r\n")}\r\n`;
}

type LigneDonnee = Record<string, unknown>;
type TablesExport = Record<string, LigneDonnee[]>;

function identifiants(lignes: LigneDonnee[], colonne = "id"): Set<unknown> {
  return new Set(lignes.map((ligne) => ligne[colonne]).filter((id) => typeof id === "string" && id.length > 0));
}

/** Classe uniquement les lignes et fichiers déjà inclus dans l’archive de cet espace. */
function dossiersLogements(tables: TablesExport, fichiers: Map<string, EntreeZip>): EntreeZip[] {
  const logements = (tables.lots ?? []).filter((lot) => typeof lot.id === "string");
  if (logements.length === 0) return [];
  const entrees: EntreeZip[] = [];
  const index: LigneDonnee[] = [];
  for (const lot of logements) {
    const dossier = `logements/${lot.id}`;
    const bien = (tables.biens ?? []).find((ligne) => ligne.id === lot.bien_id);
    const baux = (tables.baux ?? []).filter((bail) => bail.lot_id === lot.id);
    const idsBaux = identifiants(baux);
    const historique = Object.fromEntries(Object.entries(tables).map(([table, lignes]) => [
      table, lignes.filter((ligne) => ligne.lot_id === lot.id || idsBaux.has(ligne.bail_id)),
    ]).filter(([, lignes]) => lignes.length > 0)) as TablesExport;
    const personnes = new Set([
      ...identifiants(historique.detentions ?? [], "person_id"),
      ...identifiants(baux, "locataire_principal"),
      ...identifiants(historique.bail_personnes ?? [], "person_id"),
    ]);
    historique.persons = (tables.persons ?? []).filter((personne) => personnes.has(personne.id));
    historique.lots = [lot];
    if (bien) historique.biens = [bien];

    const idsIncidents = identifiants(historique.incidents ?? []);
    const liens = (tables.document_liens ?? []).filter((lien) =>
      (lien.entite === "lot" && lien.entite_id === lot.id)
      || (lien.entite === "bail" && idsBaux.has(lien.entite_id))
      || (lien.entite === "incident" && idsIncidents.has(lien.entite_id))
    );
    const idsDocuments = identifiants(liens, "document_id");
    for (const circuit of historique.bail_signature_circuits ?? []) {
      if (!Array.isArray(circuit.annexes)) continue;
      for (const annexe of circuit.annexes) {
        if (annexe && typeof annexe.id === "string") idsDocuments.add(annexe.id);
      }
    }
    for (const lignes of Object.values(historique)) {
      for (const colonne of ["document_id", "document_signe", "preuve_document_id", "photo_document_id", "reglement_copropriete"]) {
        for (const id of identifiants(lignes, colonne)) idsDocuments.add(id);
      }
    }
    const documents = (tables.documents ?? []).filter((document) => idsDocuments.has(document.id));
    const indexPieces = documents.map((document) => {
      const fichier = typeof document.storage_path === "string" ? fichiers.get(document.storage_path) : undefined;
      const nom = fichier?.nom.split("/").at(-1);
      const chemin = nom ? `pieces/${document.id}/${nom}` : null;
      if (fichier && chemin) {
        const date = new Date(String(document.created_at ?? ""));
        entrees.push({ ...fichier, nom: `${dossier}/${chemin}`, date: Number.isNaN(date.getTime()) ? undefined : date });
      }
      return { ...document, fichier: chemin, etat_fichier: chemin ? "inclus" : "indisponible" };
    });
    entrees.push({ nom: `${dossier}/index.csv`, contenu: indexPieces.length ? tableEnCsv(indexPieces) : "Fichier;État\r\n" });
    historique.document_liens = liens;
    for (const [table, lignes] of Object.entries(historique)) {
      if (lignes.length > 0) entrees.push({ nom: `${dossier}/historique/${table}.csv`, contenu: tableEnCsv(lignes) });
    }
    index.push({ logement: lot.nom, bien: bien?.nom, adresse: bien?.address_line1, ville: bien?.city, dossier, pieces: indexPieces.length });
  }
  return [{ nom: "logements/index.csv", contenu: tableEnCsv(index) }, ...entrees];
}

const LISEZ_MOI = `Archive complète de votre espace Gerimmo

- donnees/ : un fichier CSV par table de votre espace (séparateur point-virgule, encodage UTF-8).
- compte.json : votre compte, vos accès et vos acceptations des conditions générales.
- logements/ : un index des logements, puis un dossier par logement avec son historique et les pièces liées.
- fichiers/ : tous les fichiers de votre espace, documents signés et certificats compris, rangés comme dans Gerimmo.

Cette archive contient des données personnelles (les vôtres, celles de vos locataires et de leurs garants) :
conservez-la en lieu sûr et supprimez-la quand vous n'en avez plus besoin.
`;

type LigneExport = { id: string; organisation_id_export: string; demande_par: string; statut: string };

export type ResultatConstruction = { ok: true; fichiers: number; tables: number; octets: number } | { ok: false; erreur: string };

/** Prépare une archive demandée (ou reprend une préparation interrompue). Sans effet si une autre passe la tient. */
export async function construireExportComplet(
  db: SupabaseClient,
  exportId: string,
  avant: () => Promise<void> = async () => {}
): Promise<ResultatConstruction | null> {
  const { data: pris, error: prise } = await db.rpc("prendre_export_complet", { p_export: exportId });
  if (prise) return { ok: false, erreur: "La préparation n'a pas pu commencer." };
  if (pris !== true) return null;
  const echec = async (erreur: string): Promise<ResultatConstruction> => {
    await db.rpc("terminer_export_complet", {
      p_export: exportId, p_chemin: null, p_taille: null, p_empreinte: null, p_fichiers: null, p_tables: null, p_pieces: null, p_erreur: erreur,
    });
    return { ok: false, erreur };
  };
  try {
    const { data: ligne, error: lecture } = await db
      .from("exports_complets").select("id, organisation_id_export, demande_par, statut").eq("id", exportId).single();
    if (lecture || !ligne) return await echec("Demande d'archive illisible.");
    const x = ligne as LigneExport;
    const [donnees, compte, fichiers] = await Promise.all([
      // Seulement ce que le demandeur lit lui-même (relecture du 24/10, B2 : RLS et droits rejoués par la base).
      db.rpc("export_complet_donnees", { p_org: x.organisation_id_export, p_account: x.demande_par }),
      db.rpc("export_complet_compte", { p_account: x.demande_par }),
      db.rpc("export_complet_fichiers", { p_org: x.organisation_id_export }),
    ]);
    if (donnees.error || compte.error || fichiers.error) return await echec("Les données de l'espace n'ont pas pu être lues.");
    const tables = (donnees.data ?? {}) as Record<string, Record<string, unknown>[]>;
    const listeFichiers = (fichiers.data ?? []) as { chemin: string; taille: number | string }[];
    const total = listeFichiers.reduce((n, f) => n + Number(f.taille ?? 0), 0);
    if (total > TAILLE_MAX_EXPORT_OCTETS) {
      return await echec("Les fichiers de cet espace dépassent 400 Mo : écrivez-nous depuis « Mes données personnelles », nous vous transmettons l'archive autrement.");
    }
    const entrees: EntreeZip[] = [
      { nom: "LISEZ-MOI.txt", contenu: LISEZ_MOI },
      { nom: "compte.json", contenu: JSON.stringify(compte.data ?? {}, null, 2) },
    ];
    for (const [table, lignes] of Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))) {
      entrees.push({ nom: `donnees/${table}.csv`, contenu: tableEnCsv(lignes) });
    }
    const prefixe = `${x.organisation_id_export}/`;
    const fichiersParChemin = new Map<string, EntreeZip>();
    for (const f of listeFichiers) {
      await avant();
      const { data: blob, error: telechargement } = await db.storage.from("documents").download(f.chemin);
      if (telechargement || !blob) return await echec("Un fichier de l'espace n'a pas pu être lu ; réessayez plus tard.");
      const entree = {
        nom: nomZipSur(`fichiers/${f.chemin.startsWith(prefixe) ? f.chemin.slice(prefixe.length) : f.chemin}`),
        contenu: new Uint8Array(await blob.arrayBuffer()),
      };
      fichiersParChemin.set(f.chemin, entree);
      entrees.push(entree);
    }
    const pieces = (tables.documents ?? [])
      .filter((d) => TYPES_SENSIBLES.has(String(d.type)) && typeof d.storage_path === "string" && typeof d.id === "string")
      .map((d) => String(d.id));
    const dossiers = dossiersLogements(tables, fichiersParChemin);
    const volume = [...entrees, ...dossiers].reduce((octets, entree) => octets + (
      typeof entree.contenu === "string" ? Buffer.byteLength(entree.contenu) : entree.contenu.byteLength
    ), 0);
    if (volume > TAILLE_MAX_EXPORT_OCTETS) {
      return await echec("L’archive dépasse 400 Mo : écrivez-nous depuis « Mes données personnelles » pour recevoir vos données.");
    }
    const archive = creerZip([...entrees, ...dossiers]);
    const empreinte = createHash("sha256").update(archive).digest("hex");
    const chemin = `${x.organisation_id_export}/${exportId}.zip`;
    await avant();
    const { error: depot } = await db.storage.from(COMPARTIMENT_EXPORTS).upload(chemin, archive, { contentType: "application/zip", upsert: true });
    if (depot) return await echec("L'archive n'a pas pu être déposée ; réessayez plus tard.");
    const { error: fin } = await db.rpc("terminer_export_complet", {
      p_export: exportId, p_chemin: chemin, p_taille: archive.length, p_empreinte: empreinte,
      p_fichiers: listeFichiers.length, p_tables: Object.keys(tables).length, p_pieces: pieces, p_erreur: null,
    });
    if (fin) return { ok: false, erreur: "L'archive est déposée mais son enregistrement n'est pas confirmé." };
    return { ok: true, fichiers: listeFichiers.length, tables: Object.keys(tables).length, octets: archive.length };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return await echec("La préparation de l'archive a été interrompue ; réessayez plus tard.");
  }
}

/** Une préparation interrompue (fonction coupée) : passé ce délai, un nouveau clic la reprend sans attendre la nuit. */
export const DELAI_REPRISE_EXPORT_MINUTES = 15;

/**
 * L'archive de cet espace, demandée par ce compte, dont la préparation est restée en plan (demandée ou commencée depuis
 * plus de quinze minutes) : relecture du 24/10 (R2-8), un nouveau clic la reprend au lieu de répondre « déjà en
 * préparation » jusqu'à la nuit.
 */
export async function exportBloque(db: SupabaseClient, orgId: string, accountId: string): Promise<string | null> {
  const limite = new Date(Date.now() - DELAI_REPRISE_EXPORT_MINUTES * 60_000).toISOString();
  const { data, error } = await db
    .from("exports_complets").select("id")
    .eq("organisation_id_export", orgId).eq("demande_par", accountId)
    .or(`and(statut.eq.demande,demande_le.lt.${limite}),and(statut.eq.en_cours,commence_le.lt.${limite})`)
    .order("demande_le", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Les demandes en attente (ou dont la préparation s'est interrompue), préparées une à une. */
export async function construireExportsEnAttente(
  db: SupabaseClient,
  avant: () => Promise<void>,
  maximum: number
): Promise<{ prepares: number; echecs: number }> {
  const limite = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await db
    .from("exports_complets").select("id")
    .or(`statut.eq.demande,and(statut.eq.en_cours,commence_le.lt.${limite})`)
    .order("demande_le", { ascending: true }).limit(maximum);
  if (error) return { prepares: 0, echecs: 1 };
  let prepares = 0;
  let echecs = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const r = await construireExportComplet(db, id, avant);
    if (r?.ok) prepares++;
    else if (r) echecs++;
  }
  return { prepares, echecs };
}

/** Les archives arrivées au terme de leurs sept jours : fichier retiré, puis ligne marquée « expirée ». */
export async function supprimerExportsExpires(db: SupabaseClient, avant: () => Promise<void>): Promise<{ supprimes: number; echecs: number }> {
  const { data, error } = await db.rpc("exports_complets_a_supprimer", { p_limite: 50 });
  if (error) return { supprimes: 0, echecs: 1 };
  let supprimes = 0;
  let echecs = 0;
  for (const x of (data ?? []) as { id: string; chemin: string | null }[]) {
    if (x.chemin) {
      await avant();
      const { error: retrait } = await db.storage.from(COMPARTIMENT_EXPORTS).remove([x.chemin]);
      if (retrait) { echecs++; continue; }
    }
    const { error: marque } = await db.rpc("export_complet_supprime", { p_export: x.id });
    if (marque) echecs++;
    else supprimes++;
  }
  return { supprimes, echecs };
}

/** La redirection signée temporaire d'une archive prête, pour celui qui l'a demandée ; le téléchargement est journalisé d'abord. */
export async function lienExportComplet(
  db: SupabaseClient,
  p: { exportId: string; accountId: string; orgId: string }
): Promise<{ url: string } | { erreur: string }> {
  const { exportId, accountId, orgId } = p;
  const { data: ligne, error } = await db
    .from("exports_complets").select("chemin, statut, demande_par, expire_le, organisation_id_export").eq("id", exportId).single();
  if (error || !ligne) return { erreur: "Archive introuvable." };
  const x = ligne as { chemin: string | null; statut: string; demande_par: string; expire_le: string | null; organisation_id_export: string };
  if (x.demande_par !== accountId || x.organisation_id_export !== orgId || x.statut !== "pret" || !x.chemin || !x.expire_le
      || new Date(x.expire_le) <= new Date()) {
    return { erreur: "Cette archive n'est pas disponible : demandez-en une nouvelle." };
  }
  // Toujours titulaire de l'espace au moment du téléchargement.
  const { data: adhesion, error: droits } = await db
    .from("memberships").select("id").eq("account_id", accountId).eq("organization_id", orgId).eq("status", "active")
    .in("role", ["admin_agence", "proprietaire_direct"]).limit(1).maybeSingle();
  if (droits || !adhesion) return { erreur: "Réservé au titulaire de l'espace." };
  const { error: trace } = await db.rpc("export_complet_telecharge", { p_export: exportId, p_account: accountId });
  if (trace) return { erreur: "Le téléchargement n'a pas pu être enregistré : réessayez." };
  const reste = Math.floor((Date.parse(x.expire_le) - Date.now()) / 1000);
  if (!Number.isFinite(reste) || reste < 1) return { erreur: "Cette archive a expiré." };
  const { data: signe, error: signature } = await db.storage.from(COMPARTIMENT_EXPORTS).createSignedUrl(x.chemin, Math.min(reste, DUREE_LIEN_EXPORT_SECONDES), {
    download: `gerimmo-archive-${exportId.slice(0, 8)}.zip`,
  });
  if (signature || !signe?.signedUrl) return { erreur: "Le lien de téléchargement n'a pas pu être créé : réessayez." };
  return { url: signe.signedUrl };
}
