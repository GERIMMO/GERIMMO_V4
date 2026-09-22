import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, MapPin, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import voisinsFichier from '@/data/departements-voisins.json';
import marcheFichier from '@/data/territoires-marche.json';
import { evaluerPorte } from '@/lib/porte-sante';
import { decider, noterCandidats, prioriteTerritoriale, type Marche, type Voisinage } from '@/lib/score-territoire';
import { LIBELLES_MARCHE, fusionnerMarche, lireTerritoire, type LigneMarche } from '@/lib/mesures-territoire';
import { depuisHeures, dernieresTaches, type PasseConsignee } from '@/lib/tache';
import { empreinteParDepartement, empreinteParRegion, type LigneBail, type LigneBien, type LigneLot, type LigneOrganisation } from '@/lib/territoire';

export const metadata = { title: 'Développement territorial — Gerimmo' };
export const dynamic = 'force-dynamic';
const nombre = (n: number | null | undefined) => n == null ? 'À mesurer' : n.toLocaleString('fr-FR');
const euros = (n: number | null | undefined) => n == null ? 'À mesurer' : (n / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const date = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString('fr-FR') : 'Date inconnue';
function sourcePublique(url?: string) {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === 'https:' && ['api.insee.fr','www.insee.fr','recherche-entreprises.api.gouv.fr','www.data.gouv.fr','www.legifrance.gouv.fr'].includes(u.hostname) ? u.href : null; } catch { return null; }
}

export default async function PageTerritoire() {
  const supabase = await createClient();
  const [orgs, biens, lots, baux, passes, erreurs, bugs, donneesMarche] = await Promise.all([
    lireTerritoire(supabase, 'organizations', 'id,type,status,postal_code,created_at'),
    lireTerritoire(supabase, 'biens', 'id,organization_id,postal_code'),
    lireTerritoire(supabase, 'lots', 'id,bien_id,etat'),
    lireTerritoire(supabase, 'baux', 'id,lot_id,etat'),
    supabase.from('tech_log').select('evenement,details,created_at').like('evenement', 'tache_%').order('created_at', { ascending: false }).limit(50),
    supabase.from('tech_log').select('id', { count: 'exact', head: true }).eq('evenement', 'erreur_ecran').gte('created_at', depuisHeures(24)),
    supabase.from('retours_utilisateurs').select('id', { count: 'exact', head: true }).eq('nature', 'bug').eq('gravite', 'N1').in('etat', ['nouveau','en_examen','en_cours']),
    supabase.from('territory_market_data').select("departement,logements_locatifs,agences_locales,tension_marche,concurrence,artisans_disponibles,cout_publicitaire_cents,clics_publicitaires,prospects,clients_gagnes,cout_acquisition_cents,cout_prospect_cents,periode_publicite_debut,periode_publicite_fin,observations,mesure_le"),
  ]);
  const echec = [orgs.error, biens.error, lots.error, baux.error].some(Boolean);
  const empreinte = empreinteParDepartement({ organisations: (orgs.data ?? []) as LigneOrganisation[], biens: (biens.data ?? []) as LigneBien[], lots: (lots.data ?? []) as LigneLot[], baux: (baux.data ?? []) as LigneBail[] });
  const regions = empreinteParRegion(empreinte.lignes);
  const marche = fusionnerMarche(marcheFichier as Marche, (donneesMarche.data ?? []) as LigneMarche[]);
  const candidats = noterCandidats({ empreinte: empreinte.lignes, marche, voisinage: voisinsFichier.voisins as Voisinage });
  const decision = decider(empreinte.lignes, echec ? [] : candidats);
  const prochain = decision.prochain;
  const m = prochain ? marche.departements[prochain.code] : null;
  const priorite = m ? prioriteTerritoriale(m) : null;
  const porte = evaluerPorte({ passes: dernieresTaches((passes.data ?? []) as PasseConsignee[]), erreursEcran24h: erreurs.error ? null : erreurs.count ?? 0, bugsBloquantsOuverts: bugs.error ? null : bugs.count ?? 0 });
  const nonPlaces = empreinte.sansCodePostal.organisations + empreinte.sansCodePostal.biens + empreinte.horsReferentiel;
  const connaissance = Object.values(marche.departements);

  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-7">
    <section className="relative overflow-hidden rounded-3xl bg-[#123474] text-white shadow-lg">
      <Image src="/marketing/facebook-cover-gerimmo.jpg" alt="" fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#10275f] via-[#173f9b]/90 to-[#173f9b]/40" />
      <div className="relative p-6 sm:p-9"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-100"><MapPin className="size-4" /> Équipe développement territorial</p><h1 className="mt-3 font-heading text-3xl sm:text-4xl">Grandir là où Gerimmo peut rendre service.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-blue-50">Comparez le marché locatif, le réseau d’artisans et les résultats commerciaux. Gerimmo prépare une priorité et explique ce qu’il faut encore vérifier avant de recruter.</p></div>
    </section>
    {(echec || donneesMarche.error) && <p role="alert" className="err">Certaines informations ne sont pas disponibles. {echec ? 'La recommandation est suspendue pour éviter de choisir sur un portefeuille incomplet.' : 'Les sources publiques restent visibles ; le réseau et les résultats commerciaux doivent être actualisés.'}</p>}
    <section aria-label="Présence et connaissance du marché" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Départements présents', echec ? '—' : empreinte.lignes.length, `${regions.length} régions couvertes`, 'bg-blue-50'], ['Baux en cours', echec ? '—' : empreinte.lignes.reduce((n,l) => n+l.bauxEnCours,0), 'activité réelle des utilisateurs', 'bg-emerald-50'], ['Marché locatif documenté', connaissance.filter(x => x.logements_loues_prive != null).length, 'départements · données INSEE', 'bg-amber-50'], ['Réseau vérifié', connaissance.filter(x => x.artisans_disponibles != null).length, 'départements dont la couverture est connue', 'bg-violet-50']].map(([titre, valeur, detail, fond]) => <div key={String(titre)} className={`rounded-2xl border border-[var(--filet)] p-5 ${fond}`}><p className="text-sm font-semibold text-[var(--bleu)]">{titre}</p><p className="mt-2 text-3xl font-semibold text-[var(--bleu)]">{valeur}</p><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{detail}</p></div>)}
    </section>
    {nonPlaces > 0 && <p className="text-sm text-warning-soft-foreground">{nonPlaces} organisation(s) ou bien(s) ne peuvent pas encore être localisés. Complétez leur code postal pour les intégrer à cette vue.</p>}

    <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="section-ecran"><p className="libelle-champ">La prochaine priorité</p><h2 className="mt-2 font-heading text-2xl text-[var(--bleu)]">{prochain ? `${prochain.nom} (${prochain.code})` : 'Compléter les informations'}</h2><p className="mt-3 text-sm leading-6">{echec ? 'La lecture du portefeuille doit être rétablie avant de choisir.' : decision.raison}</p>
        {prochain && <><div className="mt-4 flex flex-wrap gap-2"><span className="puce puce-encre">Indice {prochain.score}/100</span><span className="puce puce-prep">{prochain.couverture} % des indicateurs renseignés</span><span className="puce puce-grise">{prochain.region}</span></div>{prochain.manquants.length > 0 && <p className="mt-3 text-sm text-warning-soft-foreground">À compléter : {prochain.manquants.map(c => LIBELLES_MARCHE[c]).join(', ')}.</p>}{prochain.perimees.length > 0 && <p className="mt-2 text-sm text-warning-soft-foreground">À actualiser avant réutilisation : {prochain.perimees.map(c => LIBELLES_MARCHE[c]).join(', ')}.</p>}</>}
        <div className={`mt-5 rounded-xl border p-4 ${porte.ouverte ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" />{porte.ouverte ? 'Qualité de service compatible avec un essai' : 'Stabiliser le service avant d’élargir'}</p>{!porte.ouverte && <p className="mt-2 text-sm">Certains contrôles de fonctionnement demandent une vérification. <Link className="underline" href="/admin/sante">Voir la santé de Gerimmo</Link>.</p>}<p className="mt-2 text-sm">Cette recommandation ne lance aucune campagne. Toute publicité payante doit avoir un public, une durée et un budget validés.</p></div>
      </div>
      <div className="section-ecran"><p className="libelle-champ">Qui recruter d’abord</p><h2 className="mt-2 font-heading text-2xl text-[var(--bleu)]">{priorite?.titre ?? 'Documenter le marché'}</h2><p className="mt-3 text-sm leading-6">{priorite?.raison ?? 'Récupérer les volumes locatifs et les entreprises immobilières avant de proposer une destination.'}</p>{priorite && <ol className="mt-4 space-y-3">{priorite.etapes.map((e,i) => <li key={e} className="flex gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-800">{i+1}</span><span>{e}</span></li>)}</ol>}<div className="mt-5 flex flex-wrap gap-3"><Link href="/admin/artisans" className="btn-or inline-flex items-center gap-2 text-sm"><Users className="size-4" /> Voir les artisans</Link><Link href="/admin/marketing" className="btn-lien inline-flex items-center gap-2 text-sm">Préparer le marketing <ArrowRight className="size-4" /></Link></div></div>
    </section>

    {m && <section className="section-ecran"><div className="entete-carte"><h2>Ce qui justifie cette priorité</h2><span className="mono-discret">{prochain?.nom}</span></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[
      ['Locations privées vides', nombre(m.logements_loues_prive), 'Recensement INSEE ; les meublés sont exclus.'],
      ['Entreprises immobilières', nombre(m.agences), 'Entreprises actives référencées localement ; ce n’est pas le nombre de concurrents directs.'],
      ['Artisans vérifiés', nombre(m.artisans_disponibles), 'Publics, validés, sans exclusion globale. Vérifier disponibilité, métiers et assurances pour chaque mission.'],
      ['Concurrence directe', nombre(m.concurrence), 'Une étude documentée reste nécessaire si ce chiffre manque.'],
      ['Demandes de contact', nombre(m.prospects), `Coût par demande : ${euros(m.cout_prospect_cents)}.`],
      ['Clients réellement gagnés', nombre(m.clients_gagnes), `Coût par client : ${euros(m.cout_acquisition_cents)}. Une demande n’est pas un client.`],
    ].map(([titre, valeur, detail]) => <article key={titre} className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4"><h3 className="text-sm font-semibold">{titre}</h3><p className="mt-2 text-2xl font-semibold text-[var(--bleu)]">{valeur}</p><p className="mt-2 text-xs leading-5 text-[var(--texte-secondaire)]">{detail}</p></article>)}</div>{m.periode_publicite_debut && <p className="mt-3 text-xs text-[var(--texte-secondaire)]">Résultats commerciaux du {date(m.periode_publicite_debut)} au {date(m.periode_publicite_fin)}. Les résultats sans attribution fiable au département restent indiqués « À mesurer ».</p>}
      <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold">Voir les sources et les dates</summary><div className="mt-3 space-y-3">{Object.entries(m.observations ?? {}).map(([cle,o]) => <div key={cle} className="rounded-lg bg-[var(--ivoire)] p-3 text-sm"><p className="font-semibold">{LIBELLES_MARCHE[cle] ?? 'Indicateur territorial'}</p><p className="mt-1">{o.source} · observation : {date(o.observe_le)} · vérifiée le {date(o.recupere_le)}</p>{o.definition && <p className="mt-1 text-xs text-[var(--texte-secondaire)]">{o.definition}</p>}{sourcePublique(o.url) && <a href={sourcePublique(o.url)!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">Consulter la source officielle</a>}</div>)}</div></details>
    </section>}

    {!echec && <section className="section-ecran"><div className="entete-carte"><h2>Départements à comparer</h2><span className="mono-discret">10 premières priorités</span></div><div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Comparaison des départements"><table className="tableau w-full min-w-[42rem] text-sm"><caption className="sr-only">Priorités territoriales et données manquantes</caption><thead><tr><th>Département</th><th>Indice</th><th>Informations</th><th>Artisans vérifiés</th><th>À compléter</th></tr></thead><tbody>{candidats.slice(0,10).map(c => <tr key={c.code}><td><span className="font-semibold">{c.nom} ({c.code})</span><br /><span className="text-xs text-muted-foreground">{c.region}</span></td><td>{c.score}/100</td><td>{c.couverture} %</td><td>{nombre(marche.departements[c.code].artisans_disponibles)}</td><td className="max-w-xs text-xs text-muted-foreground">{c.manquants.map(k => LIBELLES_MARCHE[k]).join(', ') || 'Indicateurs renseignés'}</td></tr>)}</tbody></table></div><details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Comprendre le classement et les repères de recrutement</summary><p className="mt-2 leading-6 text-muted-foreground">Le marché locatif pèse 30 %, les entreprises immobilières 15 %, la proximité 15 %, le réseau artisanal 15 %, les communes en zone tendue 10 %, le coût par nouveau client 10 % et la concurrence directe 5 %. Un chiffre absent ou trop ancien n’ajoute aucun point. Les candidats comparables sont classés entre eux ; l’indice n’est pas une prévision de revenus.</p><p className="mt-2 leading-6 text-muted-foreground">Le repère de départ est trois artisans vérifiés, puis un essai avec des agences lorsqu’il existe au moins vingt entreprises immobilières et une pour mille locations privées vides. Sinon, l’essai vise les bailleurs. Ces règles de pilotage doivent être confrontées aux résultats locaux. Elles n’autorisent aucune dépense.</p></details></section>}

    <section className="section-ecran"><div className="entete-carte"><h2>Où Gerimmo est déjà présent</h2><span className="mono-discret">Biens localisés, quel que soit le siège de l’agence</span></div>{empreinte.lignes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{echec ? 'Présence momentanément indisponible.' : 'La présence apparaît dès qu’une organisation ou un bien possède un code postal.'}</p> : <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Présence de Gerimmo par département"><table className="tableau w-full min-w-[38rem] text-sm"><caption className="sr-only">Portefeuille de Gerimmo par département</caption><thead><tr><th>Département</th><th>Agences</th><th>Bailleurs directs</th><th>Biens</th><th>Lots</th><th>Baux en cours</th></tr></thead><tbody>{empreinte.lignes.map(l => <tr key={l.code}><td>{l.nom} ({l.code})</td><td>{l.agences}</td><td>{l.proprietairesDirects}</td><td>{l.biens}</td><td>{l.lots}</td><td>{l.bauxEnCours}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
