import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FormulaireEcriture,
  FormulaireVentilation,
  FormulaireCloture,
  BoutonContre,
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

  const [{ data: ecritures }, { data: clotures }, { data: biens }] = await Promise.all([
    supabase
      .from("ecritures")
      .select("id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme, contre_ecriture_de")
      .eq("organization_id", orgId)
      .order("date_imputation", { ascending: false })
      .limit(200),
    supabase.from("clotures_comptables").select("mois").eq("organization_id", orgId).order("mois", { ascending: false }),
    supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("nom"),
  ]);

  const lignes = (ecritures ?? []) as Ecriture[];
  const recettes = lignes.filter((e) => e.sens === "recette").reduce((s, e) => s + Number(e.montant), 0);
  const depenses = lignes.filter((e) => e.sens === "depense").reduce((s, e) => s + Number(e.montant), 0);
  const moisClotures = new Set(((clotures ?? []) as { mois: string }[]).map((c) => c.mois.slice(0, 7)));
  const moisCourant = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 7);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Comptabilité</h1>
        <p className="text-sm text-muted-foreground">
          Journal de gestion (caisse) : écritures immuables, correction par
          contre-écriture, clôture mensuelle. Gerimmo n&apos;est pas un logiciel de
          comptabilité de gérance.
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
            Deux dates : pièce (date réelle) et imputation (mois comptable). Les
            honoraires sont générés automatiquement à l&apos;encaissement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormulaireEcriture orgId={orgId} />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">
              Dépense au niveau du bien (ventilée par lot via la clé)
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
                Mois clôturés : {[...moisClotures].join(", ")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal</CardTitle>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune écriture.</p>
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
                      {e.libelle} · pièce {formaterDate(e.date_piece)}
                      {e.systeme ? " · auto" : ""}
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
