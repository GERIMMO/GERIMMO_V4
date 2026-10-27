import { createHash } from "node:crypto";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RappelLoyer = {
  appel_id: string;
  bail_id: string;
  lot_nom: string;
  locataire: string | null;
  periode: string;
  date_echeance: string;
  montant_du: number | string;
  montant_couvert: number | string;
  non_recu_signale_le: string | null;
  derniere_relance?: { niveau: string; date_envoi: string } | null;
  historique_relances_disponible?: boolean;
  /** Dette du bail, calculée sur toutes ses lignes (ligne présentée = la plus ancienne). */
  dette_bail?: DetteBail;
};

export type DetteBail = {
  /** Échéances atteintes (jour compris) encore à recevoir, et leur reste total. */
  echeances: number; reste: number;
  /** Termes échus (avant aujourd'hui) : même périmètre que la dette totale des relances et de l'alerte d'impayé. */
  termesEchus: number; resteEchu: number;
};

/** Dette totale d'un bail à partir de ses lignes à recevoir, au centime. */
export function detteDuBail(lignes: RappelLoyer[], aujourdHui: string): DetteBail {
  const dette = { echeances: 0, reste: 0, termesEchus: 0, resteEchu: 0 };
  for (const l of lignes) {
    const centimes = Math.round(Number(l.montant_du) * 100) - Math.round(Number(l.montant_couvert) * 100);
    const jour = l.date_echeance.slice(0,10);
    if (centimes <= 0 || jour > aujourdHui) continue;
    dette.echeances += 1; dette.reste += centimes;
    if (jour < aujourdHui) { dette.termesEchus += 1; dette.resteEchu += centimes; }
  }
  return { ...dette, reste: dette.reste / 100, resteEchu: dette.resteEchu / 100 };
}

/** Début de la note que la relance du tableau de bord laisse au bail. */
export const NOTE_RELANCE_TABLEAU = "Relance par e-mail depuis le tableau de bord";

/** Une relance du tableau de bord par échéance : son identifiant se déduit de l'organisation et de l'appel. */
export function idRelanceReception(orgId: string, appelId: string) {
  const h = createHash("sha256").update(`relance-reception/${orgId}/${appelId}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** Même repère que les relances du bail : une relance après l'échéance ouvre déjà le suivi. */
export async function lireDerniereRelanceReception(supabase: SupabaseClient, orgId: string, ligne: Pick<RappelLoyer, "appel_id" | "bail_id" | "date_echeance">) {
  // Une ligne par stade suffit, même si le bail contient plus d'une page de relances.
  // À date égale, le stade le plus avancé prime sur l'ordre arbitraire des identifiants.
  const niveaux = ["mise_en_demeure", "relance_2", "relance_1"];
  const resultats = await Promise.all(niveaux.map(niveau => {
    let requete = supabase.from("relances").select("niveau,date_envoi")
      .eq("organization_id", orgId).eq("bail_id", ligne.bail_id).eq("niveau", niveau)
      .gte("date_envoi", ligne.date_echeance.slice(0,10));
    // La relance du tableau de bord ne vise que son échéance : celle d'un autre mois n'ouvre pas le suivi de celui-ci
    // (audit du 27/10, LAT-02). Les autres relances du bail gardent la règle commune.
    if (niveau === "relance_1") requete = requete.or(`id.eq.${idRelanceReception(orgId, ligne.appel_id)},note.is.null,note.not.like.${NOTE_RELANCE_TABLEAU}*`);
    return requete.order("date_envoi", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  }));
  const erreur = resultats.find(r => r.error)?.error;
  if (erreur) return { data: null, error: erreur };
  const relances = resultats.flatMap(r => r.data ? [r.data] : []);
  relances.sort((a,b) => b.date_envoi.localeCompare(a.date_envoi) || niveaux.indexOf(a.niveau) - niveaux.indexOf(b.niveau));
  return { data: relances[0] ?? null, error: null };
}

/** Un seul geste par bail : régler la plus ancienne échéance avant la suivante. */
export function organiserRappelsLoyers(lignes: RappelLoyer[], aujourdHui: string) {
  const tries = [...lignes].filter(l => Number(l.montant_du) > Number(l.montant_couvert))
    .sort((a,b) => a.periode.localeCompare(b.periode) || a.appel_id.localeCompare(b.appel_id));
  const premiers = new Map<string, RappelLoyer>();
  const parBail = new Map<string, RappelLoyer[]>();
  for (const ligne of tries) {
    if (!premiers.has(ligne.bail_id)) premiers.set(ligne.bail_id, ligne);
    const duBail = parBail.get(ligne.bail_id) ?? [];
    duBail.push(ligne); parBail.set(ligne.bail_id, duBail);
  }
  // La ligne présentée garde la dette entière de son bail : un arriéré de plusieurs mois ne se lit pas comme un mois.
  const dus = [...premiers.values()].filter(l => l.date_echeance.slice(0,10) <= aujourdHui)
    .map(l => ({ ...l, dette_bail: detteDuBail(parBail.get(l.bail_id) ?? [], aujourdHui) }))
    .sort((a,b) => a.date_echeance.localeCompare(b.date_echeance) || a.appel_id.localeCompare(b.appel_id));
  const prochaines = [...premiers.values()].filter(l => l.date_echeance.slice(0,10) > aujourdHui)
    .sort((a,b) => a.date_echeance.localeCompare(b.date_echeance) || a.appel_id.localeCompare(b.appel_id));
  return { dus, prochaine: prochaines[0] ?? null, totalEcheancesDues: tries.filter(l => l.date_echeance.slice(0,10) <= aujourdHui).length };
}

/** Une lecture paginée : les rappels anciens ne disparaissent pas au plafond de l'API. */
export const lireRappelsLoyers = cache(async (supabase: SupabaseClient, orgId: string) => {
  const lignes: RappelLoyer[] = [];
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId })
      .order("date_echeance").order("appel_id").range(debut, debut + 499);
    if (error) return { lignes: [] as RappelLoyer[], error };
    lignes.push(...(data ?? []) as RappelLoyer[]);
    if ((data?.length ?? 0) < 500) return { lignes, error: null };
  }
});
