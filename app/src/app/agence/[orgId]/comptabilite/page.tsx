import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate, moisEnFrancais } from "@/lib/ged";
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

const eur = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;

export default async function PageComptabilite(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

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
  const moisCourant = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 7);
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
    return { id: m.id, mandant_nom: p ? `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}` : "—" };
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-semibold">Comptabilité</h1>
        <p className="text-sm text-muted-foreground">
          Le journal des encaissements et des dépenses de l&apos;agence. Une
          écriture ne se modifie pas : on l&apos;annule par une écriture inverse,
          qui reste visible. Chaque mois se clôture une fois pour toutes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solde</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Recettes <span className="font-medium">{eur(recettes)}</span> · Dépenses{" "}
          <span className="font-medium">{eur(depenses)}</span> · Net{" "}
          <span className="font-semibold">{eur(recettes - depenses)}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saisir une écriture</CardTitle>
          <CardDescription>
            Deux dates : celle de la pièce justificative, et le mois sur lequel
            l&apos;écriture compte. Les honoraires, eux, se créent tout seuls à
            chaque encaissement de loyer.
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Journal</CardTitle>
            {/* Deux portées : l'année en cours, celle que l'agent demande neuf
                fois sur dix, et la totalité pour l'expert-comptable. */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <a
                href={`/agence/${orgId}/comptabilite/export?du=${anneeCourante}-01-01&au=${anneeCourante}-12-31`}
                className="underline-offset-2 hover:underline"
              >
                Exporter {anneeCourante}
              </a>
              <a
                href={`/agence/${orgId}/comptabilite/export`}
                className="underline-offset-2 hover:underline"
              >
                Tout exporter
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune écriture pour l&apos;instant. Les honoraires se créent tout seuls à chaque encaissement de loyer ; saisissez ci-dessus une dépense ou une recette.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lignes.map((e) => {
                const clot = moisClotures.has(e.date_imputation.slice(0, 7));
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span
                      className={`w-24 shrink-0 text-right font-medium ${e.sens === "recette" ? "text-success-soft-foreground" : "text-destructive"}`}
                    >
                      {e.sens === "recette" ? "+" : "−"}
                      {eur(e.montant)}
                    </span>
                    <span className="w-28 shrink-0 truncate">{e.categorie}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {/* Sans libellé, la ligne commençait par un point médian orphelin. */}
                      {e.libelle ? `${e.libelle} · ` : ""}
                      pièce {formaterDate(e.date_piece)}
                      {e.systeme ? " · créée automatiquement" : ""}
                    </span>
                    {!e.contre_ecriture_de && !clot && (
                      <BoutonContre orgId={orgId} ecritureId={e.id} />
                    )}
                    {e.contre_ecriture_de && (
                      <span className="shrink-0 text-xs text-muted-foreground">contre-écriture</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
