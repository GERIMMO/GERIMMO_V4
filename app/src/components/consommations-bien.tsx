import { SuiviLotProprietaire } from "./fenetre-lot";
import { ParcoursDepense } from "./parcours-depense";
import { ChargesCommunesLot } from "./charges-communes-lot";
import { SuiviEcheanciersCharges } from "./suivi-echeanciers-charges";
import { NouvelleFacture, DepensesSimplifiees } from "./depenses-simplifiees";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { createClient } from "@/lib/supabase/server";
import { Receipt } from "lucide-react";
import { FicheFactureFourniture, FormulairesConsommations, type BailConso, type SuggestionCompteur, type Props } from "./consommations-formulaires";
import { TYPES_COMPTEUR, CATEGORIES_FOURNITURE } from "@/lib/consommations";
import type { CompteurConsommation, ContratFourniture, DemandeReleve, FactureFourniture, ReleveConsommation } from "@/lib/consommations";
import Link from "next/link";
import { lireLivreFinances, resumerLivre } from "@/lib/finances";
import { resumerLoyersParcMois } from "@/lib/loyers-parc-mois";
import { aujourdhuiParis, eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { lireCollectionConsommations, lireLiensConsommations } from "@/lib/lecture-consommations";
import styles from "./consommations.module.css";

/** Les droits du dossier restent vérifiés par la page et chaque requête applique la RLS. */
export async function ConsommationsBien({ orgId, bienId, lotId = null, bienNom, base, factureSeule, lectureSeule = false }: {
  orgId: string; bienId: string; lotId?: string | null; bienNom?: string; factureSeule?: string; base: string; lectureSeule?: boolean;
}) {
  const db = await createClient();
  const results = await Promise.all([
    lireCollectionConsommations<CompteurConsommation>((debut, fin) => db.from("compteurs_consommation").select("*", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", bienId).order("created_at").order("id").range(debut, fin)),
    lireCollectionConsommations<ContratFourniture>((debut, fin) => db.from("contrats_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", bienId).order("created_at").order("id").range(debut, fin)),
    lireCollectionConsommations<{ id: string; nom: string; etat: string }>((debut, fin) => db.from("lots").select("id,nom,etat", { count: "exact" }).eq("organization_id", orgId).eq("bien_id", bienId).order("nom").order("id").range(debut, fin)),
  ]);
  if (results.some(r => r.error)) return <section className={styles.panel}><div className={styles.body}><h2>Dépenses et charges</h2><p role="alert">Ce suivi est momentanément indisponible. Rechargez la page.</p></div></section>;
  const compteurs = ((results[0].data ?? []) as CompteurConsommation[]);
  const contrats = ((results[1].data ?? []) as ContratFourniture[]);
  const lots = (results[2].data ?? []) as { id: string; nom: string; etat: string }[];
  const idsLots = lots.map(l => l.id);
  const [bauxR, facturesR, demandesR, relevesR] = await Promise.all([
    lireLiensConsommations<{ id: string; lot_id: string; locataire_principal: string | null; chambre_id:string|null; charges_mode: string; date_debut: string; date_fin: string | null; etat: string; person: { nom: string; prenom: string | null }[] | { nom: string; prenom: string | null } | null }>(idsLots, (ids, debut, fin) => db.from("baux").select("id,lot_id,locataire_principal,chambre_id,charges_mode,date_debut,date_fin,etat,person:persons!baux_locataire_meme_org_fk(nom,prenom)", { count: "exact" }).eq("organization_id", orgId).in("lot_id", ids).in("etat", ["actif", "preavis", "termine"]).order("id").range(debut, fin)),
    lireLiensConsommations<FactureFourniture>(contrats.map(c => c.id), (ids, debut, fin) => db.from("factures_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).in("contrat_id", ids).order("periode_fin", { ascending: false }).order("id").range(debut, fin)),
    lireLiensConsommations<DemandeReleve>(compteurs.map(c => c.id), (ids, debut, fin) => db.from("demandes_releves").select("*", { count: "exact" }).eq("organization_id", orgId).in("compteur_id", ids).order("echeance", { ascending: false }).order("id").range(debut, fin)),
    lireLiensConsommations<ReleveConsommation>(compteurs.map(c => c.id), (ids, debut, fin) => db.from("releves_consommation").select("*", { count: "exact" }).eq("organization_id", orgId).in("compteur_id", ids).order("date_releve", { ascending: false }).order("id").range(debut, fin)),
  ]);
  if ([bauxR, facturesR, demandesR, relevesR].some(r => r.error)) return <section className={styles.panel}><div className={styles.body}><h2>Dépenses et charges</h2><p role="alert">Une partie du suivi n’a pas pu être chargée. Rechargez la page avant de le modifier.</p></div></section>;
  const baux = (bauxR.data ?? []).map(b => {
    const p = (Array.isArray(b.person) ? b.person[0] : b.person) as { nom: string; prenom: string | null } | null;
    return { chambre_id:b.chambre_id, id: b.id, lot_id: b.lot_id, locataire_principal: b.locataire_principal, mode_charges: b.charges_mode, date_debut: b.date_debut, date_fin: b.date_fin, etat: b.etat,
      nom: `${p?.prenom ?? ""} ${p?.nom ?? "Locataire"}`.trim() } satisfies BailConso;
  });
  facturesR.data.sort((a, b) => b.periode_fin.localeCompare(a.periode_fin) || a.id.localeCompare(b.id));
  demandesR.data.sort((a, b) => b.echeance.localeCompare(a.echeance) || a.id.localeCompare(b.id));
  relevesR.data.sort((a, b) => b.date_releve.localeCompare(a.date_releve) || a.id.localeCompare(b.id));
  const decomptes = await lireLiensConsommations<import("@/lib/regularisation-fournitures").EtatLigneDecompte>(baux.map(b => b.id), (ids, debut, fin) => db.from("brouillons_regularisation_fourniture").select("id,bail_id,annee,avis_le", { count: "exact" }).eq("organization_id", orgId).in("bail_id", ids).order("id").range(debut, fin));
  const repartitionsR = await lireLiensConsommations<RepartitionFourniture>(facturesR.data.map(f => f.id), (ids, debut, fin) => db.from("repartitions_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).in("facture_id", ids).order("id").range(debut, fin));
  if (repartitionsR.error) return <section className={styles.panel}><div className={styles.body}><h2>Dépenses et charges</h2><p role="alert">Les décomptes sont indisponibles. Rechargez la page avant de modifier les factures.</p></div></section>;
  const suggestions: SuggestionCompteur[] = [];
  if (baux.length) {
    const edls = await lireLiensConsommations<{ id: string; bail_id: string; date_edl: string; edl_compteurs: { type: string; numero: string | null; releve: number | null }[] }>(baux.filter(b => ["actif", "preavis"].includes(b.etat) && b.date_debut <= aujourdhuiParis()).map(b => b.id), (ids, debut, fin) => db.from("etats_des_lieux").select("id,bail_id,date_edl,edl_compteurs(type,numero,releve)", { count: "exact" }).eq("organization_id", orgId).in("bail_id", ids).eq("type", "entree").order("date_edl", { ascending: false }).order("id").range(debut, fin));
    // Les propositions EDL sont facultatives ; une lecture en échec ne fournit aucune valeur partielle.
    for (const e of edls.data.sort((a, b) => b.date_edl.localeCompare(a.date_edl))) for (const c of e.edl_compteurs ?? []) {
      const b = baux.find(b => b.id === e.bail_id)!;
      if (c.releve != null && lots.some(l => l.id === b.lot_id && l.etat !== "archive") && !compteurs.some(x => x.lot_id === b.lot_id && x.type === c.type && x.numero === c.numero) && !suggestions.some(x => x.lotId === b.lot_id && x.type === c.type && x.numero === c.numero)) suggestions.push({ type: c.type, numero: c.numero, index: String(c.releve), date: e.date_edl, lotId: b.lot_id, bailId: b.id });
    }
  }
  const cles = await lireCollectionConsommations((debut, fin) => db.from("cles_repartition")
    .select("id,date_effet,cle_repartition_lignes(lot_id,pourcentage)", { count: "exact" })
    .eq("organization_id", orgId).eq("bien_id", bienId).order("date_effet").order("id").range(debut, fin));
  const liensReleves = await lireLiensConsommations<{id:string;facture_id:string;demande_id:string}>(facturesR.data.map(f=>f.id),(ids,debut,fin)=>db.from("factures_demandes_releves").select("id,facture_id,demande_id",{count:"exact"}).eq("organization_id",orgId).in("facture_id",ids).order("facture_id").order("demande_id").range(debut,fin));
  if(liensReleves.error) return <p role="alert">Le suivi des demandes de relevés est indisponible. Rechargez la page.</p>;
  const suiviAuto=await lireLiensConsommations<import("./suivi-facture-automatique").SuiviAutomatique>(facturesR.data.map(f=>f.id),(ids,a,b)=>db.from("factures_automatiques").select("id,actif,etat,detail",{count:"exact"}).eq("organization_id",orgId).in("id",ids).order("id").range(a,b));
  if(suiviAuto.error)return <p role="alert">Le suivi automatique est indisponible. Rechargez la page.</p>;
  const donnees: Props = { suiviAuto:suiviAuto.data, liensReleves:liensReleves.data, bienNom, decomptes: decomptes.error ? null : decomptes.data, cles: cles.error ? [] : cles.data, orgId, bienId, lotId: null, base, lectureSeule, repartitions: repartitionsR.data, compteurs, contrats, factures: facturesR.data, demandes: demandesR.data, releves: relevesR.data, lots, baux, suggestions, aujourdHui: aujourdhuiParis() };
  if (factureSeule === "nouvelle") return lectureSeule ? <p>Consultation uniquement.</p> : <NouvelleFacture p={{...donnees, lotId: lots.some(l=>l.id===lotId) ? lotId : null}}/>;
  if (factureSeule) {
    const facture = donnees.factures.find(f => f.id === factureSeule);
    const contrat = contrats.find(c => c.id === facture?.contrat_id);
    if (!facture || !contrat)
      return <p>Décompte indisponible. <Link href={`${base}/parc/${bienId}#consommations`}>Retour aux factures</Link></p>;
    return <FicheFactureFourniture p={donnees} c={contrat} f={facture} pleinePage/>;
  }
  const contratsLot = lotId ? contrats.filter(c=>c.lot_id===lotId) : contrats;
  const idsContratsLot = new Set(contratsLot.map(c=>c.id));
  const facturesLot = facturesR.data.filter(f => idsContratsLot.has(f.contrat_id));
  const idsFacturesLot = new Set(facturesLot.map(f => f.id));
  const mois = donnees.aujourdHui.slice(0, 7);
  const [termes, journal] = lotId ? await Promise.all([
    db.rpc("quittancement_mois", { p_org: orgId, p_mois: mois + "-01" }).eq("lot_id", lotId),
    lireLivreFinances(db, orgId, lotId),
  ]) : [null, null];
  const termesLot = termes && !termes.error && Array.isArray(termes.data)
    ? termes.data.filter((t: {lot_id: string}) => t.lot_id === lotId) : null;
  const loyers = termesLot ? resumerLoyersParcMois(termesLot) : null;
  const operations = journal && !journal.error ? resumerLivre(journal.lignes, Number(mois.slice(0,4)), null).lignes.filter(e => e.date_imputation.startsWith(mois)) : null;
  const depenses = operations?.reduce((total, e) => e.sens === "depense" ? total + Math.round(Number(e.montant) * 100) : total, 0);
  const compteursLot = compteurs.filter(c => c.lot_id === lotId);
  const idsCompteursLot = new Set(compteursLot.map(c => c.id));
  const communs = contrats.filter(c => !c.lot_id && c.actif);
  const compteursCommuns = compteurs.filter(c => !c.lot_id && c.actif);
  return <><section id="consommations" className={styles.panel} aria-labelledby={`conso-${lotId ?? bienId}`}>
    <header className={styles.header}><Receipt size={20} aria-hidden="true" /><h2 id={`conso-${lotId ?? bienId}`}>{lotId ? "Suivi des loyers et dépenses" : "Dépenses et charges"}</h2></header>
    {lotId && <div className={styles.body}>
      <h3>{moisEnFrancais(mois)}</h3>
      <dl className={styles.chiffresLot}>
        <div><dt>Loyers attendus</dt><dd>{!loyers ? "Indisponible" : !termesLot?.length ? "Aucun loyer prévu" : eur(loyers.attendu)}</dd></div>
        <div><dt>Reçus sur ces échéances</dt><dd>{loyers ? eur(loyers.encaisse) : "Indisponible"}</dd></div>
        <div><dt>Reste à recevoir</dt><dd>{loyers ? eur(loyers.attendu - loyers.encaisse) : "Indisponible"}</dd></div>
        <div><dt>Dépenses comptabilisées</dt><dd>{depenses != null ? eur(depenses / 100) : "Indisponible"}</dd></div>
      </dl>
      {operations?.slice(0,3).map(e => <p key={e.id}>{formaterDate(e.date_imputation)} · {e.libelle} · {e.sens === "depense" ? "−" : "+"}{eur(Number(e.montant))}</p>)}
      {loyers && loyers.attendu > loyers.encaisse && <Link href={`${base}/loyers`}>Vérifier les loyers</Link>}
    </div>}
    <ParcoursDepense><div className={styles.body}>
      <DepensesSimplifiees {...donnees} lotId={lotId} contrats={contratsLot} factures={facturesLot} baux={baux.filter(b=>!lotId||b.lot_id===lotId)} compteurs={compteurs.filter(c=>!lotId||c.lot_id===lotId)} suggestions={suggestions.filter(c=>!lotId||c.lotId===lotId)} masquerVide={!!lotId} />
      {lotId && <ChargesCommunesLot p={donnees} lotId={lotId} />}
      <SuiviEcheanciersCharges org={orgId} bauxIds={baux.filter(b=>!lotId||b.lot_id===lotId).map(b=>b.id)} proprietaire base={base} />
      {lotId && <div id="journal-lot" className={styles.journal}><SuiviLotProprietaire orgId={orgId} lotId={lotId} rubrique="compta" lectureSeule={lectureSeule} saisieDepense={false} resume="Historique des opérations" /></div>}
    </div></ParcoursDepense>
  </section>
    {lotId && <section id="compteurs-lot" className={styles.panel} aria-label="Compteurs et abonnements">
      <header className={styles.header}><h2>Compteurs et abonnements</h2></header>
      <div className={styles.body}><h3>Ce logement</h3>
        <FormulairesConsommations {...donnees} lotId={lotId} lots={lots.filter(l=>l.id===lotId)} compteurs={compteursLot} principaux={compteurs.filter(c => !c.lot_id)} contrats={contratsLot}
          baux={baux.filter(b=>b.lot_id===lotId)} suggestions={suggestions.filter(s=>s.lotId===lotId)}
          demandes={demandesR.data.filter(d=>idsCompteursLot.has(d.compteur_id))} releves={relevesR.data.filter(r=>idsCompteursLot.has(r.compteur_id))}
          factures={facturesLot} repartitions={repartitionsR.data.filter(r => idsFacturesLot.has(r.facture_id))} />
        {(communs.length > 0 || compteursCommuns.length > 0) && <div><h3>Communs au bien{bienNom && ` · ${bienNom}`}</h3>
          {compteursCommuns.map(c => { const r = relevesR.data.find(l => l.compteur_id === c.id); return <p key={c.id}>{c.libelle} · {TYPES_COMPTEUR[c.type]} · {r?.index_releve ?? c.index_initial} {c.unite === "m3" ? "m³" : "kWh"} au {formaterDate(r?.date_releve ?? c.date_index_initial)}</p>; })}
          {communs.map(c => <p key={c.id}>{c.fournisseur} · {CATEGORIES_FOURNITURE[c.categorie]}{c.reference && ` · ${c.reference}`}{c.montant_cents != null && ` · ${eur(c.montant_cents / 100)} tous les ${c.periodicite_mois} mois`}{c.echeance && ` · Échéance le ${formaterDate(c.echeance)}`}<br />Souscrit par · {c.souscripteur || "À renseigner"} · Payé par · {c.payeur || "À renseigner"}</p>)}
        </div>}
        <Link href={`${base}/parc/${bienId}#consommations`}>Gérer les compteurs et abonnements du bien</Link>
      </div>
    </section>}</>;
}
