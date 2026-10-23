import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEPARTEMENTS } from "@/lib/territoire";
import { METIERS_ARTISAN } from "@/app/agence/[orgId]/artisans/referentiel";
import { statutCandidat, type CandidatReseau, type LignePilotageReseau } from "@/lib/reseau";
import { libelleZone, zoneCouvre, zonesCouvrant } from "@/lib/zone-artisan";
import { TableauCouverture } from "./tableau-couverture";

export const metadata = { title: "Réseau d’artisans" };
const champ = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const projection = "id,raison_sociale,statut_plateforme,siret_etat,visibilite,account_id,blacklist_globale_le";

/**
 * Couverture du réseau d'artisans (décision du dirigeant du 23/10/2026, migration 20261023180000) : chaque artisan
 * choisit sa zone (codes postaux ou départements) et ses métiers ; il est proposé dès que Gerimmo a validé son inscription
 * (SIRET vérifié) et que son profil est public. La supervision ne décide plus d'aucune ouverture ni d'aucun rattachement :
 * cet écran CONSTATE la couverture et la demande. Pour écarter un artisan : suspension ou liste noire, depuis sa fiche.
 */
export default async function Couverture({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: autorise, error: refus } = await supabase.rpc("is_super_admin");
  if (refus || autorise !== true) return <main className="p-7"><TitreEcran rubrique="territoire">Accès réservé à la supervision</TitreEcran></main>;
  const params = await searchParams;
  const texte = (cle: string) => typeof params[cle] === "string" ? params[cle] as string : "";
  const departement = DEPARTEMENTS.some(d => d.code === texte("departement")) ? texte("departement") : "91";
  const metier = Object.hasOwn(METIERS_ARTISAN, texte("metier")) ? texte("metier") : "plomberie";
  const recherche = texte("artisan").trim().slice(0, 100);
  const page = /^[1-9]\d{0,4}$/.test(texte("page")) ? Number(texte("page")) : 1;
  const pageInterets = /^[1-9]\d{0,4}$/.test(texte("interets")) ? Number(texte("interets")) : 1;
  const commune = /^[0-9AB]{5}$/.test(texte("commune")) ? texte("commune") : "";
  let requete = supabase.from("artisans").select(`${projection},artisan_metiers!inner(metier)`, { count: "exact" }).eq("artisan_metiers.metier", metier);
  if (recherche) requete = requete.ilike("raison_sociale", `%${recherche.replace(/[%_\\]/g, "")}%`);
  const [pilotage, liste, communeChoisie, demandeNationale] = await Promise.all([
    supabase.rpc("reseau_pilotage", { p_departement: departement, p_metier: metier }),
    requete.order("raison_sociale").order("id").range((page - 1) * 30, page * 30 - 1),
    commune ? supabase.from("reseau_communes").select("code,nom,codes_postaux").eq("code", commune).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.rpc("reseau_interets_pilotage", { p_offset: (pageInterets-1)*30, p_limite: 30 }),
  ]);
  const lignes = ((pilotage.data ?? []) as LignePilotageReseau[]).map(c => ({ ...c, artisans: Number(c.artisans), eligibles: Number(c.eligibles), interets: Number(c.interets), biens_interesses: Number(c.biens_interesses), demandes: Number(c.demandes) }));
  const candidats = (liste.data ?? []) as unknown as CandidatReseau[];
  const interetsNationaux = (demandeNationale.data ?? []) as {commune_code:string; commune_nom:string; departement:string; metier:string; interets:number; biens_interesses:number; dernier_interet:string; total_groupes:number}[];
  const groupesInterets = Number(interetsNationaux[0]?.total_groupes ?? 0);
  const lienInterets = (numero:number) => `/admin/couverture?${new URLSearchParams({departement,metier,interets:String(numero),...(commune ? {commune} : {})})}#interets-nationaux`;
  const courante = communeChoisie.data as { code: string; nom: string; codes_postaux: string[] } | null;

  // Les artisans dont la zone couvre la commune choisie, pour ce métier : retrouvés par les codes de zone candidats
  // (même règle que la base), puis vérifiés un à un par `zoneCouvre`.
  let artisansCommune: (CandidatReseau & { zones: string[] })[] = [];
  let erreurCommune = Boolean(communeChoisie.error);
  if (courante && !erreurCommune) {
    const candidates = [...new Set(courante.codes_postaux.flatMap(zonesCouvrant))];
    const zones = await supabase.from("artisan_zones").select("artisan_id,code_postal").in("code_postal", candidates).limit(1000);
    const couvrantes = (zones.data ?? []).filter(z => courante.codes_postaux.some(cp => zoneCouvre(z.code_postal, cp)));
    const ids = [...new Set(couvrantes.map(z => z.artisan_id))];
    const fiches = ids.length ? await supabase.from("artisans").select(`${projection},artisan_metiers!inner(metier)`).eq("artisan_metiers.metier", metier).in("id", ids).order("raison_sociale") : { data: [], error: null };
    erreurCommune = Boolean(zones.error || fiches.error);
    artisansCommune = ((fiches.data ?? []) as unknown as CandidatReseau[]).map(a => ({ ...a, zones: couvrantes.filter(z => z.artisan_id === a.id).map(z => z.code_postal) }));
  }
  const ligneCourante = lignes.find(c => c.commune_code === commune);
  const lienPage = (numero: number) => `/admin/couverture?${new URLSearchParams({ departement, metier, artisan: recherche, page: String(numero), ...(commune ? { commune } : {}) })}#recherche-artisan`;
  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-7">
    <div className="entete-page"><div><TitreEcran rubrique="territoire">Réseau d’artisans</TitreEcran><p className="mesure-lecture mt-2 text-sm text-[var(--texte-secondaire)]">La gestion immobilière est disponible partout en France. Chaque artisan choisit sa zone d’intervention et ses métiers ; il est proposé aux propriétaires dès que Gerimmo a validé son inscription et que son profil est public. Cet écran montre la couverture qui en résulte.</p></div><Link href="/admin/artisans" className="btn-secondaire">Artisans à valider</Link></div>
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--marque-clair)] p-4 text-sm">Aucune ouverture n’est à décider : depuis le 23/10/2026, la zone et les métiers déclarés par l’artisan suffisent. Pour écarter un artisan, suspendez son inscription ou inscrivez-le en liste noire depuis sa fiche.</div>
    <section id="interets-nationaux" className="loc-carte scroll-mt-24 space-y-3"><div className="entete-carte"><h2>Où le réseau est attendu</h2><span className="puce puce-encre">Toute la France</span></div><p className="text-sm text-muted-foreground">Les intérêts exprimés, regroupés par commune et métier, du plus demandé au moins demandé. Ce sont des besoins à étudier pour le recrutement, pas des interventions à envoyer.</p>
      {demandeNationale.error ? <p role="alert" className="err">Les intérêts nationaux sont indisponibles. Rechargez la page.</p> : !interetsNationaux.length ? <p className="text-sm">{pageInterets === 1 ? "Aucun intérêt enregistré pour le moment." : "Aucun autre résultat sur cette page."}</p> : <ul className="space-y-3">{interetsNationaux.map(i => <li key={`${i.commune_code}-${i.metier}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--filet)] py-2 text-sm"><div><b>{i.commune_nom} ({i.departement}) · {METIERS_ARTISAN[i.metier]}</b><p className="text-xs text-muted-foreground">{i.interets} intérêt{Number(i.interets)>1 ? "s" : ""} · {i.biens_interesses} bien{Number(i.biens_interesses)>1 ? "s" : ""} · dernier signalement le {new Date(i.dernier_interet).toLocaleDateString("fr-FR")}</p></div><Link href={`/admin/couverture?departement=${i.departement}&metier=${i.metier}&commune=${i.commune_code}#artisans-commune`} className="btn-secondaire">Étudier cette commune<span className="sr-only"> · {i.commune_nom} · {METIERS_ARTISAN[i.metier]}</span></Link></li>)}</ul>}
      <nav aria-label="Pages des intérêts nationaux" className="flex flex-wrap gap-4 text-sm">{pageInterets>1 && <Link href={lienInterets(pageInterets-1)} className="underline">Intérêts précédents</Link>}{pageInterets*30<groupesInterets && <Link href={lienInterets(pageInterets+1)} className="underline">Intérêts suivants</Link>}</nav>
    </section>
    <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-1 text-sm" htmlFor="departement"><span id="departement-libelle">Département</span><select aria-labelledby="departement-libelle" id="departement" name="departement" defaultValue={departement} className={champ}>{[...DEPARTEMENTS].sort((a,b) => a.code.localeCompare(b.code)).map(d => <option key={d.code} value={d.code}>{d.code} · {d.nom}</option>)}</select></label><label className="space-y-1 text-sm" htmlFor="metier"><span id="metier-libelle">Métier</span><select aria-labelledby="metier-libelle" id="metier" name="metier" defaultValue={metier} className={champ}>{Object.entries(METIERS_ARTISAN).map(([cle,nom]) => <option key={cle} value={cle}>{nom}</option>)}</select></label><button className="btn-or min-h-11" type="submit">Afficher la couverture</button></form>
    {pilotage.error ? <p role="alert" className="err">La couverture ne peut pas être chargée. Rechargez la page.</p> : <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[["Communes couvertes", lignes.filter(c => c.ouverte).length], ["Artisan déclaré, pas encore proposé", lignes.filter(c => c.preparee && !c.ouverte).length], ["Intérêts exprimés", lignes.reduce((n,c) => n + c.interets, 0)], ["Demandes réseau envoyées", lignes.reduce((n,c) => n + c.demandes, 0)]].map(([titre,valeur]) => <div className="kpi" key={titre}><span className="libelle-champ">{titre}</span><div className="chiffre montant">{valeur}</div></div>)}</div>
      <TableauCouverture key={`${departement}-${metier}`} communes={lignes} metier={metier} departement={departement} />
    </>}
    <section id="artisans-commune" className="loc-carte scroll-mt-24 space-y-3"><h2 className="font-heading text-xl">Artisans qui interviennent {courante ? `à ${courante.nom}` : "dans une commune"} · {METIERS_ARTISAN[metier]}</h2>{!courante ? <p className="text-sm text-muted-foreground">Cliquez sur le nom d’une commune dans le tableau pour voir les artisans dont la zone la couvre, et ce qui manque à chacun pour être proposé.</p> : erreurCommune ? <p role="alert" className="err">Les artisans de cette commune sont indisponibles. Réessayez.</p> : <>{artisansCommune.length ? <ul className="space-y-2 text-sm">{artisansCommune.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--filet)] py-2"><span><Link href={`/admin/clients/artisans/${a.id}`} className="underline underline-offset-4">{a.raison_sociale}</Link><small className="block text-muted-foreground">Zone : {a.zones.map(libelleZone).join(" · ")}</small></span><span className="puce puce-grise">{statutCandidat(a)}</span></li>)}</ul> : <p className="text-sm">Aucun artisan n’a déclaré cette commune pour ce métier.</p>}{ligneCourante && <p className="text-sm">{ligneCourante.eligibles} proposé{ligneCourante.eligibles > 1 ? "s" : ""} sur {ligneCourante.artisans} déclaré{ligneCourante.artisans > 1 ? "s" : ""} avec un compte.</p>}<p className="text-xs text-muted-foreground">L’éligibilité est revérifiée au moment de chaque demande, sur le code postal exact du bien. Si elle disparaît, aucune nouvelle demande ne peut être envoyée au réseau sans destinataire.</p></>}</section>
    <section id="recherche-artisan" className="loc-carte scroll-mt-24 space-y-4"><h2 className="font-heading text-xl">Artisans du métier · {METIERS_ARTISAN[metier]}</h2><form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="departement" value={departement} /><input type="hidden" name="metier" value={metier} />{commune && <input type="hidden" name="commune" value={commune} />}<label className="min-w-0 flex-1 space-y-1 text-sm" htmlFor="artisan"><span>Nom de l’entreprise</span><input id="artisan" name="artisan" defaultValue={recherche} maxLength={100} className={champ} /></label><button type="submit" className="btn-secondaire min-h-11">Rechercher un artisan</button></form>{liste.error ? <p role="alert" className="err">La liste des artisans est indisponible.</p> : <><p className="text-sm">{liste.count ?? 0} artisan{liste.count === 1 ? "" : "s"} · page {page}</p><ul className="space-y-2 text-sm">{candidats.map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--filet)] py-2"><Link href={`/admin/clients/artisans/${a.id}`} className="underline underline-offset-4">{a.raison_sociale}</Link><span className="puce puce-grise">{statutCandidat(a)}</span></li>)}</ul><nav aria-label="Pages des artisans" className="flex flex-wrap gap-4 text-sm">{page > 1 && <Link className="underline" href={lienPage(page-1)}>Précédent</Link>}{page * 30 < (liste.count ?? 0) && <Link className="underline" href={lienPage(page+1)}>Suivant</Link>}</nav></>}</section>
  </main>;
}
