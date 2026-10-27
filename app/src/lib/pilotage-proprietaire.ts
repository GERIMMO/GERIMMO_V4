import type { SupabaseClient } from "@supabase/supabase-js";
import { lireToutesLesPages } from "@/lib/lecture-complete";
import { occupationLot } from "@/lib/occupation-lot";
import type { ReglagesEnvoi } from "@/lib/envois-automatiques";

export type LotPilotage = { id: string; nom: string; etat: string; bien_id: string };
export type BailPilotage = { id: string; lot_id: string; etat: string; chambre_id: string | null };
export type ChambrePilotage = { id: string; lot_id: string };
export type DiagnosticPilotage = { id: string; lot_id: string | null; classe_dpe: string | null; date_realisation: string; created_at?: string };

/** Des totaux complets, limités au patrimoine actif et sans confondre logement entier et chambres. */
export function resumerPilotage(biens: { id: string; nom?: string }[], lots: LotPilotage[], baux: BailPilotage[], chambres: ChambrePilotage[]) {
  const idsBiens = new Set(biens.map(b => b.id));
  const nomsBiens = new Map(biens.map(b => [b.id, b.nom]));
  const visibles = lots.filter(l => idsBiens.has(l.bien_id) && l.etat !== "archive").map(lot => {
    const bien = nomsBiens.get(lot.bien_id);
    const nom = bien && (!lot.nom.trim() || lot.nom === "Lot unique") ? bien : lot.nom;
    return { ...lot, nom };
  });
  const idsLots = new Set(visibles.map(l => l.id));
  const contrats = baux.filter(b => idsLots.has(b.lot_id) && ["actif", "preavis"].includes(b.etat));
  const occupes = new Set(contrats.map(b => b.lot_id));
  const engages = new Set(baux.filter(b => ["brouillon", "actif", "preavis"].includes(b.etat)).map(b => b.lot_id));
  const occupations = visibles.map(l => occupationLot(chambres.filter(c => c.lot_id === l.id), contrats.filter(b => b.lot_id === l.id)));
  return {
    biens: biens.length, lots: visibles, contrats: contrats.length, lotsOccupes: occupes.size,
    chambresSansBail: occupations.reduce((n, o) => n + o.chambresSansBail, 0),
    lotsSansBail: visibles.filter(l => l.etat === "disponible" && !engages.has(l.id)),
  };
}

/** Seul le dernier DPE non archivé fait foi dans cette synthèse, même s'il améliore la classe. */
export function diagnosticsASurveiller(diagnostics: DiagnosticPilotage[], lots: LotPilotage[]) {
  const connus = new Map(lots.map(l => [l.id, l]));
  const derniers = new Map<string, DiagnosticPilotage>();
  for (const d of [...diagnostics].sort((a, b) => b.date_realisation.localeCompare(a.date_realisation) || (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id))) {
    if (d.lot_id && connus.has(d.lot_id) && !derniers.has(d.lot_id)) derniers.set(d.lot_id, d);
  }
  return [...derniers.values()].filter(d => d.classe_dpe === "F" || d.classe_dpe === "G")
    .map(d => ({ ...d, lot: connus.get(d.lot_id!)! }));
}

/** Un montant illisible n'est jamais converti en zéro ni présenté comme un total fiable. */
export function totalEncaissements(lignes: { montant: number | string }[]): number | null {
  let centimes = 0;
  for (const ligne of lignes) {
    const montant = typeof ligne.montant === "string" && !ligne.montant.trim() ? NaN : Number(ligne.montant);
    if (!Number.isFinite(montant) || montant <= 0) return null;
    const ajout = Math.round(montant * 100);
    if (Math.abs(montant - ajout / 100) > Number.EPSILON * Math.max(1, Math.abs(montant)) * 4) return null;
    if (!Number.isSafeInteger(ajout) || !Number.isSafeInteger(centimes + ajout)) return null;
    centimes += ajout;
  }
  return centimes / 100;
}

export async function chargerPilotageProprietaire(db: SupabaseClient, orgId: string, aujourdHui: string) {
  const [biens, lots, baux, chambres, encaissements, diagnostics, reglages] = await Promise.all([
    lireToutesLesPages<{ id: string; nom: string }>((debut, fin) => db.from("biens").select("id,nom", { count: "exact" }).eq("organization_id", orgId).is("archived_at", null).order("id").range(debut, fin), l => l.id),
    lireToutesLesPages<LotPilotage>((debut, fin) => db.from("lots").select("id,nom,etat,bien_id", { count: "exact" }).eq("organization_id", orgId).neq("etat", "archive").order("id").range(debut, fin), l => l.id),
    lireToutesLesPages<BailPilotage>((debut, fin) => db.from("baux").select("id,lot_id,etat,chambre_id", { count: "exact" }).eq("organization_id", orgId).in("etat", ["brouillon", "actif", "preavis"]).order("id").range(debut, fin), l => l.id),
    lireToutesLesPages<ChambrePilotage>((debut, fin) => db.from("lot_chambres").select("id,lot_id", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin), l => l.id),
    lireToutesLesPages<{ id: string; montant: number | string }>((debut, fin) => db.from("encaissements").select("id,montant", { count: "exact" }).eq("organization_id", orgId).gte("date_paiement", `${aujourdHui.slice(0, 7)}-01`).lte("date_paiement", aujourdHui).order("id").range(debut, fin), l => l.id),
    lireToutesLesPages<DiagnosticPilotage>((debut, fin) => db.from("diagnostics").select("id,lot_id,classe_dpe,date_realisation,created_at", { count: "exact" }).eq("organization_id", orgId).eq("type", "dpe").is("archived_at", null).order("id").range(debut, fin), l => l.id),
    db.from("organizations").select("quittances_envoi_auto,appels_envoi_auto,relances_envoi_auto").eq("id", orgId).maybeSingle(),
  ]);
  const patrimoineIllisible = Boolean(biens.echec || lots.echec || baux.echec || chambres.echec);
  const lotsAffichables = lots.echec || biens.echec ? null : resumerPilotage(biens.lignes, lots.lignes, [], []).lots;
  return {
    patrimoine: patrimoineIllisible ? null : resumerPilotage(biens.lignes!, lots.lignes!, baux.lignes!, chambres.lignes!),
    encaisse: encaissements.echec ? null : totalEncaissements(encaissements.lignes),
    diagnostics: diagnostics.echec || lotsAffichables === null ? null : diagnosticsASurveiller(diagnostics.lignes, lotsAffichables),
    reglages: reglages.error ? null : reglages.data as ReglagesEnvoi | null,
  };
}
