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
  const { supabase, user, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const anneeCourante = Number(aujourdhuiParis().slice(0, 4));
  const annee = Number(anneeDemandee) || anneeCourante;

  const [{ data: ecritures }, { data: detentions }, { data: lotsMeublesRows }] =
    await Promise.all([
      supabase
        .from("ecritures")
        .select("categorie, sens, montant, date_piece, contre_ecriture_de, lot_id")
        .eq("organization_id", orgId)
        .gte("date_piece", `${annee}-01-01`)
        .lte("date_piece", `${annee}-12-31`),
      // Quote-part du déclarant par lot (indivision) : ses détentions en cours
      supabase
        .from("detentions")
        .select("lot_id, quote_part, person:persons!detentions_person_id_fkey!inner(account_id)")
        .eq("organization_id", orgId)
        .eq("person.account_id", user.id)
        .is("date_fin", null),
      // Lots meublés : BIC, hors récapitulatif (décision du 04/09)
      supabase
        .from("lots")
        .select("id, nom")
        .eq("organization_id", orgId)
        .eq("meuble", true),
    ]);

  const quoteParts = new Map(
    ((detentions ?? []) as { lot_id: string; quote_part: number }[]).map((d) => [
      d.lot_id,
      Number(d.quote_part),
    ])
  );
  const lotsMeubles = (lotsMeublesRows ?? []) as { id: string; nom: string }[];
  const recap = recapitulatifFiscal((ecritures ?? []) as EcritureFiscale[], annee, {
    quoteParts,
    lotsMeubles: new Set(lotsMeubles.map((l) => l.id)),
  });
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
          <span className="chiffre mt-1 block">
            {eur(recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes)}
          </span>
          {recap.ventile && (
            <span className="block text-xs text-muted-foreground">votre quote-part</span>
          )}
        </div>
        <div className="kpi or">
          <span className="eyebrow">Charges déductibles</span>
          <span className="chiffre mt-1 block">
            {eur(recap.ventile ? recap.totalChargesQuotePart : recap.totalCharges)}
          </span>
          {recap.ventile && (
            <span className="block text-xs text-muted-foreground">votre quote-part</span>
          )}
        </div>
        <div className="kpi">
          <span className="eyebrow">Revenu foncier net</span>
          <span className="chiffre mt-1 block">
            {eur(recap.ventile ? recap.revenuNetQuotePart : recap.revenuNet)}
          </span>
          {recap.ventile && (
            <span className="block text-xs text-muted-foreground">votre quote-part</span>
          )}
        </div>
      </div>

      {/* Indivision : les montants se déclarent à la quote-part de détention
          (les tantièmes de copropriété restent informatifs, jamais une clé) */}
      {recap.ventile && (
        <p className="border-l-[3px] border-l-[var(--or)] bg-[var(--or-clair)]/40 p-3 text-sm">
          Un ou plusieurs lots sont détenus en indivision : la colonne « votre
          quote-part » applique votre pourcentage de détention à chaque
          rubrique — c&apos;est elle qui se recopie sur votre 2044, chaque
          indivisaire déclarant sa part.
        </p>
      )}

      {/* Lot(s) meublé(s) : BIC, hors récapitulatif — gestion complète maintenue */}
      {recap.meuble.nbEcritures > 0 && (
        <Card className="border-l-[3px] border-l-[var(--warning)]">
          <CardHeader>
            <CardTitle className="text-base">
              Lot{lotsMeubles.length > 1 ? "s" : ""} meublé{lotsMeubles.length > 1 ? "s" : ""} — hors
              récapitulatif (BIC)
            </CardTitle>
            <CardDescription>
              {lotsMeubles.map((l) => l.nom).join(", ")} : les revenus d&apos;une
              location meublée relèvent des BIC, pas des revenus fonciers — ils
              ne figurent donc pas ci-dessus. Cette année :{" "}
              {eur(recap.meuble.recettes)} de recettes et {eur(recap.meuble.depenses)} de
              dépenses ({recap.meuble.nbEcritures} écriture
              {recap.meuble.nbEcritures > 1 ? "s" : ""}), à reporter dans votre
              déclaration BIC. La gestion (bail, quittances, incidents, livre)
              reste complète.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <TableauRubriques
        titre="Recettes"
        description="Lignes 211 à 212 de la 2044."
        rubriques={recettes}
        ventile={recap.ventile}
      />
      <TableauRubriques
        titre="Charges déductibles"
        description="Lignes 221 à 250. Copropriété : les provisions versées au syndic se déduisent l'année de leur paiement (ligne 229) ; après le décompte annuel du syndic — seule base admise — la part récupérable et la part non déductible se réintègrent l'année suivante (ligne 230). Les intérêts d'emprunt ne sont pas suivis par Gerimmo."
        rubriques={charges}
        ventile={recap.ventile}
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
  ventile,
}: {
  titre: string;
  description: string;
  rubriques: ReturnType<typeof recapitulatifFiscal>["rubriques"];
  ventile: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="libelle-champ py-2 pr-3 font-normal">Ligne</th>
                <th className="libelle-champ py-2 pr-3 font-normal">Rubrique</th>
                <th className="libelle-champ py-2 pr-3 font-normal">Catégories du livre</th>
                <th className="libelle-champ py-2 text-right font-normal">
                  {ventile ? "Total" : "Montant"}
                </th>
                {ventile && (
                  <th className="libelle-champ py-2 pl-3 text-right font-normal">
                    Votre quote-part
                  </th>
                )}
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
                  <td className="py-2 text-right whitespace-nowrap">
                    {r.aCompleter ? "…" : eur(r.montant)}
                  </td>
                  {ventile && (
                    <td className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                      {r.aCompleter ? "…" : eur(r.montantQuotePart)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
