import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, aujourdhuiParis } from "@/lib/ged";
import { recapitulatifFiscal, type EcritureFiscale } from "@/lib/fiscal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Récapitulatif fiscal — Gerimmo" };

// Aide à la déclaration des revenus fonciers (2044) — réservée au propriétaire
// direct, seul persona qui en bénéficie (décision du 2026-07-22). Rubriques à
// recopier : ni télédéclaration, ni calcul d'impôt, ni conseil (RM-6.4.7).
export default async function PageRecapitulatifFiscal(props: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ annee?: string }>;
}) {
  const { orgId } = await props.params;
  const { annee: anneeDemandee } = await props.searchParams;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const anneeCourante = Number(aujourdhuiParis().slice(0, 4));
  const annee = Number(anneeDemandee) || anneeCourante;

  const { data: ecritures } = await supabase
    .from("ecritures")
    .select("categorie, sens, montant, date_piece, contre_ecriture_de")
    .eq("organization_id", orgId)
    .gte("date_piece", `${annee}-01-01`)
    .lte("date_piece", `${annee}-12-31`);

  const recap = recapitulatifFiscal((ecritures ?? []) as EcritureFiscale[], annee);
  const recettes = recap.rubriques.filter((r) => r.sens === "recette");
  const charges = recap.rubriques.filter((r) => r.sens === "depense");

  return (
    <main className="mx-auto w-full max-w-4xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-6">
          <h1>Récapitulatif fiscal {annee}</h1>
          <span className="mono-discret">
            {recap.nbEcritures} écriture{recap.nbEcritures > 1 ? "s" : ""} · date de pièce
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Vos recettes et charges de l&apos;année, rangées selon les rubriques
          de la déclaration 2044 (revenus fonciers, location nue). C&apos;est une
          aide pour recopier, pas une déclaration : vérifiez chaque montant et
          complétez ce que le livre ne suit pas.
        </p>
        <p className="mt-2 flex flex-wrap gap-3 text-sm">
          {[anneeCourante - 2, anneeCourante - 1, anneeCourante].map((a) => (
            <Link
              key={a}
              href={`/agence/${orgId}/comptabilite/fiscal?annee=${a}`}
              className={a === annee ? "font-medium underline underline-offset-4" : "lien-discret"}
            >
              {a}
            </Link>
          ))}
          <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret ml-auto">
            ← Retour au livre
          </Link>
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi bleu">
          <span className="eyebrow">Recettes brutes</span>
          <span className="chiffre mt-1 block">{eur(recap.totalRecettes)}</span>
        </div>
        <div className="kpi or">
          <span className="eyebrow">Charges déductibles</span>
          <span className="chiffre mt-1 block">{eur(recap.totalCharges)}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Revenu foncier net</span>
          <span className="chiffre mt-1 block">{eur(recap.revenuNet)}</span>
        </div>
      </div>

      <TableauRubriques titre="Recettes" description="Lignes 211 à 212 de la 2044." rubriques={recettes} />
      <TableauRubriques
        titre="Charges déductibles"
        description="Lignes 221 à 250. Seule la part non récupérable des charges de copropriété est déductible ; les intérêts d'emprunt ne sont pas suivis par Gerimmo."
        rubriques={charges}
      />

      {recap.fondsTravauxAlur > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fonds travaux ALUR — à part</CardTitle>
            <CardDescription>
              {eur(recap.fondsTravauxAlur)} versés cette année. Ils se déduisent
              l&apos;année où les travaux sont réalisés, pas celle du versement :
              ils ne sont pas comptés dans les charges ci-dessus.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Régime micro-foncier : si vos recettes brutes n&apos;excèdent pas
        15 000 €, seule la ligne des recettes vous sert (abattement automatique
        de 30 %). Le meublé et la SCI relèvent d&apos;autres imprimés, prévus en V2.
      </p>
    </main>
  );
}

function TableauRubriques({
  titre,
  description,
  rubriques,
}: {
  titre: string;
  description: string;
  rubriques: ReturnType<typeof recapitulatifFiscal>["rubriques"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="libelle-champ py-2 pr-3 font-normal">Ligne</th>
              <th className="libelle-champ py-2 pr-3 font-normal">Rubrique</th>
              <th className="libelle-champ py-2 pr-3 font-normal">Catégories du livre</th>
              <th className="libelle-champ py-2 text-right font-normal">Montant</th>
            </tr>
          </thead>
          <tbody>
            {rubriques.map((r) => (
              <tr key={r.code + r.libelle} className="border-b border-border last:border-0">
                <td className="mono-discret py-2 pr-3">{r.code}</td>
                <td className="py-2 pr-3">{r.libelle}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {r.aCompleter ? "à compléter par vos soins" : r.categories.join(", ") || "—"}
                </td>
                <td className="py-2 text-right font-medium whitespace-nowrap">
                  {r.aCompleter ? "…" : eur(r.montant)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
