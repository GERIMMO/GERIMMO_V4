import type { SupabaseClient } from "@supabase/supabase-js";
import type { TacheAccueil } from "./taches-accueil-proprietaire";
import { alertesContrats, autorisationRegularisation, type ContratFourniture, type FactureFourniture } from "./consommations";
import { lireCollectionConsommations, lireLiensConsommations } from "./lecture-consommations";

export async function chargerTachesConsommations(db: SupabaseClient, orgId: string, base: string, jour: string): Promise<{ taches: TacheAccueil[]; indisponible: boolean }> {
  const limite = new Date(Date.parse(`${jour}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
  const [cr, fr, mr, dr, rr] = await Promise.all([
    lireCollectionConsommations<ContratFourniture>((debut, fin) => db.from("contrats_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<FactureFourniture>((debut, fin) => db.from("factures_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; bien_id: string; lot_id: string | null; libelle: string; bail_referent: string | null }>((debut, fin) => db.from("compteurs_consommation").select("id,bien_id,lot_id,libelle,bail_referent", { count: "exact" }).eq("organization_id", orgId).eq("actif", true).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; compteur_id: string; echeance: string }>((debut, fin) => db.from("demandes_releves").select("id,compteur_id,echeance", { count: "exact" }).eq("organization_id", orgId).eq("statut", "attendue").lte("echeance", limite).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; facture_id: string; statut: string }>((debut, fin) => db.from("repartitions_fourniture").select("id,facture_id,statut", { count: "exact" }).eq("organization_id", orgId).eq("statut", "validee").order("id").range(debut, fin)),
  ]);
  if ([cr, fr, mr, dr, rr].some(r => r.error)) return { taches: [], indisponible: true };
  const baux = await lireLiensConsommations<{ id: string; etat: string }>(mr.data.flatMap(c => c.bail_referent ? [c.bail_referent] : []), (ids, debut, fin) => db.from("baux").select("id,etat", { count: "exact" }).eq("organization_id", orgId).in("id", ids).order("id").range(debut, fin));
  if (baux.error) return { taches: [], indisponible: true };
  const contrats = (cr.data ?? []) as ContratFourniture[], factures = (fr.data ?? []) as FactureFourniture[];
  const href = (c: { bien_id: string; lot_id: string | null }) => `${base}/parc/${c.bien_id}${c.lot_id ? `/lots/${c.lot_id}` : ""}#consommations`;
  const taches: TacheAccueil[] = alertesContrats(contrats, factures, jour).flatMap(a => {
    const c = a.type === "contrat" ? contrats.find(c => `contrat:${c.id}` === a.id) : contrats.find(c => factures.some(f => `facture:${f.id}` === a.id && f.contrat_id === c.id));
    return c ? [{ cle: a.id, type: `consommation_${a.type}`, titre: a.titre, detail: null, contexte: c.fournisseur, lieu: null, echeance: a.date, href: href(c), geste: "Vérifier", nature: "demande" as const }] : [];
  });
  for (const d of dr.data ?? []) {
    const m = (mr.data ?? []).find(m => m.id === d.compteur_id);
    if (m) taches.push({ cle: `releve:${d.id}`, type: "releve_attendu", titre: `${m.libelle} : relevé non reçu`, detail: "La demande reste visible dans l’espace du locataire.", contexte: null, lieu: null, echeance: d.echeance, href: href(m), geste: "Voir le suivi", nature: "demande" });
  }
  for (const m of mr.data) if (m.bail_referent && !baux.data.some(b => b.id === m.bail_referent && ["actif", "preavis"].includes(b.etat))) {
    taches.push({ cle: `destinataire-releve:${m.id}`, type: "releve_destinataire", titre: "Désigner le nouvel occupant pour les relevés", detail: "Le bail du destinataire précédent est terminé. Vérifiez qui recevra les prochaines demandes.", contexte: m.libelle, lieu: null, echeance: null, href: href(m), geste: "Choisir le destinataire", nature: "demande" });
  }
  const validees = new Set(rr.data.map(r => r.facture_id));
  const aRepartir = factures.filter(f => !validees.has(f.id));
  const recuperables = contrats.filter(c => autorisationRegularisation("provision", c.categorie).autorisee && aRepartir.some(f => f.contrat_id === c.id));
  const logements = await lireLiensConsommations<{ id: string; bien_id: string }>(recuperables.filter(c => !c.lot_id).map(c => c.bien_id), (ids, debut, fin) => db.from("lots").select("id,bien_id", { count: "exact" }).eq("organization_id", orgId).in("bien_id", ids).order("id").range(debut, fin));
  if (logements.error) return { taches: [], indisponible: true };
  const [occupations, paiements] = await Promise.all([
    lireLiensConsommations<{ id: string; lot_id: string; charges_mode: string; date_debut: string; date_fin: string | null }>([...recuperables.flatMap(c => c.lot_id ? [c.lot_id] : []), ...logements.data.map(l => l.id)], (ids, debut, fin) => db.from("baux").select("id,lot_id,charges_mode,date_debut,date_fin", { count: "exact" }).eq("organization_id", orgId).in("lot_id", ids).in("etat", ["actif", "preavis", "termine"]).order("id").range(debut, fin)),
    lireLiensConsommations<{ id: string; facture_id: string }>(aRepartir.filter(f => f.payee_le && contrats.some(c => c.id === f.contrat_id && !c.lot_id)).map(f => f.id), (ids, debut, fin) => db.from("paiements_factures_fourniture").select("id,facture_id", { count: "exact" }).eq("organization_id", orgId).in("facture_id", ids).eq("etat", "a_ventiler").order("id").range(debut, fin)),
  ]);
  if (occupations.error || paiements.error) return { taches: [], indisponible: true };
  for (const f of aRepartir) {
    const c = contrats.find(c => c.id === f.contrat_id);
    if (!c) continue;
    const lots = c.lot_id ? [c.lot_id] : logements.data.filter(l => l.bien_id === c.bien_id).map(l => l.id);
    const locataireConcerne = occupations.data.some(b => lots.includes(b.lot_id) && b.date_debut <= f.periode_fin && (!b.date_fin || b.date_fin >= f.periode_debut) && autorisationRegularisation(b.charges_mode, c.categorie).autorisee);
    if (locataireConcerne) {
      taches.push({ cle: `repartition:${f.id}`, type: "facture_repartition", titre: `Répartir la facture ${f.reference}`, detail: "Préparez puis vérifiez le décompte des charges. Le paiement du fournisseur ne le remplace pas.", contexte: c.fournisseur, lieu: null, echeance: null, href: href(c), geste: "Préparer", nature: "demande" });
    } else if (paiements.data.some(p => p.facture_id === f.id)) {
      taches.push({ cle: `ventilation:${f.id}`, type: "facture_ventilation", titre: "Ventiler cette dépense du bâtiment", detail: `Facture ${f.reference} : affectez la dépense aux logements dans vos finances. Aucune charge n’est demandée automatiquement aux locataires.`, contexte: c.fournisseur, lieu: null, echeance: null, href: href(c), geste: "Ventiler", nature: "demande" });
    }
  }
  return { taches, indisponible: false };
}
