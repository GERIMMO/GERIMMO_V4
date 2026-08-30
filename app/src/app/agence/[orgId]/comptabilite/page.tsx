import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate, moisEnFrancais, aujourdhuiParis } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FormulaireEcriture,
  FormulaireVentilation,
  FormulaireCloture,
  BoutonContre,
  RapportsGestion,
  type MandatCompta,
  type RapportCompta,
} from "./formulaire-compta";

export const metadata = { title: "Comptabilité — Gerimmo" };

type Ecriture = {
  id: string;
  categorie: string;
  sens: string;
  montant: number;
  date_piece: string;
  date_imputation: string;
  libelle: string | null;
  systeme: boolean;
  contre_ecriture_de: string | null;
};

export default async function PageComptabilite(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);

  const [
    { data: ecritures },
    { data: clotures },
    { data: biens },
    { data: mandatsRaw },
    { data: rapports },
  ] = await Promise.all([
    supabase
      .from("ecritures")
      .select("id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme, contre_ecriture_de")
      .eq("organization_id", orgId)
      .order("date_imputation", { ascending: false })
      .limit(200),
    supabase.from("clotures_comptables").select("mois").eq("organization_id", orgId).order("mois", { ascending: false }),
    supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("nom"),
    supabase
      .from("mandats")
      .select("id, mandant:persons(nom, prenom)")
      .eq("organization_id", orgId)
      .eq("etat", "actif"),
    supabase
      .from("rapports_gestion")
      .select("id, mandat_id, mois, statut, net, versement_montant")
      .eq("organization_id", orgId)
      .order("mois", { ascending: false }),
  ]);

  const lignes = (ecritures ?? []) as Ecriture[];
  const recettes = lignes.filter((e) => e.sens === "recette").reduce((s, e) => s + Number(e.montant), 0);
  const depenses = lignes.filter((e) => e.sens === "depense").reduce((s, e) => s + Number(e.montant), 0);
  const moisClotures = new Set(((clotures ?? []) as { mois: string }[]).map((c) => c.mois.slice(0, 7)));
  const moisCourant = aujourdhuiParis().slice(0, 7);
  const anneeCourante = moisCourant.slice(0, 4);
  const mandats: MandatCompta[] = (
    (mandatsRaw ?? []) as {
      id: string;
      mandant:
        | { nom: string; prenom: string | null }
        | { nom: string; prenom: string | null }[]
        | null;
    }[]
  ).map((m) => {
    // Jointure to-one : PostgREST renvoie un objet (le typage générait un
    // tableau — le nom du mandant s'affichait « — »). On accepte les deux.
    const p = Array.isArray(m.mandant) ? m.mandant[0] : m.mandant;
    return { id: m.id, mandant_nom: p ? nomComplet(p) : "—" };
  });

  // Repère de tête : où en est la comptabilité — clôtures triées du plus récent
  const dernierCloture = [...moisClotures][0];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-6">
          <h1>{estProprietaire ? "Livre recettes-dépenses" : "Comptabilité"}</h1>
          <span className="mono-discret">
            {dernierCloture ? `${moisEnFrancais(dernierCloture)} clôturé · ` : ""}
            {moisEnFrancais(moisCourant)} ouvert
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {estProprietaire
            ? "Vos encaissements et vos dépenses, sans honoraires. Une écriture ne se modifie pas : on l'annule par une écriture inverse, qui reste visible. Clôturer un mois est recommandé, jamais imposé."
            : "Le journal des encaissements et des dépenses de l'agence. Une écriture ne se modifie pas : on l'annule par une écriture inverse, qui reste visible. Chaque mois se clôture une fois pour toutes."}
        </p>
        {/* S9a : seul le propriétaire direct bénéficie de l'aide fiscale */}
        {estProprietaire && (
          <p className="mt-2 text-sm">
            <a href={`/agence/${orgId}/comptabilite/fiscal`} className="lien-discret">
              Récapitulatif fiscal {anneeCourante} (déclaration 2044) →
            </a>
          </p>
        )}
      </div>

      {/* Solde en tuiles KPI (maquette) — même motif que le tableau de bord */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi bleu">
          <span className="eyebrow">Recettes</span>
          <span className="chiffre mt-1 block">{eur(recettes)}</span>
        </div>
        <div className="kpi or">
          <span className="eyebrow">Dépenses</span>
          <span className="chiffre mt-1 block">{eur(depenses)}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Net</span>
          <span className="chiffre mt-1 block">{eur(recettes - depenses)}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saisir une écriture</CardTitle>
          <CardDescription>
            Deux dates : celle de la pièce justificative, et le mois sur lequel
            l&apos;écriture compte.
            {estProprietaire
              ? " Les loyers encaissés s'inscrivent tout seuls."
              : " Les honoraires, eux, se créent tout seuls à chaque encaissement de loyer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormulaireEcriture orgId={orgId} />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">
              Dépense sur tout le bien, répartie entre ses lots
            </p>
            <FormulaireVentilation
              orgId={orgId}
              biens={(biens ?? []) as { id: string; nom: string }[]}
            />
          </div>
          <div className="border-t border-border pt-4">
            <FormulaireCloture orgId={orgId} moisCourant={moisCourant} />
            {moisClotures.size > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Mois déjà clôturés : {[...moisClotures].map(moisEnFrancais).join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Un rapport se rend à un mandant : le propriétaire direct n'en a pas */}
      {!estProprietaire && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapports de gestion</CardTitle>
          <CardDescription>
            Un rapport par mandant et par mois, une fois le mois clôturé. Une fois
            envoyé, il ne bouge plus ;
            versement suivi, écart alerté.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RapportsGestion
            orgId={orgId}
            mandats={mandats}
            rapports={(rapports ?? []) as RapportCompta[]}
            moisCourant={moisCourant}
          />
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Journal</CardTitle>
            {/* Deux portées : l'année en cours, celle que l'agent demande neuf
                fois sur dix, et la totalité pour l'expert-comptable. */}
            <div className="flex items-center gap-3">
              <a
                href={`/agence/${orgId}/comptabilite/export?du=${anneeCourante}-01-01&au=${anneeCourante}-12-31`}
                className="lien-discret"
              >
                Exporter {anneeCourante}
              </a>
              <a
                href={`/agence/${orgId}/comptabilite/export`}
                className="lien-discret"
              >
                Tout exporter
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <div className="vide">
              Aucune écriture pour l&apos;instant.{" "}
              {estProprietaire
                ? "Les loyers encaissés s'inscrivent tout seuls ; saisissez ci-dessus une dépense ou une recette."
                : "Les honoraires se créent tout seuls à chaque encaissement de loyer ; saisissez ci-dessus une dépense ou une recette."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="libelle-champ py-2 pr-3 font-normal">Date</th>
                    <th className="libelle-champ py-2 pr-3 font-normal">Catégorie</th>
                    <th className="libelle-champ py-2 pr-3 font-normal">Libellé</th>
                    <th className="libelle-champ py-2 text-right font-normal">Montant</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((e) => {
                    const clot = moisClotures.has(e.date_imputation.slice(0, 7));
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="mono-discret py-2 pr-3 whitespace-nowrap">
                          {formaterDate(e.date_imputation)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="puce puce-grise">{e.categorie}</span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {/* Sans libellé, la ligne commençait par un point médian orphelin. */}
                          {e.libelle ? `${e.libelle} · ` : ""}
                          pièce {formaterDate(e.date_piece)}
                          {e.systeme ? " · créée automatiquement" : ""}
                        </td>
                        <td
                          className={`py-2 text-right font-medium whitespace-nowrap ${e.sens === "recette" ? "text-success" : ""}`}
                        >
                          {e.sens === "recette" ? "+" : "−"}
                          {eur(e.montant)}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          {!e.contre_ecriture_de && !clot && (
                            <BoutonContre orgId={orgId} ecritureId={e.id} />
                          )}
                          {e.contre_ecriture_de && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">contre-écriture</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
