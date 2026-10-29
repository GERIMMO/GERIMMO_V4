"use server";
import { segmentsConsommation } from "@/lib/segments-consommation";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { proposerPartsOccupation, type RepartitionFourniture, type OccupationRepartition, type ChambreRepartition } from "@/lib/proposition-repartition";
import type { ContratFourniture } from "@/lib/consommations";
import { lireCollectionConsommations, lireLiensConsommations } from "@/lib/lecture-consommations";
import { compteursPourFacture } from "@/lib/compteurs-facture";

export type EtatRepartition = { erreur?: string; succes?: string; repartition?: RepartitionFourniture };
export async function preparerRepartitionFourniture(orgId: string, factureId: string, _etat: EtatRepartition, f: FormData): Promise<EtatRepartition> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: factureId });
  if (!user || !estUuid(factureId)) return { erreur: "Accès refusé." };
  try {
    const { data: facture, error: ef } = await supabase.from("factures_fourniture").select("*").eq("organization_id", orgId).eq("id", factureId).single();
    if (!facture || ef) return { erreur: "La facture n’est pas accessible." };
    const { data: contrat, error: ec } = await supabase.from("contrats_fourniture").select("*").eq("organization_id", orgId).eq("id", facture.contrat_id).single();
    if (!contrat || ec) return { erreur: "Le contrat n’est pas accessible." };
    const c = contrat as ContratFourniture;
    const mode = String(f.get("mode") ?? "cle");
    if (!["cle", "egales", "consommations"].includes(mode)) return { erreur: "Choisissez une clé de répartition." };
    const lr = await lireCollectionConsommations((debut, fin) => supabase.from("lots").select("id,nom", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", c.bien_id).order("id").range(debut, fin));
    if (lr.error) return { erreur: "Les logements sont indisponibles." };
    const lots = (lr.data ?? []).filter(l => !c.lot_id || l.id === c.lot_id);
    if (!lots.length) return { erreur: "Aucun logement n’est rattaché à ce contrat." };
    const br = await lireLiensConsommations(lots.map(l => l.id), (ids, debut, fin) => supabase.from("baux").select("id,lot_id,chambre_id,date_debut,date_fin,charges_mode", { count: "exact" }).eq("organization_id", orgId).in("lot_id", ids).in("etat", ["actif", "preavis", "termine"]).order("id").range(debut, fin));
    if (br.error) return { erreur: "Les périodes de location sont indisponibles." };
    const baux = (br.data ?? []) as OccupationRepartition[];
    let poids = new Map(lots.map(l => [l.id, 1]));
    let motif = "Parts égales entre logements, puis prorata des jours d’occupation. La vacance et les baux au forfait restent au propriétaire.";
    if (c.lot_id) motif = "Facture du logement, répartie suivant les jours d’occupation. La vacance et les baux au forfait restent au propriétaire.";
    else if (mode !== "egales") {
      const { data: cles, error } = await lireCollectionConsommations((debut, fin) => supabase.from("cles_repartition").select("id,date_effet,cle_repartition_lignes(lot_id,pourcentage)", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", c.bien_id).lte("date_effet", facture.periode_fin).order("date_effet", { ascending: false }).order("id").range(debut, fin));
      if (error) return { erreur: "La clé du bâtiment n’a pas pu être chargée." };
      if ((cles ?? []).some(k => k.date_effet > facture.periode_debut)) return { erreur: "La clé a changé pendant la période facturée. Séparez les périodes avant la répartition." };
      const cle = cles?.find(k => k.date_effet <= facture.periode_debut);
      if (!cle) return { erreur: "Renseignez la clé de répartition dans la fiche du bâtiment, ou choisissez explicitement les parts égales." };
      poids = new Map(cle.cle_repartition_lignes.map(l => [l.lot_id, Math.round(Number(l.pourcentage) * 100)]));
      motif = `Clé du bâtiment applicable depuis le ${cle.date_effet}, puis prorata des jours d’occupation. La vacance et les forfaits restent au propriétaire.`;
    }
    const choixColoc = String(f.get("colocation") ?? "");
    if (choixColoc && !["egales", "surfaces"].includes(choixColoc)) return { erreur: "Vérifiez la clé entre les chambres." };
    const chambresR = choixColoc ? await lireLiensConsommations(lots.map(l => l.id), (ids, debut, fin) => supabase.from("lot_chambres").select("id,lot_id,surface_m2", { count: "exact" }).eq("organization_id", orgId).in("lot_id", ids).order("id").range(debut, fin)) : { data: [], error: null };
    if (chambresR.error) return { erreur: "Les chambres n’ont pas pu être chargées." };
    const colocation = choixColoc ? { mode: choixColoc as "egales" | "surfaces", chambres: (chambresR.data ?? []) as ChambreRepartition[] } : undefined;
    if (colocation) motif += colocation.mode === "egales" ? " Colocation : parts égales par chambre, chambres vacantes comprises." : " Colocation : parts suivant les surfaces des chambres, vacance conservée au propriétaire.";
    let parts = proposerPartsOccupation(lots.map(l => ({ ...l, poids: poids.get(l.id) ?? 0 })), baux, facture.periode_debut, facture.periode_fin, c.categorie, f.get("recuperable") === "on", colocation);
    if (mode === "consommations") {
      const { data: compteurs, error } = await lireCollectionConsommations((debut, fin) => supabase.from("compteurs_consommation").select("id,lot_id,type,date_index_initial,unite", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", c.bien_id).lte("date_index_initial", facture.periode_debut).order("id").range(debut, fin));
      if (error) return { erreur: "Les compteurs n’ont pas pu être chargés." };
      const cr = await lireLiensConsommations((compteurs ?? []).map(c => c.id), (ids, debut, fin) => supabase.from("releves_consommation").select("id,compteur_id,date_releve", { count: "exact" }).eq("organization_id", orgId).in("compteur_id", ids).order("id").range(debut, fin));
      if (cr.error) return { erreur: "Les dates des relevés n’ont pas pu être chargées." };
      const avant = parts;
      parts = [];
      for (const lot of lots) {
        const choix = String(f.get(`compteur_${lot.id}`) ?? "");
        const possibles = compteursPourFacture(compteurs, cr.data, facture, c.categorie, lot.id).filter(m => !choix || m.id === choix);
        if (possibles.length !== 1) return { erreur: possibles.length ? `Plusieurs compteurs couvrent cette période pour ${lot.nom}. Vérifiez le compteur concerné avant de répartir.` : `Il manque un relevé au début ou à la fin de la facture pour ${lot.nom}. Ajoutez les index correspondants avant de répartir.` };
        const m = possibles[0];
        parts.push(...segmentsConsommation({ lotId: lot.id, compteurId: m.id, datesRelevees: [m.date_index_initial, ...(cr.data ?? []).filter(r => r.compteur_id === m.id).map(r => r.date_releve)], debut: facture.periode_debut, fin: facture.periode_fin,
          baux, partsFixes: avant, categorie: c.categorie, recuperable: f.get("recuperable") === "on", colocation }));
      }
      motif += " Consommations vérifiées aux dates exactes de la facture ; frais fixes suivant la clé ; écart du compteur général conservé au propriétaire.";
    }
    const { data: id, error } = await supabase.rpc("preparer_repartition_fourniture", { p_facture: factureId, p_parts: parts, p_motif: motif, p_mode: mode === "consommations" ? "consommations" : "cle", p_reglages: { mode_interface: mode, colocation: choixColoc || null } });
    if (error || !id) return { erreur: sansJargon(error?.message ?? "La répartition n’a pas été préparée.") };
    const r = await supabase.from("repartitions_fourniture").select("*").eq("organization_id", orgId).eq("id", id).single();
    if (r.error) return { erreur: "La répartition a été préparée mais son aperçu est indisponible. Rechargez la page." };
    return { repartition: r.data as RepartitionFourniture };
  } catch (e) { return { erreur: sansJargon(e instanceof Error ? e.message : "La répartition n’a pas pu être préparée.") }; }
}
export async function validerRepartitionFourniture(orgId: string, id: string, _etat: EtatRepartition, f: FormData): Promise<EtatRepartition> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "suivi_consommations", cible: id });
  if (!user || !estUuid(id)) return { erreur: "Accès refusé." };
  if (f.get("confirme") !== "on") return { erreur: "Vérifiez le décompte puis confirmez la répartition." };
  const empreinte = String(f.get("empreinte") ?? "");
  if (!/^[a-f0-9]{64}$/.test(empreinte)) return { erreur: "Rechargez le décompte avant de le confirmer." };
  const { error } = await supabase.rpc("valider_repartition_fourniture", { p_repartition: id, p_empreinte_attendue: empreinte });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}`, "layout"); revalidatePath(`/espace/${orgId}`, "layout");
  return { succes: "Répartition validée et conservée avec la facture." };
}
