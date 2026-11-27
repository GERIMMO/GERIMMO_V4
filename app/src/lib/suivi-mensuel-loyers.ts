import type { SupabaseClient } from "@supabase/supabase-js";
import type { LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";
import { lireEntitesPatrimoine, titulaireDuLoyer } from "./entites-patrimoine";
import { aujourdhuiParis } from "./ged";
import { lireToutesLesPages } from "./lecture-complete";
import { ventilerLoyers } from "./loyers-parc-mois";

export function lireSelectionLoyers(recherche: Record<string, string | string[] | undefined>, actuel = aujourdhuiParis()) {
  const anneeCourante = Number(actuel.slice(0, 4));
  const demandee = Number(recherche.annee);
  const annee = Number.isInteger(demandee) && demandee >= 1970 && demandee <= anneeCourante + 1 ? demandee : anneeCourante;
  const moisDemande = Number(recherche.mois);
  const numeroMois = Number.isInteger(moisDemande) && moisDemande >= 1 && moisDemande <= 12 ? moisDemande : Number(actuel.slice(5, 7));
  const mois = `${annee}-${String(numeroMois).padStart(2, "0")}`;
  const bien = typeof recherche.bien === "string" ? recherche.bien : "";
  const entiteId = typeof recherche.entite === "string" ? recherche.entite : "";
  return { annee, anneeCourante, numeroMois, mois, bien, entiteId };
}

export async function lireSuiviMensuelLoyers(supabase: SupabaseClient, orgId: string, selection: ReturnType<typeof lireSelectionLoyers>) {
  const { annee, mois, bien, entiteId } = selection;
  const [patrimoine, { data: biens, error: erreurBiens }, { data: lots, error: erreurLots }, quittancement, datesAppels] = await Promise.all([
    lireEntitesPatrimoine(supabase, orgId, annee),
    supabase.from("biens").select("id,nom,archived_at").eq("organization_id", orgId).order("nom"),
    supabase.from("lots").select("id,bien_id").eq("organization_id", orgId),
    supabase.rpc("quittancement_mois", { p_org: orgId, p_mois: `${mois}-01` }),
    entiteId ? lireToutesLesPages<{ id: string; date_echeance: string }>((debut, fin) =>
      supabase.from("appels_loyer").select("id,date_echeance", { count: "exact" })
        .eq("organization_id", orgId).eq("periode", mois + "-01").order("id").range(debut, fin), appel => appel.id) : null,
  ]);
  const entite = patrimoine.entites.find(e => e.id === entiteId);
  const perimetre = bien || entiteId ? new Set((lots ?? []).filter(l => (!bien || l.bien_id === bien) && (!entiteId || !!entite?.lots.includes(l.id))).map(l => l.id)) : null;
  const erreurPerimetre = Boolean(erreurBiens || erreurLots || patrimoine.erreur
    || (perimetre && (lots?.length ?? 0) >= 1000) || (entiteId && !entite) || (bien && !(biens ?? []).some(b => b.id === bien)));
  const termes = ((quittancement.data ?? []) as LigneQuittancement[]);
  const lignesDuParc = termes.filter(l => !perimetre || perimetre.has(l.lot_id));
  const dates = new Map(datesAppels?.lignes?.map(a => [a.id, a.date_echeance]));
  const periodesParLot = Map.groupBy(patrimoine.periodes, p => p.lot_id);
  const attribution = (l: LigneQuittancement) => titulaireDuLoyer(periodesParLot.get(l.lot_id) ?? [], mois, dates.get(l.appel_id));
  const lignes = entiteId ? lignesDuParc.filter(l => attribution(l) === entiteId) : lignesDuParc;
  const incertaines = entiteId ? lignesDuParc.filter(l => attribution(l) === null) : [];
  const totaux = !erreurPerimetre && !quittancement.error && termes.length < 1000 && !datesAppels?.echec ? ventilerLoyers(lignes) : null;
  return { patrimoine, biens, lots, entite, perimetre, erreurPerimetre, lignes, incertaines, totaux };
}
