import { createClient } from "@/lib/supabase/server";
import {
  empreinteParDepartement,
  empreinteParRegion,
  type LigneBail,
  type LigneBien,
  type LigneLot,
  type LigneOrganisation,
} from "@/lib/territoire";

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

  const [orgs, biens, lots, baux] = await Promise.all([
    supabase.from("organizations").select("id, type, status, postal_code, created_at"),
    supabase.from("biens").select("id, organization_id, postal_code"),
    supabase.from("lots").select("id, bien_id, etat"),
    supabase.from("baux").select("id, lot_id, etat"),
  ]);
  const enEchec = [orgs.error, biens.error, lots.error, baux.error].filter(Boolean);

  const empreinte = empreinteParDepartement({
    organisations: (orgs.data ?? []) as LigneOrganisation[],
    biens: (biens.data ?? []) as LigneBien[],
    lots: (lots.data ?? []) as LigneLot[],
    baux: (baux.data ?? []) as LigneBail[],
  });
  const regions = empreinteParRegion(empreinte.lignes);
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

      <p className="mesure-lecture mt-6 text-xs text-muted-foreground">
        Brique suivante : le marché en face de l&apos;empreinte — logements loués
        (INSEE), agences en activité (SIRENE), zones tendues — pour noter les
        départements candidats et ouvrir le suivant. Rien de tout cela n&apos;est
        estimé : une donnée absente vaudra zéro, et se dira.
      </p>
    </main>
  );
}
