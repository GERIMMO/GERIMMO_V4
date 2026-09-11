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
  // Une année hors de portée (« ?annee=abc », « ?annee=99999 ») partait telle
  // quelle dans les bornes de la requête : la lecture échouait, et l'écran
  // affichait l'année courante sans le dire. On retient l'année demandée quand
  // elle est plausible, l'année courante sinon — et le sélecteur ci-dessous
  // montre TOUJOURS celle qui est affichée.
  const demandee = Number(anneeDemandee);
  const annee =
    Number.isInteger(demandee) && demandee >= 1970 && demandee <= anneeCourante + 1
      ? demandee
      : anneeCourante;
  const anneesProposees = [
    ...new Set([anneeCourante - 2, anneeCourante - 1, anneeCourante, annee]),
  ].sort((a, b) => a - b);

  const [
    { data: ecritures, error: erreurEcritures },
    { data: detentions, error: erreurDetentions },
    { data: lotsMeublesRows, error: erreurMeubles },
    { data: baux, error: erreurBaux },
  ] = await Promise.all([
    supabase
      .from("ecritures")
      .select("categorie, sens, montant, date_piece, contre_ecriture_de, lot_id, bail_id")
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
    // Clé de ventilation 211/212 : l'écriture d'encaissement porte le total
    // (loyer + provision) — la part charges se reconstitue au prorata du bail
    supabase
      .from("baux")
      .select("id, loyer_hc, charges")
      .eq("organization_id", orgId),
  ]);

  // Aucune de ces quatre lectures n'est décorative : sans les détentions, la
  // quote-part d'indivision retombe à 100 % ; sans les lots meublés, des
  // revenus BIC se rangent en revenus fonciers ; sans les baux, la ventilation
  // 211/212 disparaît. Un échec silencieux produirait donc des MONTANTS FAUX
  // sur une aide à la déclaration. On refuse de chiffrer plutôt que de mentir.
  const lecturesEnEchec = [
    erreurEcritures && "les écritures de l’année",
    erreurDetentions && "vos quotes-parts de détention",
    erreurMeubles && "la liste des lots meublés",
    erreurBaux && "la clé de ventilation loyer / charges des baux",
  ].filter((x): x is string => Boolean(x));

  const navigation = (
    <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
      {/* py-2 mobile : cible tactile ≈ 36 px sur ces liens de navigation */}
      {anneesProposees.map((a) => (
        <Link
          key={a}
          href={`/agence/${orgId}/comptabilite/fiscal?annee=${a}`}
          className={`py-2 sm:py-0 ${a === annee ? "font-medium underline underline-offset-4" : "lien-discret"}`}
          aria-current={a === annee ? "page" : undefined}
        >
          {a}
        </Link>
      ))}
      <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret ml-auto py-2 sm:py-0">
        ← Retour au livre
      </Link>
    </p>
  );

  if (lecturesEnEchec.length > 0) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-[1.125rem] p-4 sm:p-7">
        <div>
          <div className="entete-page mb-6">
            <h1>Récapitulatif fiscal {annee}</h1>
          </div>
          {navigation}
        </div>
        <div className="err" role="alert">
          <p className="font-medium">
            Aucun montant n’est affiché : {lecturesEnEchec.join(", ")} n’
            {lecturesEnEchec.length > 1 ? "ont" : "a"} pas pu être lu
            {lecturesEnEchec.length > 1 ? "es" : "e"}.
          </p>
          <p className="mt-1">
            Ce n’est pas une année sans recettes ni charges : c’est la lecture
            qui a échoué. Un récapitulatif calculé sur une lecture incomplète
            donnerait des montants faux — à recopier sur une déclaration. Nous
            préférons ne rien avancer : rechargez la page dans un instant.
          </p>
        </div>
      </main>
    );
  }

  const quoteParts = new Map(
    ((detentions ?? []) as { lot_id: string; quote_part: number }[]).map((d) => [
      d.lot_id,
      Number(d.quote_part),
    ])
  );
  const lotsMeubles = (lotsMeublesRows ?? []) as { id: string; nom: string }[];
  const ventilationLoyers = new Map(
    ((baux ?? []) as { id: string; loyer_hc: number | null; charges: number | null }[]).map(
      (b) => [b.id, { loyerHc: Number(b.loyer_hc) || 0, charges: Number(b.charges) || 0 }]
    )
  );
  const recap = recapitulatifFiscal((ecritures ?? []) as EcritureFiscale[], annee, {
    quoteParts,
    lotsMeubles: new Set(lotsMeubles.map((l) => l.id)),
    ventilationLoyers,
  });
  const recettes = recap.rubriques.filter((r) => r.sens === "recette");
  const charges = recap.rubriques.filter((r) => r.sens === "depense");

  return (
    <main className="mx-auto w-full max-w-4xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <div className="entete-page mb-6">
          <h1>Récapitulatif fiscal {annee}</h1>
          {/* nbEcritures ne compte QUE les écritures rangées dans la 2044 :
              celles des lots meublés sont totalisées à part (BIC). Annoncer
              « n écritures » tout court laissait croire à l'année entière. */}
          <span className="mono-discret">
            {recap.nbEcritures} écriture{recap.nbEcritures > 1 ? "s" : ""} retenue
            {recap.nbEcritures > 1 ? "s" : ""} · date de pièce
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Vos recettes et charges de l&apos;année, rangées selon les rubriques
          de la déclaration 2044 (revenus fonciers, location nue). C&apos;est une
          aide pour recopier, pas une déclaration : vérifiez chaque montant et
          complétez ce que le livre ne suit pas.
        </p>
        {navigation}
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi bleu">
          <span className="eyebrow">Recettes brutes</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : `pièces datées de ${annee}`}
          </span>
        </div>
        <div className="kpi or">
          <span className="eyebrow">Charges déductibles</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.totalChargesQuotePart : recap.totalCharges)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : `pièces datées de ${annee}`}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Revenu foncier net</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.revenuNetQuotePart : recap.revenuNet)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : "recettes moins charges"}
          </span>
        </div>
      </div>

      {/* Indivision : les montants se déclarent à la quote-part de détention
          (les tantièmes de copropriété restent informatifs, jamais une clé) */}
      {recap.ventile && (
        <p className="border-l-[3px] border-l-[var(--or)] bg-[var(--or-clair)] p-3 text-sm">
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
            <CardTitle>
              Lot{lotsMeubles.length > 1 ? "s" : ""} meublé{lotsMeubles.length > 1 ? "s" : ""} — hors
              récapitulatif (BIC)
            </CardTitle>
            <CardDescription>
              {lotsMeubles.map((l) => l.nom).join(", ")} : les revenus d&apos;une
              location meublée relèvent des BIC, pas des revenus fonciers — ils
              ne figurent donc pas ci-dessus. Cette année :{" "}
              <span className="montant">{eur(recap.meuble.recettes)}</span> de recettes et{" "}
              <span className="montant">{eur(recap.meuble.depenses)}</span> de
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
        description="Lignes 211 à 212 de la 2044. Chaque encaissement de loyer est ventilé au prorata du bail : la ligne 212 est la part des encaissements correspondant aux provisions de charges du bail, la ligne 211 le reste (loyers hors charges) — leur somme égale le total encaissé."
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
            <CardTitle>Fonds travaux ALUR — à part</CardTitle>
            <CardDescription>
              <span className="montant">{eur(recap.fondsTravauxAlur)}</span> versés cette année. Ils
              se déduisent l&apos;année où les travaux sont réalisés, pas celle du
              versement : ils ne sont pas comptés dans les charges ci-dessus.
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
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Sous sm, chaque rubrique devient une carte empilée : le montant à
            recopier sur la 2044 se lit sans défilement horizontal. */}
        <ul className="space-y-3 sm:hidden">
          {rubriques.map((r) => (
            <li
              key={r.code + r.libelle}
              className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <p className="text-sm">
                <span className="mono-discret mr-2">{r.code}</span>
                {r.libelle}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.aCompleter ? "à compléter par vos soins" : r.categories.join(", ") || "—"}
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                <span className={ventile ? "" : "font-medium"}>
                  {ventile ? "Total" : "Montant"} :{" "}
                  <span className="montant">{r.aCompleter ? "…" : eur(r.montant)}</span>
                </span>
                {ventile && (
                  <span className="font-medium">
                    Votre quote-part :{" "}
                    <span className="montant">{r.aCompleter ? "…" : eur(r.montantQuotePart)}</span>
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
        <div className="tableau-defilant hidden sm:block">
          <table className="tableau">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Rubrique</th>
                <th>Catégories du livre</th>
                <th className="nombre">{ventile ? "Total" : "Montant"}</th>
                {ventile && <th className="nombre">Votre quote-part</th>}
              </tr>
            </thead>
            <tbody>
              {rubriques.map((r) => (
                <tr key={r.code + r.libelle}>
                  <td className="mono-discret">{r.code}</td>
                  <td>{r.libelle}</td>
                  <td className="text-xs text-muted-foreground">
                    {r.aCompleter ? "à compléter par vos soins" : r.categories.join(", ") || "—"}
                  </td>
                  <td className="nombre montant">{r.aCompleter ? "…" : eur(r.montant)}</td>
                  {ventile && (
                    <td className="nombre montant font-medium">
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
