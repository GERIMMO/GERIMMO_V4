import { createClient } from "@/lib/supabase/server";
import voisinsFichier from "@/data/departements-voisins.json";
import marcheFichier from "@/data/territoires-marche.json";
import { evaluerPorte } from "@/lib/porte-sante";
import { decider, noterCandidats, type Marche, type Voisinage } from "@/lib/score-territoire";
import { depuisHeures, dernieresTaches, type PasseConsignee } from "@/lib/tache";
import {
  empreinteParDepartement,
  empreinteParRegion,
  type LigneBail,
  type LigneBien,
  type LigneLot,
  type LigneOrganisation,
} from "@/lib/territoire";

const LIBELLES_MANQUANTS: Record<string, string> = {
  logements_loues_prive: "logements loués",
  agences: "agences",
  communes_zone_tendue: "zone tendue",
};

export const metadata = { title: "Territoire — Gerimmo" };

/**
 * Où Gerimmo est, département par département.
 *
 * PREMIÈRE BRIQUE DE L'EXPANSION TERRITORIALE (wiki, 19/09) : avant de choisir
 * où aller, savoir où l'on est. Tout ici se calcule sur les codes postaux déjà
 * saisis — aucune migration. La brique suivante posera le marché (INSEE,
 * SIRENE, zones tendues) en face de cette empreinte pour noter les
 * départements candidats.
 *
 * Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de
 * fond. Chaque lecture garde son `error` : un tableau qui affiche zéro parce
 * qu'une requête a échoué ferait croire à un territoire vide.
 */
export default async function PageTerritoire() {
  const supabase = await createClient();

  const depuis24h = depuisHeures(24);
  const [orgs, biens, lots, baux, passes, erreurs, bugs] = await Promise.all([
    supabase.from("organizations").select("id, type, status, postal_code, created_at"),
    supabase.from("biens").select("id, organization_id, postal_code"),
    supabase.from("lots").select("id, bien_id, etat"),
    supabase.from("baux").select("id, lot_id, etat"),
    // La porte de santé, avec les mêmes signaux que la ronde mensuelle
    // (/api/cron/territoire) : l'écran et la passe ne doivent jamais se
    // contredire. Le super admin lit tech_log et les signalements par la RLS.
    supabase
      .from("tech_log")
      .select("evenement, details, created_at")
      .like("evenement", "tache_%")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tech_log")
      .select("id", { count: "exact", head: true })
      .eq("evenement", "erreur_ecran")
      .gte("created_at", depuis24h),
    supabase
      .from("retours_utilisateurs")
      .select("id", { count: "exact", head: true })
      .eq("nature", "bug")
      .eq("gravite", "N1")
      .in("etat", ["nouveau", "en_examen", "en_cours"]),
  ]);
  const enEchec = [orgs.error, biens.error, lots.error, baux.error].filter(Boolean);
  const porte = evaluerPorte({
    passes: dernieresTaches((passes.data ?? []) as PasseConsignee[]),
    erreursEcran24h: erreurs.error ? null : (erreurs.count ?? 0),
    bugsBloquantsOuverts: bugs.error ? null : (bugs.count ?? 0),
  });

  const empreinte = empreinteParDepartement({
    organisations: (orgs.data ?? []) as LigneOrganisation[],
    biens: (biens.data ?? []) as LigneBien[],
    lots: (lots.data ?? []) as LigneLot[],
    baux: (baux.data ?? []) as LigneBail[],
  });
  const regions = empreinteParRegion(empreinte.lignes);
  // Brique 2 : le marché en face de l'empreinte, et la décision. Les données de
  // marché sont un fichier versionné (src/data), rempli par script quand le
  // réseau le permet ; tant qu'elles manquent, le score le dit ligne par ligne.
  const marche = marcheFichier as Marche;
  const voisinage = voisinsFichier.voisins as Voisinage;
  const candidats = noterCandidats({ empreinte: empreinte.lignes, marche, voisinage });
  const decision = decider(empreinte.lignes, candidats);
  const sourcesManquantes = marche.sources.filter((s) => !s.recupere_le);
  const organisationsPlacees = empreinte.lignes.reduce(
    (n, l) => n + l.agences + l.proprietairesDirects,
    0
  );
  const bauxEnCours = empreinte.lignes.reduce((n, l) => n + l.bauxEnCours, 0);
  const nonPlaces = empreinte.sansCodePostal.organisations + empreinte.sansCodePostal.biens;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Territoire</h1>
        <span className="mono-discret">
          {enEchec.length > 0
            ? "empreinte incomplète"
            : `${empreinte.lignes.length} département${empreinte.lignes.length > 1 ? "s" : ""} · ${regions.length} région${regions.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {enEchec.length > 0 && (
        <div
          role="alert"
          className="mb-6 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
        >
          {enEchec.length} lecture{enEchec.length > 1 ? "s" : ""} de cette page
          {enEchec.length > 1 ? " ont" : " a"} échoué : l&apos;empreinte ci-dessous est
          incomplète. Rechargez — si elle ne revient pas, c&apos;est la base qui ne
          répond pas.
        </div>
      )}

      <p className="mesure-lecture mb-5 text-sm text-muted-foreground">
        Où la plateforme est aujourd&apos;hui, d&apos;après les codes postaux déjà
        saisis. Les organisations se comptent là où elles sont domiciliées ; les
        biens, les lots et les baux là où ils sont — une agence d&apos;Évry qui gère
        un immeuble à Antony est présente dans les deux départements.
      </p>

      <section className="section-ecran">
        <div className="grille-kpi">
          <div className="kpi bleu">
            <span className="eyebrow">Départements</span>
            <span className="chiffre block">{enEchec.length > 0 ? "—" : empreinte.lignes.length}</span>
            <span className="block text-xs text-muted-foreground">où quelque chose existe</span>
          </div>
          <div className="kpi">
            <span className="eyebrow">Régions</span>
            <span className="chiffre block">{enEchec.length > 0 ? "—" : regions.length}</span>
            <span className="block text-xs text-muted-foreground">l&apos;échelle du prochain saut</span>
          </div>
          <div className="kpi vert">
            <span className="eyebrow">Organisations placées</span>
            <span className="chiffre block">{orgs.error ? "—" : organisationsPlacees}</span>
            <span className="block text-xs text-muted-foreground">agences et propriétaires directs</span>
          </div>
          <div className="kpi vert">
            <span className="eyebrow">Baux en cours</span>
            <span className="chiffre block">{baux.error ? "—" : bauxEnCours}</span>
            <span className="block text-xs text-muted-foreground">l&apos;activité réelle</span>
          </div>
        </div>
        {/* Ce qui n'a pas pu être placé se dit ; un chiffre tu ferait croire
            que le territoire est plus petit qu'il n'est. */}
        {(nonPlaces > 0 || empreinte.horsReferentiel > 0) && (
          <p className="mt-3 text-[13px] text-warning-soft-foreground">
            Non placé :{" "}
            {empreinte.sansCodePostal.organisations > 0 &&
              `${empreinte.sansCodePostal.organisations} organisation${empreinte.sansCodePostal.organisations > 1 ? "s" : ""} sans code postal`}
            {empreinte.sansCodePostal.organisations > 0 && empreinte.sansCodePostal.biens > 0 && ", "}
            {empreinte.sansCodePostal.biens > 0 &&
              `${empreinte.sansCodePostal.biens} bien${empreinte.sansCodePostal.biens > 1 ? "s" : ""} sans code postal`}
            {nonPlaces > 0 && empreinte.horsReferentiel > 0 && ", "}
            {empreinte.horsReferentiel > 0 &&
              `${empreinte.horsReferentiel} hors des 101 départements`}
            .
          </p>
        )}
      </section>

      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">
            Par département
          </h2>
          <span className="mono-discret">du plus actif au moins actif</span>
        </div>
        {empreinte.lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {enEchec.length > 0
              ? "Empreinte indisponible."
              : "Aucune organisation ni aucun bien placé : le territoire commence avec le premier code postal saisi."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tableau w-full min-w-[46rem] text-sm">
              <caption className="sr-only">Empreinte de la plateforme par département</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left">Département</th>
                  <th scope="col" className="text-left">Région</th>
                  <th scope="col" className="text-right">Agences</th>
                  <th scope="col" className="text-right">Prop. directs</th>
                  <th scope="col" className="text-right">En essai</th>
                  <th scope="col" className="text-right">Inscrits ce mois</th>
                  <th scope="col" className="text-right">Biens</th>
                  <th scope="col" className="text-right">Lots</th>
                  <th scope="col" className="text-right">Baux en cours</th>
                </tr>
              </thead>
              <tbody>
                {empreinte.lignes.map((l) => (
                  <tr key={l.code} className="border-t border-[var(--filet)]">
                    <td className="py-2 pr-3">
                      <span className="mono-discret mr-2">{l.code}</span>
                      <span className="font-medium text-[var(--encre)]">{l.nom}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{l.region}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.agences}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.proprietairesDirects}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.enEssai}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {l.inscriptionsDuMois > 0 ? (
                        <span className="puce puce-loue">+{l.inscriptionsDuMois}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.biens}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.lots}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-[var(--encre)]">
                      {l.bauxEnCours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {regions.length > 0 && (
        <section className="section-ecran">
          <div className="entete-carte mb-3">
            <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">
              Par région
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="tableau w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Empreinte de la plateforme par région</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left">Région</th>
                  <th scope="col" className="text-right">Départements</th>
                  <th scope="col" className="text-right">Organisations</th>
                  <th scope="col" className="text-right">Biens</th>
                  <th scope="col" className="text-right">Lots</th>
                  <th scope="col" className="text-right">Baux en cours</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.region} className="border-t border-[var(--filet)]">
                    <td className="py-2 pr-3 font-medium text-[var(--encre)]">{r.region}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.departements}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.organisations}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.biens}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.lots}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-[var(--encre)]">
                      {r.bauxEnCours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* OÙ ALLER ENSUITE. La décision d'abord, en une phrase ; puis les dix
          meilleurs candidats avec leurs composantes — et, pour chacun, ce que
          le marché ne dit pas encore. Un score sans ses manques serait un
          chiffre qui ment. */}
      {!enEchec.length && (
        <section className="section-ecran">
          <div className="entete-carte mb-3">
            <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">
              Où aller ensuite
            </h2>
            <span className="mono-discret">{candidats.length} candidats</span>
          </div>

          {/* LA PORTE AVANT LA DESTINATION. On n'ouvre pas un département quand
              le produit va mal là où il est : la porte dit si l'on peut, et
              sinon pourquoi — chaque motif est un signal des capteurs. */}
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              porte.ouverte
                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-soft-foreground)]"
                : "border-[var(--destructive)] bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]"
            }`}
          >
            <span className="font-semibold">
              {porte.ouverte ? "Porte de santé ouverte" : "Porte de santé fermée"}
            </span>
            {porte.ouverte ? (
              <span> — les tâches passent, peu d&apos;erreurs, aucun bug bloquant : une ouverture est possible.</span>
            ) : (
              <ul className="mt-1 list-disc pl-5">
                {porte.motifs.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>

          {decision.prochain ? (
            <div
              className={`rounded-xl border p-4 ${
                decision.changementDeRegion
                  ? "border-[var(--warning)] bg-[var(--warning-soft)]"
                  : "border-[var(--or-filet)] bg-[var(--marque-clair)]"
              }`}
            >
              <span className="eyebrow">
                {decision.changementDeRegion ? "Changement de région" : "Prochain département"}
              </span>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-heading text-xl font-semibold text-[var(--encre)]">
                  {decision.prochain.nom}
                  <span className="mono-discret ml-2">{decision.prochain.code}</span>
                </span>
                <span className="text-sm text-muted-foreground">{decision.prochain.region}</span>
                <span className="puce puce-encre">score {decision.prochain.score}</span>
              </div>
              <p className="mt-2 text-sm">{decision.raison}</p>
              {decision.prochain.manquants.length > 0 && (
                <p className="mt-1 text-[13px] text-warning-soft-foreground">
                  Noté sans :{" "}
                  {decision.prochain.manquants.map((m) => LIBELLES_MANQUANTS[m] ?? m).join(", ")} —
                  comptés zéro.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{decision.raison}</p>
          )}

          {sourcesManquantes.length > 0 && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Le marché n&apos;est pas encore renseigné pour :{" "}
              {sourcesManquantes.map((s) => s.libelle.toLowerCase()).join(" · ")}. Tant
              qu&apos;il manque, seule la proximité départage — et chaque candidat le
              dit. Script : <code>scripts/territoire/recuperer-marche.mjs</code>.
            </p>
          )}

          {candidats.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="tableau w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Les dix meilleurs départements candidats</caption>
                <thead>
                  <tr>
                    <th scope="col" className="text-left">Département</th>
                    <th scope="col" className="text-left">Région</th>
                    <th scope="col" className="text-right">Score</th>
                    <th scope="col" className="text-right">Marché</th>
                    <th scope="col" className="text-right">Agences</th>
                    <th scope="col" className="text-right">Tension</th>
                    <th scope="col" className="text-right">Proximité</th>
                    <th scope="col" className="text-left">Voisins ouverts</th>
                    <th scope="col" className="text-left">Manque</th>
                  </tr>
                </thead>
                <tbody>
                  {candidats.slice(0, 10).map((c) => (
                    <tr key={c.code} className="border-t border-[var(--filet)]">
                      <td className="py-2 pr-3">
                        <span className="mono-discret mr-2">{c.code}</span>
                        <span className="font-medium text-[var(--encre)]">{c.nom}</span>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.region}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-[var(--encre)]">
                        {c.score}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.composantes.marche}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.composantes.agences}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.composantes.tension}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.composantes.proximite}</td>
                      <td className="py-2 pr-3 text-[13px] text-muted-foreground">
                        {c.voisinsOuverts.length > 0 ? c.voisinsOuverts.join(", ") : "—"}
                      </td>
                      <td className="py-2 text-[13px] text-warning-soft-foreground">
                        {c.manquants.length > 0
                          ? c.manquants.map((m) => LIBELLES_MANQUANTS[m] ?? m).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="mesure-lecture mt-6 text-xs text-muted-foreground">
        Le score : marché (logements loués, INSEE) 40 %, agences en activité
        (SIRENE) 20 %, zone tendue 15 %, proximité (part des voisins déjà ouverts)
        25 % — chaque composante en rang de 0 à 100 parmi les candidats. On reste
        dans la région tant qu&apos;un candidat y dépasse le seuil ; sinon la
        meilleure région prend le relais, automatiquement. Rien n&apos;est estimé :
        une donnée absente vaut zéro, et se dit.
      </p>
    </main>
  );
}
