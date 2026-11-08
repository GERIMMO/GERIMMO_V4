import { createHash } from "node:crypto";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { courrierDisponible, pointReception, type PointReception, type TermeSuivi } from "./paliers-reception-loyer";

export type RappelLoyer = {
  point?: PointReception | null;
  recommande_transmis?: boolean;
  derniere_echeance_due?: string;
  appel_id: string;
  bail_id: string;
  lot_nom: string;
  locataire: string | null;
  periode: string;
  date_echeance: string;
  montant_du: number | string;
  montant_couvert: number | string;
  non_recu_signale_le: string | null;
  historique?: { niveau: string; date_envoi: string }[];
  derniere_relance?: { niveau: string; date_envoi: string } | null;
  historique_relances_disponible?: boolean;
  /** Dette du bail, calculée sur toutes ses lignes (ligne présentée = la plus ancienne). */
  dette_bail?: DetteBail;
  relances_automatiques?: { active: boolean; premierDelai: number; secondDelai: number } | null;
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
export function idRelanceReception(orgId: string, appelId: string, niveau: "relance_1" | "relance_2" = "relance_1") {
  const h = createHash("sha256").update(`relance-reception/${orgId}/${appelId}${niveau === "relance_2" ? "/2" : ""}`).digest("hex");
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
    if (niveau === "relance_1" || niveau === "relance_2") requete = requete.or(`id.eq.${idRelanceReception(orgId, ligne.appel_id, niveau)},note.is.null,note.not.like.${NOTE_RELANCE_TABLEAU}*`);
    return requete.order("date_envoi", { ascending: niveau === "relance_1" }).order("id", { ascending: false }).limit(1).maybeSingle();
  }));
  const erreur = resultats.find(r => r.error)?.error;
  if (erreur) return { data: null, error: erreur };
  const relances = resultats.flatMap(r => r.data ? [r.data] : []);
  const premiere = relances.find(r => r.niveau === "relance_1");
  const seconde = relances.find(r => r.niveau === "relance_2");
  if (seconde && !relances.some(r => r.niveau === "mise_en_demeure") &&
      (!premiere || seconde.date_envoi < premiere.date_envoi)) {
    return { data: null, error: { message: "La première relance de cette échéance doit être vérifiée." } };
  }
  relances.sort((a,b) => niveaux.indexOf(a.niveau) - niveaux.indexOf(b.niveau) || b.date_envoi.localeCompare(a.date_envoi));
  return { data: relances[0] ?? null, historique: relances, error: null };
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
    .map(l => {
      const termes = parBail.get(l.bail_id) ?? [];
      const derniere = termes.reduce((date, terme) => {
        const e = terme.date_echeance.slice(0, 10);
        return e <= aujourdHui && e > date ? e : date;
      }, l.date_echeance.slice(0, 10));
      return { ...l, derniere_echeance_due: derniere, dette_bail: detteDuBail(termes, aujourdHui) };
    })
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

/** Un brouillon AR24 ne clôt pas le palier. L’envoi couvre uniquement les termes figés dans le courrier. */
async function lireTermesRecommandes(supabase: SupabaseClient, orgId: string, lignes: TermeSuivi[]) {
  const transmis = new Set<string>();
  const incomplets = new Set<string>();
  const baux = [...new Set(lignes.map(l => l.bail_id))];
  for (let i = 0; i < baux.length; i += 50) {
    const groupe = baux.slice(i, i + 50);
    for (let debut = 0; ; debut += 250) {
      const { data, error } = await supabase.from("recommandes_ar24").select("bail_id,dette")
        .eq("organization_id", orgId).eq("environnement", process.env.AR24_ENVIRONMENT === "sandbox" ? "sandbox" : "production")
        .in("bail_id", groupe).in("statut", ["envoye", "recu", "refuse", "non_reclame"])
        .order("id").range(debut, debut + 249);
      if (error) { groupe.forEach(bail => incomplets.add(bail)); break; }
      for (const r of data ?? []) {
        for (const e of Array.isArray(r.dette?.echeances) ? r.dette.echeances : []) {
          if (typeof e?.id === "string") transmis.add(r.bail_id + ":" + e.id);
        }
      }
      if ((data?.length ?? 0) < 250) break;
    }
  }
  return { transmis, incomplets };
}

/** Même lecture de l’historique pour le résumé et pour chaque ligne du tableau. */
export async function enrichirRappelsLoyers<T extends TermeSuivi>(supabase: SupabaseClient, orgId: string, lignes: T[], jour: string) {
  if (!lignes.length) return [];
  const [reglages, historiques, courriers] = await Promise.all([
    supabase.from("organizations").select("relances_envoi_auto,relance_1_jours,relance_2_jours").eq("id", orgId).maybeSingle(),
    Promise.all(lignes.map(ligne => lireDerniereRelanceReception(supabase, orgId, ligne))),
    lireTermesRecommandes(supabase, orgId, lignes),
  ]);
  const o = reglages.error ? null : reglages.data;
  const suivi = o ? { active: o.relances_envoi_auto === true, premierDelai: o.relance_1_jours, secondDelai: o.relance_2_jours } : null;
  const maintenant = Date.now();
  return lignes.map((ligne, i) => {
    const h = historiques[i];
    const complete = { ...ligne, relances_automatiques: suivi, derniere_relance: h.data, historique: h.historique, historique_relances_disponible: !h.error && !courriers.incomplets.has(ligne.bail_id),
      recommande_transmis: courriers.transmis.has(ligne.bail_id + ":" + ligne.appel_id) };
    return { ...complete, point: pointReception(complete, jour, maintenant) };
  });
}

/** Relit les envois et les délais pour le terme qui ouvre réellement la procédure du bail. */
export async function verifierCourrierDuBail(db: SupabaseClient, orgId: string, bailId: string,
  termes: Record<string, unknown>[], jour: string, niveau: "relance_1" | "relance_2" | "recommande") {
  const terme = termes.filter(t => typeof t.date_echeance === "string" && t.date_echeance < jour && Number(t.montant_du) > Number(t.montant_couvert))
    .sort((a,b) => String(a.periode).localeCompare(String(b.periode)) || String(a.appel_id).localeCompare(String(b.appel_id)))[0];
  if (!terme || typeof terme.appel_id !== "string") return { erreur: "Aucune échéance impayée vérifiable pour ce courrier." };
  const [ligne] = await enrichirRappelsLoyers(db, orgId, [{ appel_id: terme.appel_id, bail_id: bailId,
    date_echeance: String(terme.date_echeance), montant_du: Number(terme.montant_du), montant_couvert: Number(terme.montant_couvert),
    non_recu_signale_le: null }], jour);
  if (ligne.point?.etape === "inconnu") return { erreur: "Impossible de vérifier le suivi des relances. Réessayez avant de préparer ce courrier." };
  if (courrierDisponible(ligne, jour) !== niveau) {
    if (ligne.recommande_transmis || ligne.derniere_relance?.niveau === "mise_en_demeure") return { erreur: "Un recommandé a déjà été enregistré pour cette échéance." };
    if (niveau === "recommande" && ligne.derniere_relance?.niveau !== "relance_2") return { erreur: "Envoyez et enregistrez les deux relances avant de préparer le recommandé." };
    if (niveau === "relance_2" && !ligne.derniere_relance) return { erreur: "Envoyez et enregistrez la première relance avant de préparer la deuxième." };
    return { erreur: "Ce courrier ne correspond pas au palier disponible. Vérifiez la prochaine étape et sa date dans le suivi du loyer." };
  }
  return { precedente: ligne.derniere_relance?.date_envoi };
}
