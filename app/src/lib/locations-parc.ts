import type { SupabaseClient } from "@supabase/supabase-js";
import { lireToutesLesPages } from "@/lib/lecture-complete";

type Montant = number | string | null;
export type BailActifDuParc = {
  id: string; lot_id: string; etat: string; chambre_id: string | null;
  loyer_hc: Montant; charges: Montant;
  locataire: { nom: string; prenom: string | null } | { nom: string; prenom: string | null }[] | null;
};
export type ChambreDuParc = { id: string; lot_id: string };

export async function chargerBauxActifsDuParc(db: SupabaseClient, orgId: string) {
  const lecture = await lireToutesLesPages<BailActifDuParc>((debut, fin) => db.from("baux")
    .select("id,loyer_hc,charges,lot_id,etat,chambre_id,locataire:persons!baux_locataire_meme_org_fk(nom,prenom)", { count: "exact" })
    .eq("organization_id", orgId).in("etat", ["actif", "preavis"]).order("id").range(debut, fin), bail => bail.id);
  return { data: lecture.lignes, error: lecture.echec };
}

export async function chargerChambresDuParc(db: SupabaseClient, orgId: string) {
  const lecture = await lireToutesLesPages<ChambreDuParc>((debut, fin) => db.from("lot_chambres")
    .select("id,lot_id", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin), chambre => chambre.id);
  return { data: lecture.lignes, error: lecture.echec };
}

/** Somme les contrats du périmètre visible, en centimes entiers. Une composante inconnue invalide le total. */
export function totalLoyersDuParc(baux: readonly { lot_id: string; loyer_hc: Montant; charges: Montant }[], lotsConnus: ReadonlySet<string>): number | null {
  let centimes = 0;
  for (const bail of baux) {
    if (!lotsConnus.has(bail.lot_id)) continue;
    for (const valeur of [bail.loyer_hc, bail.charges]) {
      if (valeur == null || typeof valeur === "string" && !valeur.trim()) return null;
      const montant = Number(valeur);
      if (!Number.isFinite(montant) || montant < 0) return null;
      const ajout = Math.round(montant * 100);
      if (Math.abs(montant - ajout / 100) > Number.EPSILON * Math.max(1, Math.abs(montant)) * 4) return null;
      if (!Number.isSafeInteger(ajout) || !Number.isSafeInteger(centimes + ajout)) return null;
      centimes += ajout;
    }
  }
  return centimes / 100;
}

export type LotDuPatrimoine = {
  id: string; bien_id: string; nom: string; etat: string; surface_m2: number | null; pieces: number | null;
  identifiant_fiscal: string | null; chauffage: string | null; eau_chaude: string | null;
  locaux_privatifs: string | null; description: string | null; meuble: boolean;
};
type BienDuPatrimoine = {
  id: string; nom: string; type: string; address_line1: string | null; postal_code: string | null;
  city: string | null; archived_at: string | null;
};

/** Les lots se paginent indépendamment : le compte d'une jointure imbriquée ne prouve pas leur exhaustivité. */
export async function chargerPatrimoineDuParc(db: SupabaseClient, orgId: string) {
  const [biens, lots] = await Promise.all([
    lireToutesLesPages<BienDuPatrimoine>((debut, fin) => db.from("biens")
      .select("id,nom,type,address_line1,postal_code,city,archived_at", { count: "exact" })
      .eq("organization_id", orgId).order("nom").order("id").range(debut, fin), bien => bien.id),
    lireToutesLesPages<LotDuPatrimoine>((debut, fin) => db.from("lots")
      .select("id,bien_id,nom,etat,surface_m2,pieces,identifiant_fiscal,chauffage,eau_chaude,locaux_privatifs,description,meuble", { count: "exact" })
      .eq("organization_id", orgId).order("id").range(debut, fin), lot => lot.id),
  ]);
  if (biens.echec || lots.echec) return { data: null, error: biens.echec ?? lots.echec };
  const parBien = new Map<string, LotDuPatrimoine[]>();
  for (const lot of lots.lignes!) { const groupe = parBien.get(lot.bien_id) ?? []; groupe.push(lot); parBien.set(lot.bien_id, groupe); }
  return { data: biens.lignes!.map(bien => ({ ...bien, lots: parBien.get(bien.id) ?? [] })), error: null };
}

/** Une lecture de complétude tronquée doit afficher « inconnu », jamais des éléments manquants inventés. */
export async function verifierLectureDuParc<T>(requete: PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>, verifier = true) {
  const resultat = await requete;
  if (!verifier || resultat.error) return resultat;
  if (resultat.count === null || resultat.count !== (resultat.data ?? []).length) {
    return { data: null, count: resultat.count, error: { message: "La lecture du parc est incomplète." } };
  }
  return resultat;
}
