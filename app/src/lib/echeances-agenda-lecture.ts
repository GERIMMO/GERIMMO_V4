import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { construireEcheances, type CongeLu, type EcheanceAgenda, type EdlLu, type FinBailLue, type LimiteRevisionLue, type LoyerLu } from "@/lib/echeances-agenda";
import { dateLimiteRevision, derniereDateAnniversaire } from "@/lib/baux";

// Lecture des échéances d'un mois pour l'agenda du propriétaire (audit palier 1, P2-06).
//
// Quatre lectures bornées au mois affiché, toutes filtrées par l'espace (et par le cloisonnement de la base) :
// les loyers appelés, les états des lieux datés, les baux en cours qui portent une date de fin, les congés non annulés.
// Décision Q34 du 24/11/2026 : s'y ajoute la date limite de la révision annuelle du loyer, pour les baux en cours qui
// prévoient la révision (lectures des baux, de leurs révisions et du dernier DPE de leur logement).
// Une lecture en échec n'est jamais présentée comme « aucune échéance » : l'écran le dit. L'état d'un loyer (reçu ou
// non) vient de la même fonction que l'écran des loyers ; s'il ne peut pas être lu, le loyer s'affiche sans état.

type Personne = { nom: string | null; prenom: string | null };
type BailLie = { id: string; etat?: string; locataire: UnOuPlusieurs<Personne> | null; lot: UnOuPlusieurs<{ id: string; nom: string | null }> | null };
const BAIL = "id, etat, locataire:persons!baux_locataire_meme_org_fk(nom, prenom), lot:lots!baux_lot_meme_org_fk(id, nom)";
// Écrite en entier (et non « BAIL + … ») : le contrôle des jointures du projet lit les sélections telles quelles.
const BAIL_REVISABLE = "id, etat, lot_id, date_debut, locataire:persons!baux_locataire_meme_org_fk(nom, prenom), lot:lots!baux_lot_meme_org_fk(id, nom)";
const BAIL_ET_SA_FIN = "id, etat, date_fin, locataire:persons!baux_locataire_meme_org_fk(nom, prenom), lot:lots!baux_lot_meme_org_fk(id, nom)";
/** Au-delà, le mois n'est pas affiché à moitié : l'écran dit que la lecture est incomplète. */
const PLAFOND = 500;

function identite(bail: BailLie | undefined) {
  const p = premier(bail?.locataire);
  return {
    locataire: p ? [p.prenom, p.nom].filter(Boolean).join(" ") || null : null,
    lotNom: premier(bail?.lot)?.nom ?? null,
  };
}
const centimes = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
const jour = (v: string) => String(v).slice(0, 10);
function veilleDe(j: string): string {
  const d = new Date(`${j}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function chargerEcheancesAgenda(
  supabase: SupabaseClient,
  orgId: string,
  mois: { premier: string; suivant: string },
  base: string,
  aujourdHui: string,
): Promise<{ liste: EcheanceAgenda[]; erreur: boolean }> {
  const borne = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T, colonne: string) =>
    q.gte(colonne, mois.premier).lt(colonne, mois.suivant);
  const [appels, edls, baux, conges, revisables] = await Promise.all([
    borne(supabase.from("appels_loyer")
      .select(`id, bail_id, periode, date_echeance, montant_du, bail:baux!appels_loyer_bail_meme_org_fk!inner(${BAIL})`)
      .eq("organization_id", orgId), "date_echeance").order("date_echeance").order("id").limit(PLAFOND),
    borne(supabase.from("etats_des_lieux")
      .select(`id, bail_id, type, etat, date_edl, bail:baux!edl_bail_meme_org_fk!inner(${BAIL})`)
      .eq("organization_id", orgId), "date_edl").order("date_edl").order("id").limit(PLAFOND),
    borne(supabase.from("baux").select(BAIL_ET_SA_FIN)
      .eq("organization_id", orgId).in("etat", ["actif", "preavis"]), "date_fin").order("date_fin").order("id").limit(PLAFOND),
    borne(supabase.from("conges")
      .select(`id, bail_id, par, date_effet, bail:baux!conges_bail_meme_org_fk!inner(${BAIL})`)
      .eq("organization_id", orgId).is("annule_le", null), "date_effet").order("date_effet").order("id").limit(PLAFOND),
    // Q34 : la date limite se calcule (elle n'est pas en base) : on lit les baux en cours qui prévoient la révision.
    supabase.from("baux").select(BAIL_REVISABLE)
      .eq("organization_id", orgId).eq("etat", "actif").eq("revision_irl", true).order("id").limit(PLAFOND),
  ]);
  if (appels.error || edls.error || baux.error || conges.error || revisables.error) return { liste: [], erreur: true };
  const lignesAppels = (appels.data ?? []) as unknown as { id: string; bail_id: string; periode: string; date_echeance: string; montant_du: number | string; bail: UnOuPlusieurs<BailLie> }[];
  const lignesEdl = (edls.data ?? []) as unknown as { id: string; bail_id: string; type: string; etat: string; date_edl: string; bail: UnOuPlusieurs<BailLie> }[];
  const lignesBaux = (baux.data ?? []) as unknown as (BailLie & { date_fin: string })[];
  const lignesConges = (conges.data ?? []) as unknown as { id: string; bail_id: string; par: string; date_effet: string; bail: UnOuPlusieurs<BailLie> }[];
  const lignesRevisables = (revisables.data ?? []) as unknown as (BailLie & { lot_id: string; date_debut: string | null })[];
  if ([lignesAppels, lignesEdl, lignesBaux, lignesConges, lignesRevisables].some((l) => l.length >= PLAFOND)) return { liste: [], erreur: true };

  // Q34 — la date limite de révision qui tombe dans le mois affiché : c'est la veille d'une date anniversaire du bail, et
  // la révision qu'elle clôt est celle prévue à la date anniversaire d'avant. Elle ne s'affiche pas si cette révision est
  // enregistrée, ni si le dernier DPE du logement est classé F ou G (la base refuserait la révision : même règle que le
  // rappel de « À faire »).
  const aSurveiller = lignesRevisables.flatMap((b) => {
    const prochaine = derniereDateAnniversaire(b.date_debut, mois.suivant);
    if (!prochaine) return [];
    const revisionPrevueLe = derniereDateAnniversaire(b.date_debut, veilleDe(prochaine));
    const limite = revisionPrevueLe ? dateLimiteRevision(b.date_debut, revisionPrevueLe) : null;
    return revisionPrevueLe && limite && limite >= mois.premier && limite < mois.suivant ? [{ bail: b, revisionPrevueLe, limite }] : [];
  });
  let limitesRevision: LimiteRevisionLue[] = [];
  if (aSurveiller.length > 0) {
    const [revisions, dpe] = await Promise.all([
      supabase.from("revisions_loyer").select("id, bail_id, date_effet")
        .eq("organization_id", orgId).in("bail_id", aSurveiller.map((x) => x.bail.id)).order("id").limit(PLAFOND * 4),
      supabase.from("diagnostics").select("id, lot_id, classe_dpe, date_realisation")
        .eq("organization_id", orgId).eq("type", "dpe").is("archived_at", null)
        .in("lot_id", [...new Set(aSurveiller.map((x) => x.bail.lot_id))]).order("id").limit(PLAFOND * 4),
    ]);
    if (revisions.error || dpe.error || (revisions.data ?? []).length >= PLAFOND * 4 || (dpe.data ?? []).length >= PLAFOND * 4) return { liste: [], erreur: true };
    const lignesRevisions = (revisions.data ?? []) as { bail_id: string; date_effet: string }[];
    const lignesDpe = (dpe.data ?? []) as { lot_id: string; classe_dpe: string | null; date_realisation: string | null }[];
    limitesRevision = aSurveiller
      .filter((x) => !lignesRevisions.some((r) => r.bail_id === x.bail.id && jour(r.date_effet) >= x.revisionPrevueLe && jour(r.date_effet) <= x.limite))
      .filter((x) => {
        const dernier = lignesDpe.filter((d) => d.lot_id === x.bail.lot_id)
          .sort((a, b) => (b.date_realisation ?? "").localeCompare(a.date_realisation ?? ""))[0];
        return !["F", "G"].includes(dernier?.classe_dpe ?? "");
      })
      .map((x) => ({ bailId: x.bail.id, jour: x.limite, revisionPrevueLe: x.revisionPrevueLe, ...identite(x.bail) }));
  }

  // L'état des règlements, mois appelé par mois appelé (un loyer échu le 5 décembre peut être celui de novembre).
  const couverts = new Map<string, number>();
  const periodes = [...new Set(lignesAppels.filter((a) => premier(a.bail)?.etat !== "brouillon").map((a) => jour(a.periode).slice(0, 7)))];
  const etats = await Promise.all(periodes.map((p) => supabase.rpc("quittancement_mois", { p_org: orgId, p_mois: `${p}-01` })));
  const etatLu = etats.every((e) => !e.error);
  for (const e of etats) for (const l of ((e.data ?? []) as { appel_id: string; montant_couvert: number | string }[])) couverts.set(l.appel_id, centimes(l.montant_couvert));

  const loyers: LoyerLu[] = lignesAppels
    .filter((a) => premier(a.bail)?.etat !== "brouillon")
    .map((a) => ({
      appelId: a.id, bailId: a.bail_id, jour: jour(a.date_echeance), ...identite(premier(a.bail)),
      duCentimes: centimes(a.montant_du),
      couvertCentimes: etatLu && couverts.has(a.id) ? couverts.get(a.id)! : null,
    }));
  const etatsDesLieux: EdlLu[] = lignesEdl.map((e) => ({
    id: e.id, bailId: e.bail_id, jour: jour(e.date_edl), type: e.type, signe: e.etat === "signe", ...identite(premier(e.bail)),
  }));
  const finsDeBail: FinBailLue[] = lignesBaux.map((b) => ({ bailId: b.id, jour: jour(b.date_fin), ...identite(b) }));
  const lesConges: CongeLu[] = lignesConges
    .filter((c) => ["actif", "preavis"].includes(premier(c.bail)?.etat ?? ""))
    .map((c) => ({ id: c.id, bailId: c.bail_id, jour: jour(c.date_effet), par: c.par, ...identite(premier(c.bail)) }));
  return { liste: construireEcheances(base, aujourdHui, { loyers, edls: etatsDesLieux, finsDeBail, conges: lesConges, limitesRevision }), erreur: false };
}
