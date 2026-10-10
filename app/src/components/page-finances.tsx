import Link from "next/link";
import { Banknote, ArrowLeftRight, FileCheck2 } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import { verifierAccesEspace } from "@/lib/espace";
import { aujourdhuiParis, eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { QuittancementMois, type LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";
import { RecapitulatifFiscal } from "@/components/recapitulatif-fiscal";
import { lireLivreFinances, resumerLivre } from "@/lib/finances";

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
  const [{ data: biens, error: erreurBiens }, { data: lots, error: erreurLots }, quittancement, livre] = await Promise.all([
    supabase.from("biens").select("id, nom, archived_at").eq("organization_id", orgId).order("nom"),
    supabase.from("lots").select("id, bien_id").eq("organization_id", orgId),
    supabase.rpc("quittancement_mois", { p_org: orgId, p_mois: `${mois}-01` }),
    lireLivreFinances(supabase, orgId),
  ]);
  const href = (a: number, m = numeroMois, anchor = "") => `/agence/${orgId}/loyers?${new URLSearchParams({ annee: String(a), mois: String(m), ...(bien ? { bien } : {}) })}${anchor}`;
  const perimetre = bien ? new Set((lots ?? []).filter(l => l.bien_id === bien).map(l => l.id)) : null;
  const erreurPerimetre = erreurBiens || erreurLots || (bien && !(biens ?? []).some(b => b.id === bien));
  const lignes = ((quittancement.data ?? []) as LigneQuittancement[]).filter(l => !perimetre || perimetre.has(l.lot_id));
  const appele = lignes.reduce((s, l) => s + Number(l.montant_du), 0);
  const encaisse = lignes.reduce((s, l) => s + Math.min(Number(l.montant_du), Number(l.montant_couvert)), 0);
  const resume = resumerLivre(livre.lignes, annee, perimetre);
  const base = `/agence/${orgId}`;
  const bouton = buttonVariants({ variant: "outline", size: "sm" });
  return <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-7">
    <div className="entete-page"><TitreEcran rubrique="finances">Finances</TitreEcran><span className="mono-discret">Loyers · Recettes et dépenses · Déclaration</span></div>
    <form key={`${annee}:${bien}:${numeroMois}`} action={`${base}/loyers`} className="barre-filtres flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full sm:basis-0 sm:flex-1 text-sm">Bien<select name="bien" defaultValue={bien} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3"><option value="">Tous les biens</option>{(biens ?? []).map(b => <option key={b.id} value={b.id}>{b.nom}{b.archived_at ? " (retiré)" : ""}</option>)}</select></label>
      <label className="text-sm">Année<input name="annee" type="number" min="1970" max={anneeCourante + 1} defaultValue={annee} className="mt-1 block min-h-11 w-24 rounded-lg border border-border bg-background px-3" /></label>
      <input type="hidden" name="mois" value={numeroMois} /><button className={bouton} type="submit">Afficher</button>
    </form>
    {erreurPerimetre ? <p className="err" role="alert">Impossible de lire le bien sélectionné. Rechargez la page ou choisissez un autre bien.</p> : <>
    <section id="loyers" aria-labelledby="titre-loyers" data-ton="bleu" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-loyers" className="titre-rubrique text-lg font-semibold"><Banknote size={22} aria-hidden="true" />Loyers et charges</h2><span className="text-sm text-muted-foreground">{moisEnFrancais(mois)}</span></div>
      {quittancement.error ? <p role="alert" className="err">Impossible de lire les loyers de cette période.</p> : <>
        <Chiffres valeurs={[["Demandé", appele], ["Encaissé", encaisse], ["Reste à encaisser", Math.max(0, appele - encaisse)]]} />
        {lignes.length ? <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Gérer les {lignes.length} loyers de {moisEnFrancais(mois)}</summary>{mois === actuel.slice(0, 7) ? <Card size="sm" className="mt-3"><QuittancementMois orgId={orgId} mois={mois} moisLabel={moisEnFrancais(mois)} lignes={lignes} proprietaire envoiGroupe={!bien} /></Card> : <ul className="mt-3 divide-y divide-border">{lignes.map(l => <li key={l.appel_id}><Link className="flex flex-wrap justify-between gap-2 py-3 text-sm" href={`${base}/baux/${l.bail_id}#loyers`}><span>{l.locataire ?? "Locataire non renseigné"} · {l.lot_nom}</span><span>{eur(Number(l.montant_du))} demandé · {eur(Number(l.montant_couvert))} couvert →</span></Link></li>)}</ul>}</details> : <p className="text-sm text-muted-foreground">Aucun loyer demandé sur cette période.</p>}
      </>}
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Historique des loyers <span aria-hidden>⌄</span></summary><nav aria-label="Mois des loyers" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({length:12},(_,i) => <Link key={i} href={href(annee,i+1,"#loyers")} aria-current={i+1 === numeroMois ? "date" : undefined} className={`rounded-lg px-3 py-2 text-sm ${i+1 === numeroMois ? "bg-primary text-primary-foreground" : "bg-muted hover:underline"}`}>{moisEnFrancais(`${annee}-${String(i+1).padStart(2,"0")}`)}</Link>)}</nav></details>
    </section>
    <section id="operations" aria-labelledby="titre-operations" data-ton="vert" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-operations" className="titre-rubrique text-lg font-semibold"><ArrowLeftRight size={22} aria-hidden="true" />Recettes et dépenses</h2><span className="text-sm text-muted-foreground">Année {annee}</span></div>
      {livre.error ? <p className="err" role="alert">Impossible de lire le livre. Les totaux ne sont pas affichés.</p> : <>
        <Chiffres valeurs={[["Recettes",resume.recettes],["Dépenses",resume.depenses],["Solde",resume.recettes-resume.depenses]]} />
        <p className="text-xs text-muted-foreground">Date comptable · hors dépôts de garantie et écritures annulées.</p>
        {resume.lignes.length ? <ul className="divide-y divide-border">{resume.lignes.slice(0,3).map(e => <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="min-w-0"><p className="break-words">{e.libelle || e.categorie.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{formaterDate(e.date_imputation)}</p></div><span className="shrink-0 montant">{e.sens === "recette" ? "+" : "−"}{eur(Number(e.montant))}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune opération pour {annee}.</p>}
      </>}
      <div className="flex flex-wrap gap-2"><Link className={bouton} href={`${base}/comptabilite?vue=saisie`}>Ajouter une recette ou dépense</Link><Link className={bouton} href={`${base}/comptabilite?vue=cloture`}>Clôturer un mois</Link></div>
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Historique des opérations <span aria-hidden>⌄</span></summary><div className="mt-3 space-y-3">{!livre.error && <ul className="max-h-72 overflow-y-auto divide-y divide-border">{resume.lignes.map(e => <li className="flex justify-between gap-3 py-2 text-sm" key={e.id}><span>{formaterDate(e.date_imputation)} · {e.libelle || e.categorie.replaceAll("_", " ")}</span><span className="shrink-0 montant">{e.sens === "recette" ? "+" : "−"}{eur(Number(e.montant))}</span></li>)}</ul>}<Link className="lien-discret inline-flex min-h-11 items-center" href={`${base}/comptabilite`}>Ouvrir le livre complet et les exports →</Link></div></details>
    </section>
    <section id="declaration" aria-labelledby="titre-declaration" data-ton="or" className="carte-rubrique p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-declaration" className="titre-rubrique text-lg font-semibold"><FileCheck2 size={22} aria-hidden="true" />Déclaration fiscale</h2><span className="text-sm text-muted-foreground">Revenus {annee}</span></div>
      <RecapitulatifFiscal params={Promise.resolve({orgId})} searchParams={Promise.resolve({annee:String(annee),bien: bien || undefined})} compact />
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">Déclarations précédentes <span aria-hidden>⌄</span></summary><div className="mt-3"><p className="text-xs text-muted-foreground">Récapitulatifs des années précédentes, calculés depuis votre livre.</p><nav aria-label="Années fiscales précédentes" className="mt-2 flex flex-wrap gap-2">{Array.from({length:3},(_,i) => annee-i-1).filter(a=>a>=1970).map(a=><Link key={a} className={bouton} href={href(a,numeroMois,"#declaration")}>Revenus {a}</Link>)}</nav></div></details>
    </section>
    </>}
  </main>;
}

function Chiffres({ valeurs }: { valeurs: [string, number][] }) {
  return <dl className="chiffres-finances grid grid-cols-3 gap-3">{valeurs.map(([label,valeur])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-base sm:text-xl font-semibold montant">{eur(valeur)}</dd></div>)}</dl>;
}
