import "server-only";
// L'ARCHIVE COMPLÈTE DES DONNÉES D'UN ESPACE (plan de conformité du 23/10/2026, R49 : RGPD art. 15, 20 et 28.3 g).
//
// Demandée par le titulaire seul, avec son second facteur ou un mot de passe saisi depuis moins de quinze minutes
// (`demander_export_complet`, migration 20261024130000). Préparée ensuite, hors de la réponse à sa demande : un fichier
// CSV par table de l'organisation, le compte et ses acceptations des conditions en JSON, tous les fichiers de l'espace
// (documents signés et certificats compris), dans une archive ZIP déposée dans le compartiment privé
// `exports-complets`. Le titulaire la télécharge par un lien signé valable 24 heures ; elle est supprimée après sept
// jours (mission « purge »). Chaque demande, préparation et téléchargement est inscrit au journal d'audit ; chaque pièce
// sensible contenue (pièces d'identité, justificatifs) l'est au journal des accès aux pièces.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { neutraliserFormule } from "@/lib/csv-sur";
import { creerZip, type EntreeZip } from "@/lib/zip";

export const COMPARTIMENT_EXPORTS = "exports-complets";
/** Au-delà, l'archive n'est pas préparée : la demande échoue avec un message, sans rien déposer. */
export const TAILLE_MAX_EXPORT_OCTETS = 400 * 1024 * 1024;
/** Durée du lien signé de téléchargement. */
export const DUREE_LIEN_EXPORT_SECONDES = 24 * 3600;
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

const LISEZ_MOI = `Archive complète de votre espace Gerimmo

- donnees/ : un fichier CSV par table de votre espace (séparateur point-virgule, encodage UTF-8).
- compte.json : votre compte, vos accès et vos acceptations des conditions générales.
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
      db.rpc("export_complet_donnees", { p_org: x.organisation_id_export }),
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
    for (const f of listeFichiers) {
      await avant();
      const { data: blob, error: telechargement } = await db.storage.from("documents").download(f.chemin);
      if (telechargement || !blob) return await echec("Un fichier de l'espace n'a pas pu être lu ; réessayez plus tard.");
      entrees.push({ nom: `fichiers/${f.chemin.startsWith(prefixe) ? f.chemin.slice(prefixe.length) : f.chemin}`, contenu: new Uint8Array(await blob.arrayBuffer()) });
    }
    const pieces = (tables.documents ?? [])
      .filter((d) => TYPES_SENSIBLES.has(String(d.type)) && typeof d.storage_path === "string" && typeof d.id === "string")
      .map((d) => String(d.id));
    const archive = creerZip(entrees);
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

/** Le lien signé (24 h) d'une archive prête, pour celui qui l'a demandée ; le téléchargement est journalisé d'abord. */
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
  const { data: signe, error: signature } = await db.storage.from(COMPARTIMENT_EXPORTS).createSignedUrl(x.chemin, DUREE_LIEN_EXPORT_SECONDES, {
    download: `gerimmo-archive-${exportId.slice(0, 8)}.zip`,
  });
  if (signature || !signe?.signedUrl) return { erreur: "Le lien de téléchargement n'a pas pu être créé : réessayez." };
  return { url: signe.signedUrl };
}
