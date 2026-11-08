import { relevesFactureComplets } from "./suivi-releves-facture";
import type { CompteurConsommation, ReleveConsommation } from "./consommations";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TacheAccueil } from "./taches-accueil-proprietaire";
import { alertesContrats, autorisationRegularisation, type ContratFourniture, type FactureFourniture } from "./consommations";
import { lireCollectionConsommations, lireLiensConsommations } from "./lecture-consommations";

export async function chargerTachesConsommations(db: SupabaseClient, orgId: string, base: string, jour: string): Promise<{ taches: TacheAccueil[]; indisponible: boolean }> {
  const limite = new Date(Date.parse(`${jour}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const [cr, fr, mr, dr, rr, avis] = await Promise.all([
    lireCollectionConsommations<ContratFourniture>((debut, fin) => db.from("contrats_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<FactureFourniture>((debut, fin) => db.from("factures_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; bien_id: string; lot_id: string | null; libelle: string; prochaine_demande:string; bail_referent: string | null }>((debut, fin) => db.from("compteurs_consommation").select("id,bien_id,lot_id,libelle,prochaine_demande,bail_referent", { count: "exact" }).eq("organization_id", orgId).eq("actif", true).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; compteur_id: string; echeance: string }>((debut, fin) => db.from("demandes_releves").select("id,compteur_id,echeance", { count: "exact" }).eq("organization_id", orgId).eq("statut", "attendue").lte("echeance", limite).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; facture_id: string; statut: string; lignes: { bail_id: string | null; recuperable: boolean }[] | null }>((debut, fin) => db.from("repartitions_fourniture").select("id,facture_id,statut,lignes", { count: "exact" }).eq("organization_id", orgId).eq("statut", "validee").order("id").range(debut, fin)),
    lireCollectionConsommations<{id:string;bail_id:string;annee:number;avis_le:string|null;regularisation_id:string|null}>((debut,fin) => db.from("brouillons_regularisation_fourniture").select("id,bail_id,annee,avis_le,regularisation_id",{count:"exact"}).eq("organization_id",orgId).order("id").range(debut,fin)),
  ]);
  if ([cr, fr, mr, dr, rr, avis].some(r => r.error)) return { taches: [], indisponible: true };
  const baux = await lireLiensConsommations<{ id: string; etat: string }>(mr.data.flatMap(c => c.bail_referent ? [c.bail_referent] : []), (ids, debut, fin) => db.from("baux").select("id,etat", { count: "exact" }).eq("organization_id", orgId).in("id", ids).order("id").range(debut, fin));
  if (baux.error) return { taches: [], indisponible: true };
  const contrats = (cr.data ?? []) as ContratFourniture[], factures = (fr.data ?? []) as FactureFourniture[];
  const href = (c: { bien_id: string; lot_id: string | null }) => `${base}/parc/${c.bien_id}${c.lot_id ? `/lots/${c.lot_id}` : ""}#consommations`;
  const taches: TacheAccueil[] = alertesContrats(contrats, factures, jour).flatMap(a => {
    const c = a.type === "contrat" ? contrats.find(c => `contrat:${c.id}` === a.id) : contrats.find(c => factures.some(f => `facture:${f.id}` === a.id && f.contrat_id === c.id));
    return c ? [{ cle: a.id, type: `consommation_${a.type}`, titre: a.titre, detail: null, contexte: c.fournisseur, lieu: null, echeance: a.date, href: href(c), geste: "Vérifier", nature: "demande" as const }] : [];
  });
  for (const d of avis.data) {
    if (d.regularisation_id && !d.avis_le) taches.push({cle:`avis-decompte:${d.id}`,type:"avis_decompte_attendu",titre:`Notifier le locataire du décompte ${d.annee}`,detail:"Le PDF est validé. L’avis attend votre confirmation.",contexte:null,lieu:null,echeance:null,href:`${base}/baux/${d.bail_id}#regularisation-fournitures`,geste:"Voir le décompte",nature:"document"});
  }
  for (const d of dr.data ?? []) {
    const m = (mr.data ?? []).find(m => m.id === d.compteur_id);
    if (m) taches.push({ cle: `releve:${d.id}`, type: "releve_attendu", titre: `${m.libelle} · ${d.echeance < jour ? "Relevé manquant" : "Relevé attendu"}`, detail: "La demande reste visible dans l’espace du locataire.", contexte: null, lieu: null, echeance: d.echeance, href: href(m), geste: "Voir le suivi", nature: "demande" });
  }
  for (const m of mr.data) {
    if (!m.prochaine_demande || m.prochaine_demande > limite || dr.data.some(d => d.compteur_id === m.id)) continue;
    if (m.bail_referent && !baux.data.some(b=>b.id===m.bail_referent && ["actif","preavis"].includes(b.etat))) continue;
    taches.push({cle:`prochain-releve:${m.id}:${m.prochaine_demande}`,type:"releve_prevu",titre:`${m.libelle} · ${m.prochaine_demande>jour?"Relevé à venir":"Relevé attendu"}`,detail:m.bail_referent?"Relevé confié au locataire.":"Relevé à renseigner par le propriétaire.",contexte:null,lieu:null,echeance:m.prochaine_demande,href:href(m),geste:"Voir le compteur",nature:"demande"});
  }
  for (const m of mr.data) if (m.bail_referent && !baux.data.some(b => b.id === m.bail_referent && ["actif", "preavis"].includes(b.etat))) {
    taches.push({ cle: `destinataire-releve:${m.id}`, type: "releve_destinataire", titre: "Désigner le nouvel occupant pour les relevés", detail: "Le bail du destinataire précédent est terminé. Vérifiez qui recevra les prochaines demandes.", contexte: m.libelle, lieu: null, echeance: null, href: href(m), geste: "Choisir le destinataire", nature: "demande" });
  }
  const auto=await lireCollectionConsommations<{id:string;etat:string;detail:string|null}>((a,b)=>db.from("factures_automatiques").select("id,etat,detail",{count:"exact"}).eq("organization_id",orgId).eq("actif",true).order("id").range(a,b));
  if(auto.error)return {taches,indisponible:true};
  for(const j of auto.data.filter(j=>j.etat==="a_verifier")) {
   const f=factures.find(f=>f.id===j.id),c=contrats.find(c=>c.id===f?.contrat_id);
   if(f&&c)taches.push({cle:`facture-auto:${j.id}`,type:"facture_auto_verification",titre:`Facture ${f.reference} · à vérifier`,detail:j.detail,contexte:c.fournisseur,lieu:null,echeance:null,href:`${base}/parc/${c.bien_id}?decompte=${f.id}`,geste:"Corriger",nature:"demande"});
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
  const liensDemandes = await lireLiensConsommations<{id:string;facture_id:string;demande_id:string}>(aRepartir.map(f=>f.id),(ids,debut,fin)=>db.from("factures_demandes_releves").select("id,facture_id,demande_id",{count:"exact"}).eq("organization_id",orgId).in("facture_id",ids).order("facture_id").order("demande_id").range(debut,fin));
  if(liensDemandes.error) return {taches,indisponible:true};
  const biensSuivis=[...new Set(aRepartir.filter(f=>liensDemandes.data.some(d=>d.facture_id===f.id)).flatMap(f=>contrats.filter(c=>c.id===f.contrat_id).map(c=>c.bien_id)))];
  const suiviCompteurs=await lireLiensConsommations<CompteurConsommation>(biensSuivis,(ids,debut,fin)=>db.from("compteurs_consommation").select("*",{count:"exact"}).eq("organization_id",orgId).in("bien_id",ids).order("id").range(debut,fin));
  const suiviIndex=await lireLiensConsommations<ReleveConsommation>(suiviCompteurs.data.map(m=>m.id),(ids,debut,fin)=>db.from("releves_consommation").select("*",{count:"exact"}).eq("organization_id",orgId).in("compteur_id",ids).order("id").range(debut,fin));
  if(suiviCompteurs.error||suiviIndex.error) return {taches,indisponible:true};
  for (const f of aRepartir) {
    if(auto.data.some(j=>j.id===f.id))continue;
    const c = contrats.find(c => c.id === f.contrat_id);
    if (!c) continue;
    const lots = c.lot_id ? [c.lot_id] : logements.data.filter(l => l.bien_id === c.bien_id).map(l => l.id);
    const locataireConcerne = occupations.data.some(b => lots.includes(b.lot_id) && b.date_debut <= f.periode_fin && (!b.date_fin || b.date_fin >= f.periode_debut) && autorisationRegularisation(b.charges_mode, c.categorie).autorisee);
    if (locataireConcerne) {
      const suivie=liensDemandes.data.some(d=>d.facture_id===f.id);
      const completes=suivie && relevesFactureComplets(f,c.categorie,lots.map(id=>({id})),suiviCompteurs.data,suiviIndex.data,occupations.data);
      taches.push({ cle: `repartition:${f.id}`, type: "facture_repartition", titre: completes ? `Tous les relevés sont disponibles · ${f.reference}` : `Répartir la facture ${f.reference}`, detail: completes ? "Les index sont repris automatiquement. Vous pouvez continuer et vérifier les montants avant validation." : suivie ? "Collecte en cours : les relevés reçus sont repris automatiquement. Les index manquants restent à compléter." : "Préparez puis vérifiez le décompte des charges. Le paiement du fournisseur ne le remplace pas.", contexte: c.fournisseur, lieu: null, echeance: null, href: `${base}/parc/${c.bien_id}?decompte=${f.id}`, geste: completes ? "Continuer la répartition" : "Préparer", nature: "demande" });
    } else if (paiements.data.some(p => p.facture_id === f.id)) {
      taches.push({ cle: `ventilation:${f.id}`, type: "facture_ventilation", titre: "Ventiler cette dépense du bâtiment", detail: `Facture ${f.reference} : affectez la dépense aux logements dans vos finances. Aucune charge n’est demandée automatiquement aux locataires.`, contexte: c.fournisseur, lieu: null, echeance: null, href: href(c), geste: "Ventiler", nature: "demande" });
    }
  }
  // Rappels de l'année (02/11/2026) : la taxe foncière à saisir dès la mi-septembre pour les biens dont un locataire
  // supporte des provisions (sa TEOM se répercute), et la régularisation de l'exercice précédent à lancer dès février
  // pour les baux qui ont des parts de factures validées sans régularisation.
  const annee = Number(jour.slice(0, 4));
  const [biensLus, lotsLus, bauxProvision, regularisations] = await Promise.all([
    lireCollectionConsommations<{ id: string; nom: string }>((debut, fin) => db.from("biens").select("id,nom", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; bien_id: string }>((debut, fin) => db.from("lots").select("id,bien_id", { count: "exact" }).eq("organization_id", orgId).order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; lot_id: string }>((debut, fin) => db.from("baux").select("id,lot_id", { count: "exact" }).eq("organization_id", orgId).in("etat", ["actif", "preavis"]).eq("charges_mode", "provision").order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; bail_id: string; annee: number }>((debut, fin) => db.from("regularisations_charges").select("id,bail_id,annee", { count: "exact" }).eq("organization_id", orgId).eq("annee", annee - 1).order("id").range(debut, fin)),
  ]);
  if ([biensLus, lotsLus, bauxProvision, regularisations].some(r => r.error)) return { taches: [], indisponible: true };
  if (jour >= `${annee}-09-15`) {
    const biensAvecProvision = new Set(bauxProvision.data.flatMap(b => { const l = lotsLus.data.find(l => l.id === b.lot_id); return l ? [l.bien_id] : []; }));
    const teomSaisie = new Set(factures.filter(f => f.periode_debut.startsWith(`${annee}-`) && contrats.some(c => c.id === f.contrat_id && c.categorie === "teom")).map(f => contrats.find(c => c.id === f.contrat_id)!.bien_id));
    for (const bien of biensLus.data) if (biensAvecProvision.has(bien.id) && !teomSaisie.has(bien.id)) {
      taches.push({ cle: `taxe-fonciere:${bien.id}:${annee}`, type: "taxe_fonciere_a_saisir", titre: `Saisir l’avis de taxe foncière ${annee}`, detail: "La TEOM de l’avis se répercute aux locataires ; le reste est déductible de vos revenus fonciers.", contexte: bien.nom, lieu: bien.nom, echeance: `${annee}-10-15`, href: `${base}/parc/${bien.id}#consommations`, geste: "Saisir l’avis", nature: "document" });
    }
  }
  if (jour >= `${annee}-02-01`) {
    const dejaRegularises = new Set(regularisations.data.map(r => r.bail_id));
    const facturesExercice = new Set(factures.filter(f => f.periode_debut.startsWith(`${annee - 1}-`) || f.periode_fin.startsWith(`${annee - 1}-`)).map(f => f.id));
    const bauxARegulariser = new Set(rr.data.filter(r => facturesExercice.has(r.facture_id)).flatMap(r => (r.lignes ?? []).filter(l => l.recuperable && l.bail_id).map(l => l.bail_id!)));
    for (const bailId of bauxARegulariser) if (!dejaRegularises.has(bailId)) {
      taches.push({ cle: `regularisation:${bailId}:${annee - 1}`, type: "regularisation_a_lancer", titre: `Régulariser les charges ${annee - 1}`, detail: "Des parts de factures sont validées pour ce bail : préparez le décompte annuel depuis les factures réparties.", contexte: null, lieu: null, echeance: `${annee}-03-31`, href: `${base}/baux/${bailId}#regularisation-fournitures`, geste: "Préparer", nature: "demande" });
    }
  }
  return { taches, indisponible: false };
}
