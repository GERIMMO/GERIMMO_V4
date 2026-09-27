import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEPARTEMENTS } from "@/lib/territoire";
import { METIERS_ARTISAN } from "@/app/agence/[orgId]/artisans/referentiel";
import { statutCandidat, type CandidatReseau, type LignePilotageReseau } from "@/lib/reseau";
import { ReglagesReseau } from "./reglages-reseau";

export const metadata = { title: "Réseau d’artisans — Gerimmo" };
const champ = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const projection = "id,raison_sociale,statut_plateforme,siret_etat,visibilite,account_id,blacklist_globale_le";
export default async function Couverture({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: autorise, error: refus } = await supabase.rpc("is_super_admin");
  if (refus || autorise !== true) return <main className="p-7"><h1>Accès réservé à la supervision</h1></main>;
  const params = await searchParams;
  const texte = (cle: string) => typeof params[cle] === "string" ? params[cle] as string : "";
  const departement = DEPARTEMENTS.some(d => d.code === texte("departement")) ? texte("departement") : "91";
  const metier = Object.hasOwn(METIERS_ARTISAN, texte("metier")) ? texte("metier") : "plomberie";
  const recherche = texte("artisan").trim().slice(0, 100);
  const page = /^[1-9]\d{0,4}$/.test(texte("page")) ? Number(texte("page")) : 1;
  const commune = /^[0-9AB]{5}$/.test(texte("commune")) ? texte("commune") : "";
  let requete = supabase.from("artisans").select(`${projection},artisan_metiers!inner(metier)`, { count: "exact" }).eq("artisan_metiers.metier", metier);
  if (recherche) requete = requete.ilike("raison_sociale", `%${recherche.replace(/[%_\\]/g, "")}%`);
  const [pilotage, liste, rattaches] = await Promise.all([
    supabase.rpc("reseau_pilotage", { p_departement: departement, p_metier: metier }),
    requete.order("raison_sociale").order("id").range((page - 1) * 30, page * 30 - 1),
    commune ? supabase.from("reseau_artisan_communes").select(`artisan_id,artisan_metiers!inner(artisans(${projection}))`, { count: "exact" }).eq("commune_code", commune).eq("metier", metier).order("artisan_id").range(0, 999) : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);
  const lignes = (pilotage.data ?? []) as LignePilotageReseau[];
  const candidats = (liste.data ?? []) as unknown as CandidatReseau[];
  const courante = lignes.find(c => c.commune_code === commune);
  const artisansRattaches = (rattaches.data ?? []).flatMap(r => {
    const relation = r.artisan_metiers as unknown as { artisans: CandidatReseau | CandidatReseau[] } | { artisans: CandidatReseau | CandidatReseau[] }[];
    return (Array.isArray(relation) ? relation : [relation]).flatMap(m => m ? Array.isArray(m.artisans) ? m.artisans : [m.artisans] : []).filter(Boolean);
  });
  const lienPage = (numero: number) => `/admin/couverture?${new URLSearchParams({ departement, metier, artisan: recherche, page: String(numero), ...(commune ? { commune } : {}) })}#recherche-artisan`;
  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-7">
    <div className="entete-page"><div><h1>Réseau d’artisans</h1><p className="mesure-lecture mt-2 text-sm text-[var(--texte-secondaire)]">La gestion immobilière est disponible partout en France. Vous ouvrez uniquement la mise en relation avec le réseau, commune par commune et métier par métier.</p></div><Link href="/admin/artisans" className="btn-secondaire">Artisans à valider</Link></div>
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--marque-clair)] p-4 text-sm">Une inscription ou une validation d’artisan n’ouvre jamais une zone. Sans décision de votre part, elle reste fermée. Les codes postaux déclarés servent de repère ; les ouvertures utilisent les communes officielles.</div>
    <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-1 text-sm" htmlFor="departement"><span>Département</span><select id="departement" name="departement" defaultValue={departement} className={champ}>{[...DEPARTEMENTS].sort((a,b) => a.code.localeCompare(b.code)).map(d => <option key={d.code} value={d.code}>{d.code} · {d.nom}</option>)}</select></label><label className="space-y-1 text-sm" htmlFor="metier"><span>Métier</span><select id="metier" name="metier" defaultValue={metier} className={champ}>{Object.entries(METIERS_ARTISAN).map(([cle,nom]) => <option key={cle} value={cle}>{nom}</option>)}</select></label><button className="btn-or min-h-11" type="submit">Afficher la couverture</button></form>
    {pilotage.error ? <p role="alert" className="err">La couverture ne peut pas être chargée. Rechargez avant de prendre une décision.</p> : <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[["Communes ouvertes", lignes.filter(c => c.ouverte).length], ["Ouvertes sans artisan éligible", lignes.filter(c => c.ouverte && !c.eligibles).length], ["Intérêts exprimés", lignes.reduce((n,c) => n + c.interets, 0)], ["Demandes réseau envoyées", lignes.reduce((n,c) => n + c.demandes, 0)]].map(([titre,valeur]) => <div className="kpi" key={titre}><span className="libelle-champ">{titre}</span><div className="chiffre montant">{valeur}</div></div>)}</div>
      <ReglagesReseau key={`${departement}-${metier}-${recherche}-${page}`} communes={lignes} metier={metier} departement={departement} candidats={candidats} />
    </>}
    <section id="recherche-artisan" className="loc-carte scroll-mt-24 space-y-4"><h2 className="font-heading text-xl">Trouver l’artisan à rattacher · {METIERS_ARTISAN[metier]}</h2><form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="departement" value={departement} /><input type="hidden" name="metier" value={metier} />{commune && <input type="hidden" name="commune" value={commune} />}<label className="min-w-0 flex-1 space-y-1 text-sm" htmlFor="artisan"><span>Nom de l’entreprise</span><input id="artisan" name="artisan" defaultValue={recherche} maxLength={100} className={champ} /></label><button type="submit" className="btn-secondaire min-h-11">Rechercher un artisan</button></form>{liste.error ? <p role="alert" className="err">La liste des artisans est indisponible.</p> : <><p className="text-sm">{liste.count ?? 0} artisan{liste.count === 1 ? "" : "s"} · résultats de la page {page} disponibles dans le choix de l’étape 2.</p><ul className="space-y-2 text-sm">{candidats.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--filet)] py-2"><span>{a.raison_sociale}</span><span className="puce puce-grise">{statutCandidat(a)}</span></li>)}</ul><nav aria-label="Pages des artisans" className="flex flex-wrap gap-4 text-sm">{page > 1 && <Link className="underline" href={lienPage(page-1)}>Précédent</Link>}{page * 30 < (liste.count ?? 0) && <Link className="underline" href={lienPage(page+1)}>Suivant</Link>}</nav></>}</section>
    <section id="artisans-commune" className="loc-carte scroll-mt-24 space-y-3"><h2 className="font-heading text-xl">Artisans rattachés {courante ? `à ${courante.nom}` : "à une commune"}</h2>{!courante ? <p className="text-sm text-muted-foreground">Cliquez sur le nom d’une commune dans le tableau pour consulter ses artisans et leur validation.</p> : rattaches.error ? <p role="alert" className="err">Les rattachements sont indisponibles. Réessayez.</p> : <>{artisansRattaches.length ? <ul className="space-y-2 text-sm">{artisansRattaches.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--filet)] py-2"><span>{a.raison_sociale}</span><span>{statutCandidat(a)}</span></li>)}</ul> : <p className="text-sm">Aucun artisan rattaché pour ce métier. L’ouverture n’est pas possible.</p>}{(rattaches.count ?? 0) > 1000 && <p className="text-sm">Les 1 000 premiers rattachements sont affichés. Utilisez la recherche par nom pour retrouver les autres artisans.</p>}<p className="text-xs text-muted-foreground">L’éligibilité est revérifiée au moment de chaque demande. Si elle disparaît, aucune nouvelle demande ne peut être envoyée au réseau sans destinataire.</p></>}</section>
  </main>;
}
