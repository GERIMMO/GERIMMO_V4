import { SuiviLotProprietaire } from "./fenetre-lot";
import { ParcoursDepense } from "./parcours-depense";
import { ChargesCommunesLot } from "./charges-communes-lot";
import { SuiviEcheanciersCharges } from "./suivi-echeanciers-charges";
import { DepensesSimplifiees } from "./depenses-simplifiees";
import type { RepartitionFourniture } from "@/lib/proposition-repartition";
import { createClient } from "@/lib/supabase/server";
import { Receipt } from "lucide-react";
import { type BailConso, type SuggestionCompteur, type Props } from "./consommations-formulaires";
import type { CompteurConsommation, ContratFourniture, DemandeReleve, FactureFourniture, ReleveConsommation } from "@/lib/consommations";
import { aujourdhuiParis } from "@/lib/ged";
import { lireCollectionConsommations, lireLiensConsommations } from "@/lib/lecture-consommations";
import styles from "./consommations.module.css";

/** Les droits du dossier restent vérifiés par la page et chaque requête applique la RLS. */
export async function ConsommationsBien({ orgId, bienId, lotId = null, base, lectureSeule = false }: {
  orgId: string; bienId: string; lotId?: string | null; base: string; lectureSeule?: boolean;
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
    lireLiensConsommations<{ id: string; lot_id: string; locataire_principal: string | null; charges_mode: string; date_debut: string; date_fin: string | null; etat: string; person: { nom: string; prenom: string | null }[] | { nom: string; prenom: string | null } | null }>(idsLots, (ids, debut, fin) => db.from("baux").select("id,lot_id,locataire_principal,charges_mode,date_debut,date_fin,etat,person:persons!baux_locataire_meme_org_fk(nom,prenom)", { count: "exact" }).eq("organization_id", orgId).in("lot_id", ids).in("etat", ["actif", "preavis", "termine"]).order("id").range(debut, fin)),
    lireLiensConsommations<FactureFourniture>(contrats.map(c => c.id), (ids, debut, fin) => db.from("factures_fourniture").select("*", { count: "exact" }).eq("organization_id", orgId).in("contrat_id", ids).order("periode_fin", { ascending: false }).order("id").range(debut, fin)),
    lireLiensConsommations<DemandeReleve>(compteurs.map(c => c.id), (ids, debut, fin) => db.from("demandes_releves").select("*", { count: "exact" }).eq("organization_id", orgId).in("compteur_id", ids).order("echeance", { ascending: false }).order("id").range(debut, fin)),
    lireLiensConsommations<ReleveConsommation>(compteurs.map(c => c.id), (ids, debut, fin) => db.from("releves_consommation").select("*", { count: "exact" }).eq("organization_id", orgId).in("compteur_id", ids).order("date_releve", { ascending: false }).order("id").range(debut, fin)),
  ]);
  if ([bauxR, facturesR, demandesR, relevesR].some(r => r.error)) return <section className={styles.panel}><div className={styles.body}><h2>Dépenses et charges</h2><p role="alert">Une partie du suivi n’a pas pu être chargée. Rechargez la page avant de le modifier.</p></div></section>;
  const baux = (bauxR.data ?? []).map(b => {
    const p = (Array.isArray(b.person) ? b.person[0] : b.person) as { nom: string; prenom: string | null } | null;
    return { id: b.id, lot_id: b.lot_id, locataire_principal: b.locataire_principal, mode_charges: b.charges_mode, date_debut: b.date_debut, date_fin: b.date_fin, etat: b.etat,
      nom: `${p?.prenom ?? ""} ${p?.nom ?? "Locataire"}`.trim() } satisfies BailConso;
  });
  facturesR.data.sort((a, b) => b.periode_fin.localeCompare(a.periode_fin) || a.id.localeCompare(b.id));
  demandesR.data.sort((a, b) => b.echeance.localeCompare(a.echeance) || a.id.localeCompare(b.id));
  relevesR.data.sort((a, b) => b.date_releve.localeCompare(a.date_releve) || a.id.localeCompare(b.id));
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
  const donnees: Props = { orgId, bienId, lotId: null, base, lectureSeule, repartitions: repartitionsR.data, compteurs, contrats, factures: facturesR.data, demandes: demandesR.data, releves: relevesR.data, lots, baux, suggestions, aujourdHui: aujourdhuiParis() };
  const contratsLot = lotId ? contrats.filter(c=>c.lot_id===lotId) : contrats;
  const idsContratsLot = new Set(contratsLot.map(c=>c.id));
  return <section id="consommations" className={styles.panel} aria-labelledby={`conso-${lotId ?? bienId}`}>
    <header className={styles.header}><Receipt size={20} aria-hidden="true" /><h2 id={`conso-${lotId ?? bienId}`}>{lotId ? "Dépenses et règlements" : "Dépenses et charges"}</h2></header>
    <ParcoursDepense><div className={styles.body}>
      <DepensesSimplifiees {...donnees} lotId={lotId} contrats={contratsLot} factures={facturesR.data.filter(f=>idsContratsLot.has(f.contrat_id))} baux={baux.filter(b=>!lotId||b.lot_id===lotId)} compteurs={compteurs.filter(c=>!lotId||c.lot_id===lotId)} suggestions={suggestions.filter(c=>!lotId||c.lotId===lotId)} masquerVide={!!lotId} />
      {lotId && <ChargesCommunesLot p={donnees} lotId={lotId} />}
      <SuiviEcheanciersCharges org={orgId} bauxIds={baux.filter(b=>!lotId||b.lot_id===lotId).map(b=>b.id)} proprietaire base={base} />
      {lotId && <div id="journal-lot" className={styles.journal}><SuiviLotProprietaire orgId={orgId} lotId={lotId} rubrique="compta" lectureSeule={lectureSeule} saisieDepense={false} resume="Historique des opérations" /></div>}
    </div></ParcoursDepense>
  </section>;
}
