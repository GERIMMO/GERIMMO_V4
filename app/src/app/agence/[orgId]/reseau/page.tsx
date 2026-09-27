import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { estUuid } from "@/lib/identifiants";
import { ConfirmerCommuneBien, InteretReseau, MessageReseau } from "@/components/disponibilite-reseau";
import type { CommuneReseau, DisponibiliteReseau } from "@/lib/reseau";
import { METIERS_ARTISAN, NATURES_TRAVAUX } from "../artisans/referentiel";

export const metadata = { title: "Réseau d’artisans pour mes biens — Gerimmo" };
const champ = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
type Bien = { id: string; nom: string; address_line1: string | null; postal_code: string | null; city: string | null; commune_insee: string | null };
type Artisan = { artisan_id: string; raison_sociale: string; rattache: boolean; decennale_valide: boolean };
export default async function ReseauBien({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId } = await params;
  const { supabase } = await verifierAccesEspace(orgId);
  const q = await searchParams;
  const texte = (cle: string) => typeof q[cle] === "string" ? q[cle] as string : "";
  const bienId = estUuid(texte("bien")) ? texte("bien") : "";
  const metier = Object.hasOwn(METIERS_ARTISAN, texte("metier")) ? texte("metier") : "";
  const nature = Object.hasOwn(NATURES_TRAVAUX, texte("nature")) ? texte("nature") : "entretien_courant";
  const page = /^[1-9]\d{0,4}$/.test(texte("page")) ? Number(texte("page")) : 1;
  const [liste, selection] = await Promise.all([
    supabase.from("biens").select("id,nom,address_line1,postal_code,city,commune_insee", { count: "exact" }).eq("organization_id", orgId).order("nom").order("id").range((page-1)*50, page*50-1),
    bienId ? supabase.from("biens").select("id,nom,address_line1,postal_code,city,commune_insee").eq("id", bienId).eq("organization_id", orgId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const bien = selection.data as Bien | null;
  const biens = (liste.data ?? []) as Bien[];
  if (bien && !biens.some(b => b.id === bien.id)) biens.unshift(bien);
  const [communes, controle, artisans] = await Promise.all([
    bien?.postal_code ? supabase.from("reseau_communes").select("code,nom,codes_postaux,departement").contains("codes_postaux", [bien.postal_code]).order("nom") : Promise.resolve({ data: [], error: null }),
    bien && metier ? supabase.rpc("reseau_disponibilite", { p_org: orgId, p_bien: bien.id, p_metier: metier, p_nature: nature }) : Promise.resolve({ data: [], error: null }),
    bien && metier ? supabase.rpc("artisans_disponibles_bien", { p_org: orgId, p_bien: bien.id, p_metier: metier, p_nature: nature }) : Promise.resolve({ data: [], error: null }),
  ]);
  const disponibilite = controle.data?.[0] ? { ...controle.data[0], metier, nature } as DisponibiliteReseau : null;
  const lienPage = (numero: number) => `/agence/${orgId}/reseau?${new URLSearchParams({ page: String(numero), ...(bienId ? { bien: bienId } : {}), ...(metier ? { metier } : {}), nature })}`;
  return <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-7">
    <div className="entete-page"><div><h1>Réseau d’artisans pour mes biens</h1><p className="mesure-lecture mt-2 text-sm text-[var(--texte-secondaire)]">Vérifiez les métiers disponibles à l’adresse de chaque bien. La gestion de vos locations reste accessible partout en France.</p></div><Link className="btn-secondaire" href={`/agence/${orgId}/artisans`}>Mon carnet d’artisans</Link></div>
    <section className="loc-carte space-y-4"><h2 className="font-heading text-xl">Quel bien et quels travaux ?</h2>
      {liste.error ? <p role="alert" className="err">La liste de vos biens est indisponible. Rechargez la page.</p> : !biens.length && page === 1 ? <p className="text-sm">Ajoutez d’abord un bien dans votre parc pour vérifier le réseau à son adresse. <Link href={`/agence/${orgId}/parc/nouveau`} className="underline">Ajouter un bien</Link></p> : <>
        <form method="get" className="grid gap-4 sm:grid-cols-2"><input name="page" type="hidden" value={page} /><label htmlFor="bien" className="space-y-1 text-sm sm:col-span-2"><span>Bien concerné</span><select id="bien" name="bien" required defaultValue={bienId} className={champ}><option value="" disabled>Choisir un bien</option>{biens.map(b => <option key={b.id} value={b.id}>{b.nom} · {b.address_line1 || "Adresse à compléter"} · {b.postal_code} {b.city}</option>)}</select></label><label htmlFor="metier" className="space-y-1 text-sm"><span>Métier recherché</span><select id="metier" name="metier" defaultValue={metier} className={champ}><option value="">Choisir un métier</option>{Object.entries(METIERS_ARTISAN).map(([cle,nom]) => <option key={cle} value={cle}>{nom}</option>)}</select></label><label htmlFor="nature" className="space-y-1 text-sm"><span>Nature des travaux</span><select id="nature" name="nature" defaultValue={nature} className={champ}>{Object.entries(NATURES_TRAVAUX).map(([cle,nom]) => <option key={cle} value={cle}>{nom}</option>)}</select></label><button type="submit" className="btn-or min-h-11 sm:col-span-2">Vérifier pour ce bien</button></form>
        {(liste.count ?? 0) > 50 && <nav aria-label="Pages des biens" className="flex flex-wrap gap-4 text-sm"><span>Biens · page {page}</span>{page > 1 && <Link className="underline" href={lienPage(page-1)}>Biens précédents</Link>}{page*50 < (liste.count ?? 0) && <Link className="underline" href={lienPage(page+1)}>Biens suivants</Link>}</nav>}
      </>}
    </section>
    {(selection.error || (bienId && !bien)) && <p role="alert" className="err">Ce bien n’est pas accessible. Choisissez un bien de votre portefeuille.</p>}
    {bien && <section className="loc-carte space-y-4"><h2 className="font-heading text-xl">{bien.nom}</h2><p className="text-sm">{bien.address_line1 || "Rue à compléter"} · {bien.postal_code || "Code postal à compléter"} {bien.city || "Ville à compléter"}</p><p className="text-xs text-muted-foreground">Seule cette adresse détermine la couverture, même si votre domicile est dans une autre commune.</p>
      {communes.error ? <p role="alert" className="err">Les communes ne peuvent pas être chargées. Réessayez avant de vérifier la disponibilité.</p> : <ConfirmerCommuneBien key={bien.id} orgId={orgId} bienId={bien.id} communes={(communes.data ?? []) as CommuneReseau[]} communeActuelle={bien.commune_insee} />}
      {controle.error ? <p role="alert" className="err">La disponibilité ne peut pas être vérifiée actuellement. Aucune demande ne peut être envoyée au réseau depuis cette page. Réessayez.</p> : disponibilite ? <><MessageReseau orgId={orgId} bienId={bien.id} disponibilite={disponibilite} /><InteretReseau key={`${bien.id}-${metier}-${nature}`} orgId={orgId} bienId={bien.id} disponibilite={disponibilite} /></> : <p className="text-sm text-muted-foreground">Choisissez un métier pour connaître sa disponibilité.</p>}
      {artisans.error ? <p role="alert" className="err">La liste des artisans est indisponible.</p> : (artisans.data?.length ?? 0) > 0 && <div className="space-y-3"><h3 className="font-medium">Artisans correspondant à ces travaux</h3><ul className="space-y-2">{(artisans.data as Artisan[]).map(a => <li key={a.artisan_id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--filet)] py-3 text-sm"><span>{a.raison_sociale}</span><span className="puce puce-grise">{a.rattache ? "Mon carnet" : "Réseau Gerimmo"}</span></li>)}</ul><p className="text-sm text-muted-foreground">Pour demander un devis, ouvrez l’incident concerné puis choisissez le métier et les travaux. La disponibilité sera de nouveau vérifiée avant l’envoi.</p><Link href={`/agence/${orgId}/incidents`} className="btn-or inline-flex">Voir mes incidents</Link></div>}
      <Link href={`/agence/${orgId}/parc/${bien.id}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Ouvrir la fiche du bien</Link>
    </section>}
  </main>;
}
