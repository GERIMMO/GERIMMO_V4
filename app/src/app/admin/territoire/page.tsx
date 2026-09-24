import Link from 'next/link';
import {appliquerEtudes,type EtudeTerritoriale} from '@/lib/etudes-territoriales';
import {FormulaireEtude} from './etude';
import { ArrowRight, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import voisinsFichier from '@/data/departements-voisins.json';
import marcheFichier from '@/data/territoires-marche.json';
import { evaluerPorte } from '@/lib/porte-sante';
import { decider, noterCandidats, prioriteTerritoriale, type Marche, type Voisinage } from '@/lib/score-territoire';
import { LIBELLES_MARCHE, fusionnerMarche, lireTerritoire, type LigneMarche } from '@/lib/mesures-territoire';
import { depuisHeures, dernieresTaches, type PasseConsignee } from '@/lib/tache';
import { empreinteParDepartement, empreinteParRegion, type LigneBail, type LigneBien, type LigneLot, type LigneOrganisation } from '@/lib/territoire';

// Le nom de l'entrée de barre, partout (24/09).
export const metadata = { title: 'Territoire — Gerimmo' };
export const dynamic = 'force-dynamic';
const nombre = (n: number | null | undefined) => n == null ? 'À mesurer' : n.toLocaleString('fr-FR');
const euros = (n: number | null | undefined) => n == null ? 'À mesurer' : (n / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const date = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString('fr-FR') : 'Date inconnue';
const pluriel = (n: number, un: string, plusieurs: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? plusieurs : un}`;
function sourcePublique(url?: string) {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === 'https:' && ['api.insee.fr','www.insee.fr','recherche-entreprises.api.gouv.fr','www.data.gouv.fr','www.legifrance.gouv.fr'].includes(u.hostname) ? u.href : null; } catch { return null; }
}

export default async function PageTerritoire() {
  const supabase = await createClient();
  const [orgs, biens, lots, baux, passes, erreurs, bugs, donneesMarche, etudes] = await Promise.all([
    lireTerritoire(supabase, 'organizations', 'id,type,status,postal_code,created_at'),
    lireTerritoire(supabase, 'biens', 'id,organization_id,postal_code'),
    lireTerritoire(supabase, 'lots', 'id,bien_id,etat'),
    lireTerritoire(supabase, 'baux', 'id,lot_id,etat'),
    supabase.from('tech_log').select('evenement,details,created_at').like('evenement', 'tache_%').order('created_at', { ascending: false }).limit(50),
    supabase.from('tech_log').select('id', { count: 'exact', head: true }).eq('evenement', 'erreur_ecran').gte('created_at', depuisHeures(24)),
    supabase.from('retours_utilisateurs').select('id', { count: 'exact', head: true }).eq('nature', 'bug').eq('gravite', 'N1').in('etat', ['nouveau','en_examen','en_cours']),
    supabase.from('territory_market_data').select("departement,logements_locatifs,agences_locales,tension_marche,concurrence,artisans_disponibles,cout_publicitaire_cents,clics_publicitaires,prospects,clients_gagnes,cout_acquisition_cents,cout_prospect_cents,periode_publicite_debut,periode_publicite_fin,observations,mesure_le"),
    supabase.from('territory_studies_latest').select('*'),
  ]);
  const echec = [orgs.error, biens.error, lots.error, baux.error].some(Boolean);
  const empreinte = empreinteParDepartement({ organisations: (orgs.data ?? []) as LigneOrganisation[], biens: (biens.data ?? []) as LigneBien[], lots: (lots.data ?? []) as LigneLot[], baux: (baux.data ?? []) as LigneBail[] });
  const regions = empreinteParRegion(empreinte.lignes);
  const marche = appliquerEtudes(fusionnerMarche(marcheFichier as Marche, (donneesMarche.data ?? []) as LigneMarche[]),(etudes.data??[]) as EtudeTerritoriale[]);
  const candidats = noterCandidats({ empreinte: empreinte.lignes, marche, voisinage: voisinsFichier.voisins as Voisinage });
  const decision = decider(empreinte.lignes, echec ? [] : candidats);
  const prochain = decision.prochain;
  const m = prochain ? marche.departements[prochain.code] : null;
  const priorite = m ? prioriteTerritoriale(m) : null;
  const porte = evaluerPorte({ passes: dernieresTaches((passes.data ?? []) as PasseConsignee[]), erreursEcran24h: erreurs.error ? null : erreurs.count ?? 0, bugsBloquantsOuverts: bugs.error ? null : bugs.count ?? 0 });
  // Ce qui n'est pas localisé, détaillé et accordé (24/09) : « 4 organisation(s)
  // ou bien(s) » additionnait trois comptes sans dire lesquels.
  const nonPlaces = [
    empreinte.sansCodePostal.organisations > 0 && pluriel(empreinte.sansCodePostal.organisations, 'organisation', 'organisations'),
    empreinte.sansCodePostal.biens > 0 && pluriel(empreinte.sansCodePostal.biens, 'bien', 'biens'),
  ].filter(Boolean) as string[];
  const nbNonPlaces = empreinte.sansCodePostal.organisations + empreinte.sansCodePostal.biens;
  const connaissance = Object.values(marche.departements);
  const marcheDocumente = connaissance.filter(x => x.logements_loues_prive != null).length;
  const reseauVerifie = connaissance.filter(x => x.artisans_disponibles != null).length;
  // L'état vide dit d'où viennent les données et quand (24/09) : aucune saisie
  // n'existe, tout arrive par la ronde quotidienne du territoire (vercel.json,
  // 5 h UTC ; lib/sources-territoire.ts actualise quelques départements par
  // passage). La dernière ronde se lit dans le journal des tâches.
  const derniereRonde = passes.error ? undefined : dernieresTaches((passes.data ?? []) as PasseConsignee[]).territoire?.le ?? null;
  const sansDonnees = !echec && !prochain && candidats.length > 0;
  const toutACompleter = candidats.slice(0, 10).every(c => c.couverture === 0);
  const nbIndicateurs = Object.keys(LIBELLES_MARCHE).length;
  const aCompleter = (manquants: string[]) => manquants.length === 0 ? 'Indicateurs renseignés' : manquants.length >= nbIndicateurs ? 'Tous les indicateurs' : manquants.map(k => LIBELLES_MARCHE[k]).join(', ');
  const tuiles: { titre: string; valeur: string | number; detail: string; accent: string }[] = [
    { titre: 'Départements présents', valeur: echec ? '—' : empreinte.lignes.length, detail: `${regions.length} région${regions.length > 1 ? 's' : ''} couverte${regions.length > 1 ? 's' : ''}`, accent: '' },
    { titre: 'Baux en cours', valeur: echec ? '—' : empreinte.lignes.reduce((n, l) => n + l.bauxEnCours, 0), detail: 'activité réelle des utilisateurs', accent: '' },
    { titre: 'Marché locatif documenté', valeur: marcheDocumente, detail: 'départements · données INSEE', accent: marcheDocumente === 0 ? 'ambre' : '' },
    { titre: 'Réseau vérifié', valeur: reseauVerifie, detail: 'départements dont la couverture est connue', accent: reseauVerifie === 0 ? 'ambre' : '' },
  ];

  return <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-7">
    {/* L'en-tête commun de la console (24/09) : le pavé bleu nuit à photo et
        slogan faisait un à deux écrans de téléphone avant le premier chiffre. */}
    <div className="entete-page">
      <div className="min-w-0 flex-[1_1_20rem]"><h1>Territoire</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">Le marché locatif, le réseau d’artisans et les résultats commerciaux, comparés département par département. Gerimmo propose une priorité et dit ce qu’il faut encore vérifier avant de recruter.</p></div>
      <span className="mono-discret">{echec ? 'Présence indisponible' : pluriel(empreinte.lignes.length, 'département présent', 'départements présents')}</span>
    </div>
    {(echec || donneesMarche.error) && <p role="alert" className="err">Certaines informations ne sont pas disponibles. {echec ? 'La recommandation est suspendue pour éviter de choisir sur un portefeuille incomplet.' : 'Les sources publiques restent visibles ; le réseau et les résultats commerciaux doivent être actualisés.'}</p>}
    {/* La tuile commune de la console (24/09). La couleur suit la valeur : ambre
        quand elle appelle une action, neutre sinon — les quatre aplats pastel
        ne portaient aucun sens. Deux colonnes dès le téléphone. */}
    <section aria-label="Présence et connaissance du marché" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tuiles.map(t => <div key={t.titre} className={`kpi ${t.accent}`}><span className="libelle-champ">{t.titre}</span><div className="chiffre montant">{t.valeur}</div><span className="mono-discret sans-majuscules">{t.detail}</span></div>)}
    </section>
    {(nbNonPlaces > 0 || empreinte.horsReferentiel > 0) && <p className="text-sm text-warning-soft-foreground">{nbNonPlaces > 0 && <><Link href="/admin/clients" className="underline underline-offset-2">{nonPlaces.join(' et ')} sans code postal</Link> {nbNonPlaces > 1 ? 'ne sont pas localisé' : 'n’est pas localisé'}{empreinte.sansCodePostal.biens === 0 ? 'e' : ''}{nbNonPlaces > 1 ? 's' : ''}. Complétez le code postal pour {nbNonPlaces > 1 ? 'les ' : 'l’'}intégrer à cette vue.</>}{empreinte.horsReferentiel > 0 && ` ${pluriel(empreinte.horsReferentiel, 'code postal est', 'codes postaux sont')} hors des départements suivis.`}</p>}

    {/* La section porte le rythme ; ses deux colonnes s'alignent (24/09) :
        la seconde prenait la marge de « section + section » et commençait
        40 px plus bas. */}
    <section className="section-ecran grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div><p className="libelle-champ">La prochaine priorité</p><h2 className="mt-2 font-heading text-2xl text-[var(--bleu)]">{prochain ? `${prochain.nom} (${prochain.code})` : sansDonnees ? 'En attente des premières données' : 'Compléter les informations'}</h2>
        {sansDonnees ? <><p className="mt-3 text-sm leading-6">Aucune saisie n’est nécessaire : la ronde du territoire relève chaque matin les volumes locatifs de l’INSEE, les entreprises immobilières (quelques départements par passage, chaque source revue au plus une fois par mois) et le réseau d’artisans vérifiés. {derniereRonde === undefined ? 'La date de la dernière ronde est momentanément illisible.' : derniereRonde ? `Dernière ronde enregistrée le ${date(derniereRonde)}.` : 'Aucune ronde récente n’est enregistrée.'}</p><p className="mt-2"><Link href="/admin/sante" className="lien-discret text-[12.5px]">Voir la ronde dans Santé du service →</Link></p></> : <p className="mt-3 text-sm leading-6">{echec ? 'La lecture du portefeuille doit être rétablie avant de choisir.' : decision.raison}</p>}
        {prochain && <><div className="mt-4 flex flex-wrap gap-2"><span className="puce puce-encre">Indice {prochain.score}/100</span><span className="puce puce-prep">{prochain.couverture} % des indicateurs renseignés</span><span className="puce puce-grise">{prochain.region}</span></div>{prochain.manquants.length > 0 && <p className="mt-3 text-sm text-warning-soft-foreground">À compléter : {prochain.manquants.map(c => LIBELLES_MARCHE[c]).join(', ')}.</p>}{prochain.perimees.length > 0 && <p className="mt-2 text-sm text-warning-soft-foreground">À actualiser avant réutilisation : {prochain.perimees.map(c => LIBELLES_MARCHE[c]).join(', ')}.</p>}</>}
        <div className={`mt-5 rounded-xl border p-4 ${porte.ouverte ? 'border-[var(--success)]/30 bg-[var(--success-soft)]' : 'border-[var(--warning)]/40 bg-[var(--warning-soft)]'}`}><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" />{porte.ouverte ? 'Qualité de service compatible avec un essai' : 'Stabiliser le service avant d’élargir'}</p>{!porte.ouverte && <p className="mt-2 text-sm">Certains contrôles de fonctionnement demandent une vérification. <Link className="underline" href="/admin/sante">Voir la santé de Gerimmo</Link>.</p>}<p className="mt-2 text-sm">Cette recommandation ne lance aucune campagne. Toute publicité payante doit avoir un public, une durée et un budget validés.</p></div>
      </div>
      {/* Sans priorité, la colonne ne prétend pas dire « qui » recruter
          (24/09) : elle dit quoi faire en attendant. */}
      <div><p className="libelle-champ">{priorite ? 'Qui recruter d’abord' : 'En attendant'}</p><h2 className="mt-2 font-heading text-2xl text-[var(--bleu)]">{priorite?.titre ?? 'Documenter le marché'}</h2><p className="mt-3 text-sm leading-6">{priorite?.raison ?? 'Le choix d’un public attend les volumes locatifs et les entreprises immobilières. Valider les inscriptions d’artisans complète déjà le réseau vérifié.'}</p>{priorite && <ol className="mt-4 space-y-3">{priorite.etapes.map((e,i) => <li key={e} className="flex gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--marque-clair)] font-semibold text-[var(--marque-sombre)]">{i+1}</span><span>{e}</span></li>)}</ol>}<div className="mt-5 flex flex-wrap gap-3"><Link href="/admin/artisans" className="btn-or inline-flex items-center gap-2 text-sm"><Users className="size-4" /> Voir les artisans</Link>{priorite && <Link href="/admin/marketing" className="btn-lien inline-flex items-center gap-2 text-sm">Préparer le marketing <ArrowRight className="size-4" /></Link>}</div></div>
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

    {/* Dix rangs identiques n'apprenaient rien (24/09) : tant qu'aucun
        candidat n'a de donnée, une phrase et les noms suffisent. Sur
        téléphone, chaque département devient une carte : la colonne « À
        compléter » sortait de l'écran. */}
    {!echec && <section className="section-ecran"><div className="entete-carte"><h2>Départements à comparer</h2><span className="mono-discret">10 premières priorités</span></div>{toutACompleter ? <><p className="mt-3 text-sm text-[var(--texte-secondaire)]">Aucune donnée de marché pour l’instant : le classement apparaîtra après la première ronde. Candidats suivis :</p><ul className="mt-3 flex flex-wrap gap-2">{candidats.slice(0,10).map(c => <li key={c.code} className="puce puce-grise">{c.nom} ({c.code})</li>)}</ul></> : <><ul className="mt-3 divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] sm:hidden">{candidats.slice(0,10).map(c => <li key={c.code} className="p-3.5 text-sm"><p className="font-semibold">{c.nom} ({c.code}) <span className="font-normal text-[var(--texte-secondaire)]">· {c.region}</span></p><p className="mt-1">Indice {c.score}/100 · {c.couverture} % renseigné · {nombre(marche.departements[c.code].artisans_disponibles)} artisans vérifiés</p><p className="mt-1 text-xs text-[var(--texte-secondaire)]">À compléter : {aCompleter(c.manquants)}</p></li>)}</ul><div className="mt-3 hidden overflow-x-auto sm:block" tabIndex={0} role="group" aria-label="Comparaison des départements"><table className="tableau w-full min-w-[42rem] text-sm"><caption className="sr-only">Priorités territoriales et données manquantes</caption><thead><tr><th>Département</th><th>Indice</th><th>Informations</th><th>Artisans vérifiés</th><th>À compléter</th></tr></thead><tbody>{candidats.slice(0,10).map(c => <tr key={c.code}><td><span className="font-semibold">{c.nom} ({c.code})</span><br /><span className="text-xs text-muted-foreground">{c.region}</span></td><td>{c.score}/100</td><td>{c.couverture} %</td><td>{nombre(marche.departements[c.code].artisans_disponibles)}</td><td className="max-w-xs text-xs text-muted-foreground">{aCompleter(c.manquants)}</td></tr>)}</tbody></table></div></>}<details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Comprendre le classement et les repères de recrutement</summary><p className="mt-2 leading-6 text-muted-foreground">Le marché locatif pèse 30 %, les entreprises immobilières 15 %, la proximité 15 %, le réseau artisanal 15 %, les communes en zone tendue 10 %, le coût par nouveau client 10 % et la concurrence directe 5 %. Un chiffre absent ou trop ancien n’ajoute aucun point. Les candidats comparables sont classés entre eux ; l’indice n’est pas une prévision de revenus.</p><p className="mt-2 leading-6 text-muted-foreground">Le repère de départ est trois artisans vérifiés, puis un essai avec des agences lorsqu’il existe au moins vingt entreprises immobilières et une pour mille locations privées vides. Sinon, l’essai vise les bailleurs. Ces règles de pilotage doivent être confrontées aux résultats locaux. Elles n’autorisent aucune dépense.</p></details></section>}

    {etudes.error&&<p className="err">Les études complémentaires sont indisponibles. Le classement affiché ne les intègre pas.</p>}<FormulaireEtude/>
    <section className="section-ecran"><h2 className="text-xl font-semibold">Du classement à un essai local</h2><p className="mt-3">Lorsque les contrôles de qualité le permettent, Gerimmo prépare une idée de recrutement pour le département conseillé et le public prioritaire. Retrouvez-la dans l’Agent marketing pour préparer son contenu, puis suivre ses résultats. Cette préparation ne déclenche aucune diffusion ni dépense.</p><Link className="btn-secondaire mt-3" href="/admin/marketing">Voir les idées et les campagnes</Link></section>
    <section className="section-ecran"><div className="entete-carte"><h2>Où Gerimmo est déjà présent</h2><span className="mono-discret">Biens localisés, quel que soit le siège de l’agence</span></div>{empreinte.lignes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{echec ? 'Présence momentanément indisponible.' : 'La présence apparaît dès qu’une organisation ou un bien possède un code postal.'}</p> : <><ul className="mt-3 divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] sm:hidden">{empreinte.lignes.map(l => <li key={l.code} className="p-3.5 text-sm"><p className="font-semibold">{l.nom} ({l.code})</p><p className="mt-1">{pluriel(l.biens, 'bien', 'biens')} · {pluriel(l.lots, 'lot', 'lots')} · {pluriel(l.bauxEnCours, 'bail en cours', 'baux en cours')}</p><p className="mt-1 text-xs text-[var(--texte-secondaire)]">{pluriel(l.agences, 'agence', 'agences')} · {pluriel(l.proprietairesDirects, 'bailleur direct', 'bailleurs directs')}</p></li>)}</ul><div className="mt-3 hidden overflow-x-auto sm:block" tabIndex={0} role="group" aria-label="Présence de Gerimmo par département"><table className="tableau w-full min-w-[38rem] text-sm"><caption className="sr-only">Portefeuille de Gerimmo par département</caption><thead><tr><th>Département</th><th>Agences</th><th>Bailleurs directs</th><th>Biens</th><th>Lots</th><th>Baux en cours</th></tr></thead><tbody>{empreinte.lignes.map(l => <tr key={l.code}><td>{l.nom} ({l.code})</td><td>{l.agences}</td><td>{l.proprietairesDirects}</td><td>{l.biens}</td><td>{l.lots}</td><td>{l.bauxEnCours}</td></tr>)}</tbody></table></div></>}</section>
  </main>;
}
