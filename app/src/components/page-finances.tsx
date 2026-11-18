import { lireToutesLesPages } from "@/lib/lecture-complete";
import { lireEntitesPatrimoine, titulaireDuLoyer, ventilerParTitulaire } from "@/lib/entites-patrimoine";
import { deElide } from "@/lib/elision";
import Link from "next/link";
import { Banknote, ArrowLeftRight, FileCheck2 } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import { verifierAccesEspace } from "@/lib/espace";
import { aujourdhuiParis, eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { QuittancementMois, type LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";
import { RecapitulatifFiscal } from "@/components/recapitulatif-fiscal";
import { lireLivreFinances, resumerLivre, type EcritureFinances } from "@/lib/finances";
import { NavigationFinances, FiltresFinances, OutilsComptables } from "@/components/navigation-finances";
import { baseEspace } from "@/lib/racine-espace";

export async function PageFinances({ orgId, recherche }: {
  orgId: string; recherche: Record<string, string | string[] | undefined>;
}) {
  const { supabase } = await verifierAccesEspace(orgId);
  const actuel = aujourdhuiParis();
  const demandee = Number(recherche.annee);
  const anneeCourante = Number(actuel.slice(0, 4));
  const annee = Number.isInteger(demandee) && demandee >= 1970 && demandee <= anneeCourante + 1 ? demandee : anneeCourante;
  const moisDemande = Number(recherche.mois);
  const numeroMois = Number.isInteger(moisDemande) && moisDemande >= 1 && moisDemande <= 12 ? moisDemande : Number(actuel.slice(5, 7));
  const mois = `${annee}-${String(numeroMois).padStart(2, "0")}`;
  const bien = typeof recherche.bien === "string" ? recherche.bien : "";
  const entiteId = typeof recherche.entite === "string" ? recherche.entite : "";
  const patrimoine=await lireEntitesPatrimoine(supabase,orgId,annee);
  const entite=patrimoine.entites.find(e=>e.id===entiteId);
  const [{ data: biens, error: erreurBiens }, { data: lots, error: erreurLots }, quittancement, livre, datesAppels] = await Promise.all([
    supabase.from("biens").select("id, nom, archived_at").eq("organization_id", orgId).order("nom"),
    supabase.from("lots").select("id, bien_id").eq("organization_id", orgId),
    supabase.rpc("quittancement_mois", { p_org: orgId, p_mois: `${mois}-01` }),
    lireLivreFinances(supabase, orgId),
    entiteId ? lireToutesLesPages<{ id: string; date_echeance: string }>((debut, fin) =>
      supabase.from("appels_loyer").select("id,date_echeance", { count: "exact" })
        .eq("organization_id", orgId).eq("periode", mois + "-01").order("id").range(debut, fin),
      appel => appel.id) : null,
  ]);
  // Décision D27 : « Finances » n'existe que chez le propriétaire direct (/espace/<id>).
  const base = baseEspace(orgId, true);
  const href = (a: number, m = numeroMois, anchor = "") => `${base}/loyers?${new URLSearchParams({ annee: String(a), mois: String(m), ...(bien ? { bien } : {}), ...(entiteId ? {entite:entiteId} : {}) })}${anchor}`;
  const perimetre = bien || entiteId ? new Set((lots ?? []).filter(l => (!bien || l.bien_id === bien) && (!entiteId || !!entite?.lots.includes(l.id))).map(l => l.id)) : null;
  const erreurPerimetre = (!!perimetre && (lots?.length ?? 0) >= 1000) || erreurBiens || erreurLots || patrimoine.erreur || (entiteId && !entite) || (bien && !(biens ?? []).some(b => b.id === bien));
  const lignesDuParc = ((quittancement.data ?? []) as LigneQuittancement[]).filter(l => !perimetre || perimetre.has(l.lot_id));
  const dates = new Map(datesAppels?.lignes?.map(a => [a.id, a.date_echeance]));
  const periodesParLot = Map.groupBy(patrimoine.periodes, p => p.lot_id);
  const attribution = (l: LigneQuittancement) => titulaireDuLoyer(periodesParLot.get(l.lot_id) ?? [], mois, dates.get(l.appel_id));
  const lignes = entiteId ? lignesDuParc.filter(l => attribution(l) === entiteId) : lignesDuParc;
  const incertaines = entiteId ? lignesDuParc.filter(l => attribution(l) === null) : [];
  // Pour un premier bail, l’appel peut encore manquer. Rejoindre son échéancier
  // depuis ce même écran, sans créer de revenu et sans ouvrir un autre patrimoine.
  const premierBail = !erreurPerimetre && !quittancement.error && !lignes.length && !bien && !entiteId && mois === actuel.slice(0,7)
    ? await supabase.from("baux").select("id").eq("organization_id",orgId).eq("etat","actif").limit(2) : null;
  const appele = lignes.reduce((s, l) => s + Number(l.montant_du), 0);
  const regle = lignes.reduce((s, l) => s + Math.min(Number(l.montant_du), Number(l.montant_couvert)), 0);
  // Une dépense commune d’un bâtiment mixte peut devoir être vérifiée. La
  // ventilation contrôle ensuite la détention de TOUS ses lots à la date de l’écriture.
  const biensDuLivre = entite
    ? new Set((lots ?? []).filter(lot => perimetre?.has(lot.id)).map(lot => lot.bien_id))
    : new Set(bien ? [bien] : []);
  const livreDuPerimetre = resumerLivre(livre.lignes, annee, perimetre, biensDuLivre);
  const groupes = !livre.error && !erreurPerimetre && (entiteId || patrimoine.entites.length > 1) && (lots?.length ?? 0) < 1000
    ? ventilerParTitulaire(livreDuPerimetre.lignes, patrimoine.periodes, lots ?? []) : null;
  const titulaire = groupes?.get(entiteId);
  const aRattacher = entite ? groupes?.get(null) : undefined;
  const resume = entiteId ? { lignes: titulaire?.ecritures ?? [], recettes: (titulaire?.recettes ?? 0)/100, depenses: (titulaire?.depenses ?? 0)/100 } : livreDuPerimetre;
  const ventilation = !entiteId && !bien ? groupes : null;
  const bouton = buttonVariants({ variant: "outline", size: "sm" });
  return <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-7">
    <div className="entete-page gap-3"><div><TitreEcran rubrique="finances">Finances</TitreEcran><p className="mt-2 text-sm text-muted-foreground">Ce qui est attendu, ce qui est reçu et ce que vous dépensez.</p></div><Link className={`${buttonVariants()} min-h-11`} href={`${base}/comptabilite?vue=saisie`}>Ajouter une dépense</Link></div>
    <FiltresFinances key={`${annee}:${bien}:${numeroMois}:${entiteId}`} action={`${base}/loyers`}>
      <label className="min-w-0 text-sm sm:flex-1">Patrimoine<select aria-label="Patrimoine" name="entite" defaultValue={entiteId} className="mt-1 block min-h-11 w-full max-w-full rounded-lg border border-border bg-background px-3"><option value="">Tout mon patrimoine</option>{entiteId && !entite && <option value={entiteId} disabled>Sélection indisponible pour {annee}</option>}{patrimoine.entites.map(e=><option key={e.id} value={e.id}>{e.nom}{e.qualite?.includes("SCI")?" · SCI":""}</option>)}</select></label>
      <label className="min-w-0 text-sm sm:flex-1">Bien<select aria-label="Bien" name="bien" defaultValue={bien} className="mt-1 block min-h-11 w-full max-w-full rounded-lg border border-border bg-background px-3"><option value="">Tous les biens</option>{(biens??[]).map(b=><option key={b.id} value={b.id}>{b.nom}</option>)}</select></label>
      <label className="text-sm">Année<input aria-label="Année" name="annee" type="number" min="1970" max={anneeCourante + 1} defaultValue={annee} className="mt-1 block min-h-11 w-24 rounded-lg border border-border bg-background px-3" /></label>
      <input type="hidden" name="mois" value={numeroMois} /><button className={bouton} type="submit">Afficher</button>
    </FiltresFinances>
    {entite && <p className="text-sm text-muted-foreground">Loyers attribuables à {entite.nom} à leur échéance. Le bilan présente seulement les opérations attribuables à ce patrimoine à leur date d’enregistrement.</p>}
    {perimetre && !livre.error && livre.lignes.some(e => e.date_imputation.startsWith(annee+"-") && e.categorie==="Taxe foncière" && !e.lot_id && !e.bien_id) && <p role="status" className="text-sm">Une taxe foncière du patrimoine reste à rattacher à un bien. Vérifiez le journal complet avant d’utiliser ce total.</p>}
    {erreurPerimetre ? <p className="err" role="alert">{entiteId && !entite && !patrimoine.erreur ? "Ce patrimoine n’est pas disponible pour cette année. Choisissez une autre année ou « Tout mon patrimoine »." : "Impossible de lire le bien sélectionné. Rechargez la page ou choisissez un autre bien."}</p> : <>
    <NavigationFinances
      vide={!erreurPerimetre && !livre.error && !quittancement.error && !biens?.length && !lots?.length && !livre.lignes.length && !lignes.length ? <section className="carte-rubrique p-6 sm:p-8" aria-labelledby="titre-finances-neuves">
        <h2 id="titre-finances-neuves" className="font-heading text-2xl">Vos finances commencent avec votre premier bien</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Vos loyers apparaîtront ici dès votre première location. Vous pourrez suivre vos dépenses et retrouver le bilan de chaque année.</p>
        <Link href={`${base}/parc/nouveau`} className={`${buttonVariants()} mt-5 min-h-11`}>Ajouter un bien</Link>
      </section> : undefined}
      loyers={
    <section id="loyers" aria-labelledby="titre-loyers" data-ton="bleu" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-loyers" className="titre-rubrique text-lg font-semibold"><Banknote size={22} aria-hidden="true" />Loyers et charges</h2><span className="text-sm text-muted-foreground">Échéances {deElide(moisEnFrancais(mois))}</span></div>
      {quittancement.error || datesAppels?.echec ? <p role="alert" className="err">Impossible de lire les loyers de cette période.</p> : <>
        <Chiffres valeurs={[["Attendu", appele], ["Encaissé ou compensé", regle], ["Restant dû", Math.max(0, appele - regle)]]} />
        <p className="text-xs text-muted-foreground">Pour les échéances du mois choisi : versements et compensations, hors avances. Les dépenses sont présentées à part.</p>
        {incertaines.length > 0 && <div className="rounded-lg border p-3" role="status">
          <p className="font-medium">Loyers à rattacher</p>
          <p className="text-sm">Vérifiez la détention de ces lots pour la période. Ces sommes sont exclues du total de {entite?.nom}.</p>
          <ul>{incertaines.map(l => <li key={l.appel_id}>{l.lot_nom} · {eur(Number(l.montant_du))} demandé</li>)}</ul>
        </div>}
        {lignes.length ? <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Voir {lignes.length === 1 ? "le loyer" : `les ${lignes.length} loyers`} {deElide(moisEnFrancais(mois))}</summary>{mois === actuel.slice(0, 7) ? <Card size="sm" className="mt-3"><QuittancementMois orgId={orgId} mois={mois} moisLabel={moisEnFrancais(mois)} lignes={lignes} proprietaire envoiGroupe={!bien && !entiteId} /></Card> : <ul className="mt-3 divide-y divide-border">{lignes.map(l => <li key={l.appel_id}><Link className="flex flex-wrap justify-between gap-2 py-3 text-sm" href={`${base}/baux/${l.bail_id}#loyers`}><span>{l.locataire ?? "Locataire non renseigné"} · {l.lot_nom}</span><span>{eur(Number(l.montant_du))} demandé · {eur(Number(l.montant_couvert))} réglé →</span></Link></li>)}</ul>}</details> : <p className="text-sm text-muted-foreground">Aucun loyer demandé sur cette période.{premierBail?.data?.length === 1 && <> <Link className="underline" href={`${base}/baux/${premierBail.data[0].id}#loyers`}>Vérifier l’échéancier du bail</Link></>}</p>}
      </>}
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Historique des loyers <span aria-hidden>⌄</span></summary><nav aria-label="Mois des loyers" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({length:12},(_,i) => <Link key={i} href={href(annee,i+1,"#loyers")} aria-current={i+1 === numeroMois ? "date" : undefined} className={`rounded-lg px-3 py-2 text-sm ${i+1 === numeroMois ? "bg-primary text-primary-foreground" : "bg-muted hover:underline"}`}>{moisEnFrancais(`${annee}-${String(i+1).padStart(2,"0")}`)}</Link>)}</nav></details>
    </section>
}
      depenses={
    <section id="depenses" aria-labelledby="titre-depenses" data-ton="vert" className="carte-rubrique space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-depenses" className="titre-rubrique text-lg font-semibold"><ArrowLeftRight size={22} aria-hidden="true" />Dépenses</h2><span className="text-sm text-muted-foreground">Année {annee}</span></div>
      {livre.error ? <p role="alert" className="err">Impossible de lire les dépenses. Aucun total ne peut être affiché.</p> : <>
        <dl><dt className="text-sm text-muted-foreground">Dépenses enregistrées</dt><dd className="montant mt-1 text-3xl font-semibold">{eur(resume.depenses)}</dd></dl>
        <p className="text-sm text-muted-foreground">Pour le patrimoine sélectionné. L’enregistrement d’une dépense ne prouve pas son règlement.</p>
        {aRattacher && <p role="status" className="rounded-lg border p-3 text-sm">{eur(aRattacher.depenses / 100)} de dépenses restent à rattacher et sont exclues de ce total. <a href="#operations" className="underline">Vérifier dans le bilan de l’année</a>.</p>}
        {resume.lignes.some(e => e.sens === "depense") ? <ListeOperations lignes={resume.lignes.filter(e => e.sens === "depense")} /> : <div className="vide-guide"><p className="titre">Aucune dépense pour cette sélection</p><p className="explication">Ajoutez une dépense avec son justificatif, ou choisissez une autre année ou un autre bien.</p></div>}
      </>}
    </section>
}
      bilan={
    <section id="operations" aria-labelledby="titre-operations" data-ton="vert" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-operations" className="titre-rubrique text-lg font-semibold"><ArrowLeftRight size={22} aria-hidden="true" />Bilan de l’année</h2><span className="text-sm text-muted-foreground">Année {annee}</span></div>
      {livre.error ? <p className="err" role="alert">Impossible de lire le livre. Les totaux ne sont pas affichés.</p> : <>
        <Chiffres valeurs={[["Recettes",resume.recettes],["Dépenses",resume.depenses],["Recettes − dépenses",resume.recettes-resume.depenses]]} />
        <p className="text-xs text-muted-foreground">Opérations enregistrées sur l’année sélectionnée, hors dépôts de garantie et annulations. Ce bilan ne constitue pas un calcul d’impôt.</p>
        {aRattacher && <section aria-labelledby="titre-a-rattacher" className="space-y-2 rounded-lg border border-border p-3">
          <h3 id="titre-a-rattacher" className="font-semibold">{aRattacher.ecritures.length} opération{aRattacher.ecritures.length > 1 ? "s" : ""} à rattacher</h3>
          <p className="text-sm text-muted-foreground">Le titulaire de ces opérations reste à vérifier à leur date comptable. Leurs montants sont exclus des totaux de {entite?.nom}.</p>
          <Chiffres valeurs={[["Recettes à rattacher", aRattacher.recettes / 100], ["Dépenses à rattacher", aRattacher.depenses / 100], ["Solde à rattacher", (aRattacher.recettes - aRattacher.depenses) / 100]]} />
          <details><summary className="cursor-pointer text-sm font-medium">Voir les opérations à rattacher</summary>
            <ListeOperations lignes={aRattacher.ecritures} />
          </details>
        </section>}
        {ventilation && ventilation.size > 0 && <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer font-semibold">Détail par propriétaire et SCI</summary>
          <p className="mt-2 text-sm text-muted-foreground">Chaque opération figure une seule fois, selon la détention à sa date comptable. Les opérations partagées ou sans rattachement certain restent à vérifier.</p>
          {[...ventilation].map(([id, groupe]) => <details key={id ?? "sans-titulaire"} className="border-b py-3 last:border-0">
            <summary className="cursor-pointer text-sm font-medium">{patrimoine.entites.find(e => e.id === id)?.nom ?? "Rattachement à vérifier"} · {groupe.ecritures.length} opération{groupe.ecritures.length > 1 ? "s" : ""}</summary>
            <Chiffres valeurs={[["Recettes",groupe.recettes/100],["Dépenses",groupe.depenses/100],["Solde",(groupe.recettes-groupe.depenses)/100]]}/>
            <ListeOperations lignes={groupe.ecritures} />
          </details>)}
        </details>}
        {resume.lignes.length ? <ul className="divide-y divide-border">{resume.lignes.slice(0,3).map(e => <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="break-words">{e.libelle || e.categorie.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{formaterDate(e.date_imputation)}</p></div><span className="shrink-0 montant">{e.sens === "recette" ? "+" : "−"}{eur(Number(e.montant))}</span></li>)}</ul> : !aRattacher && <p className="text-sm text-muted-foreground">Aucune opération pour {annee}.</p>}
      </>}
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Historique des opérations <span aria-hidden>⌄</span></summary><div className="mt-3 space-y-3">{!livre.error && <ul className="max-h-72 overflow-y-auto divide-y divide-border">{resume.lignes.map(e => <li className="flex justify-between gap-3 py-2 text-sm" key={e.id}><span>{formaterDate(e.date_imputation)} · {e.libelle || e.categorie.replaceAll("_", " ")}</span><span className="shrink-0 montant">{e.sens === "recette" ? "+" : "−"}{eur(Number(e.montant))}</span></li>)}</ul>}</div></details>
    </section>
}
    />
    <OutilsComptables>
      <p className="mt-2 text-sm text-muted-foreground">Les outils avancés conservent toutes leurs fonctions. Le livre complet porte sur tout cet espace, sans les filtres ci-dessus.</p>
      <nav aria-label="Outils comptables" className="my-4 flex flex-wrap gap-2">
        <Link className={bouton} href={`${base}/comptabilite`}>Livre complet et exports</Link>
        <Link className={bouton} href={`${base}/comptabilite?vue=saisie`}>Saisir une écriture</Link>
        <Link className={bouton} href={`${base}/comptabilite?vue=cloture`}>Clôturer un mois</Link>
        <Link className={bouton} href={`${base}/comptabilite/reprise`}>Reprise des comptes</Link>
      </nav>
    <section id="declaration" aria-labelledby="titre-declaration" data-ton="or" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-declaration" className="titre-rubrique text-lg font-semibold"><FileCheck2 size={22} aria-hidden="true" />Déclaration fiscale</h2><span className="text-sm text-muted-foreground">Revenus {annee}</span></div>
      <RecapitulatifFiscal params={Promise.resolve({orgId})} searchParams={Promise.resolve({annee:String(annee),bien: bien || undefined, entite:entiteId || undefined})} compact />
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Récapitulatifs précédents <span aria-hidden>⌄</span></summary><div className="mt-3"><p className="text-xs text-muted-foreground">Récapitulatifs des années précédentes, calculés depuis votre livre.</p><nav aria-label="Années fiscales précédentes" className="mt-2 flex flex-wrap gap-2">{Array.from({length:3},(_,i) => annee-i-1).filter(a=>a>=1970).map(a=><Link key={a} className={bouton} href={href(a,numeroMois,"#declaration")}>Revenus {a}</Link>)}</nav></div></details>
    </section>
    </OutilsComptables>
    </>}
  </main>;
}

function Chiffres({ valeurs }: { valeurs: [string, number][] }) {
  return <dl className="chiffres-finances grid grid-cols-3 gap-3">{valeurs.map(([label,valeur])=><div key={label}><dt className="text-xs leading-snug text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-base sm:text-xl font-semibold montant">{eur(valeur)}</dd></div>)}</dl>;
}

function ListeOperations({ lignes }: { lignes: EcritureFinances[] }) {
  return <ul>{lignes.map(e => <li key={e.id} className="flex justify-between gap-3 py-1 text-sm">
    <span className="min-w-0 break-words">{formaterDate(e.date_imputation)} · {e.libelle || e.categorie}</span>
    <span className="shrink-0 montant">{e.sens === "depense" ? "−" : "+"}{eur(Number(e.montant))}</span>
  </li>)}</ul>;
}
