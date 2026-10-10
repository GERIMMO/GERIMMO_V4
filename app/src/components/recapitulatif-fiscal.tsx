import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, aujourdhuiParis } from "@/lib/ged";
import { recapitulatifFiscal, type EcritureFiscale } from "@/lib/fiscal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";



// Aide à la déclaration des revenus fonciers (2044) — réservée au propriétaire
// direct, seul persona qui en bénéficie (décision du 2026-07-22). Rubriques à
// recopier : ni télédéclaration, ni calcul d'impôt, ni conseil (RM-6.4.7).
export async function RecapitulatifFiscal(props: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ annee?: string; bien?: string }>;
  compact?: boolean;
}) {
  const { orgId } = await props.params;
  const { annee: anneeDemandee, bien } = await props.searchParams;
  const { supabase, user, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const { data: lotsDuBien, error: erreurBien } = bien
    ? await supabase.from("lots").select("id").eq("organization_id", orgId).eq("bien_id", bien)
    : { data: null, error: null };
  const perimetre = lotsDuBien ? new Set(lotsDuBien.map(l => l.id)) : null;
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
  // Les onglets commencent à l'année de la première écriture du livre (audit
  // du 27/09) : un compte ouvert en septembre 2026 se voyait proposer 2024 et
  // 2025, deux récapitulatifs vides. Trois ans au plus, l'année affichée
  // toujours comprise.
  const { data: premiere } = await supabase
    .from("ecritures")
    .select("date_piece")
    .eq("organization_id", orgId)
    .order("date_piece", { ascending: true })
    .limit(1)
    .maybeSingle();
  const anneePremiere = premiere?.date_piece ? Number(String(premiere.date_piece).slice(0, 4)) : anneeCourante;
  const anneeDebut = Math.max(anneeCourante - 2, Math.min(anneePremiere, anneeCourante));
  const anneesProposees = [
    ...new Set([
      ...Array.from({ length: anneeCourante - anneeDebut + 1 }, (_, i) => anneeDebut + i),
      annee,
    ]),
  ].sort((a, b) => a - b);

  const [
    { data: ecritures, error: erreurEcritures },
    { data: detentions, error: erreurDetentions },
    { data: lotsMeublesRows, error: erreurMeubles },
    { data: baux, error: erreurBaux },
    { data: appelsCopro, error: erreurAppels },
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
    // Audit 29/09 : appels de charges de copropriété de l'exercice, ventilés —
    // leur part récupérable sort de la ligne 229.
    supabase
      .from("appels_charges")
      .select("id, lot_id")
      .eq("organization_id", orgId)
      .eq("exercice", annee)
      .in("statut", ["ventile", "fige"]),
  ]);
  const idsAppels = ((appelsCopro ?? []) as { id: string; lot_id: string }[]).map((a) => a.id);
  const { data: postesRecuperables, error: erreurPostes } = idsAppels.length
    ? await supabase
        .from("appel_charges_postes")
        .select("appel_id, montant")
        .eq("nature", "recuperable")
        .in("appel_id", idsAppels)
    : { data: [], error: null };

  // Aucune de ces quatre lectures n'est décorative : sans les détentions, la
  // quote-part d'indivision retombe à 100 % ; sans les lots meublés, des
  // revenus BIC se rangent en revenus fonciers ; sans les baux, la ventilation
  // 211/212 disparaît. Un échec silencieux produirait donc des MONTANTS FAUX
  // sur une aide à la déclaration. On refuse de chiffrer plutôt que de mentir.
  const lecturesEnEchec = [
    erreurBien && "les lots du bien",
    erreurEcritures && "les écritures de l’année",
    erreurDetentions && "vos quotes-parts de détention",
    erreurMeubles && "la liste des lots meublés",
    erreurBaux && "la clé de ventilation loyer / charges des baux",
    (erreurAppels || erreurPostes) && "la part récupérable des charges de copropriété",
  ].filter((x): x is string => Boolean(x));

  // Le choix de l'année prend la pastille `.filtre` de l'espace, 44 px au
  // doigt : c'était une rangée de liens soulignés de 36 px (14 px de haut sur
  // bureau), où logeait aussi le retour au livre (24/09).
  const navigation = (
    <nav aria-label="Année du récapitulatif" className="mt-3 flex flex-wrap items-center gap-2">
      {anneesProposees.map((a) => (
        <Link
          key={a}
          href={`/agence/${orgId}/comptabilite/fiscal?annee=${a}${bien ? `&bien=${encodeURIComponent(bien)}` : ""}`}
          className={`${a === annee ? "filtre actif" : "filtre"} inline-flex items-center pointer-coarse:min-h-11`}
          aria-current={a === annee ? "page" : undefined}
        >
          {a}
        </Link>
      ))}
    </nav>
  );
  // Même motif que les sous-pages et les fiches de l'espace : le retour
  // au-dessus du titre, libellé du titre de la page qu'il rouvre (24/09).
  const retour = (
    <Link
      href={`/agence/${orgId}/loyers?annee=${annee}${bien ? `&bien=${encodeURIComponent(bien)}` : ""}#declaration`}
      className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:underline"
    >
      ← Finances
    </Link>
  );

  if (lecturesEnEchec.length > 0 && props.compact) return <p role="alert" className="err">Récapitulatif indisponible : {lecturesEnEchec.join(", ")}.</p>;

  if (lecturesEnEchec.length > 0) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-[1.125rem] p-4 sm:p-7">
        <div>
          {retour}
          <div className="entete-page">
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
  const lotsMeubles = ((lotsMeublesRows ?? []) as { id: string; nom: string }[]).filter(l => !perimetre || perimetre.has(l.id));
  const ventilationLoyers = new Map(
    ((baux ?? []) as { id: string; loyer_hc: number | null; charges: number | null }[]).map(
      (b) => [b.id, { loyerHc: Number(b.loyer_hc) || 0, charges: Number(b.charges) || 0 }]
    )
  );
  const lotParAppel = new Map(
    ((appelsCopro ?? []) as { id: string; lot_id: string }[]).map((a) => [a.id, a.lot_id])
  );
  const chargesCoproRecuperables = new Map<string, number>();
  for (const p of (postesRecuperables ?? []) as { appel_id: string; montant: number }[]) {
    const lot = lotParAppel.get(p.appel_id);
    if (lot) chargesCoproRecuperables.set(lot, (chargesCoproRecuperables.get(lot) ?? 0) + Number(p.montant));
  }
  const recap = recapitulatifFiscal(((ecritures ?? []) as EcritureFiscale[]).filter(e => !perimetre || (e.lot_id != null && perimetre.has(e.lot_id))), annee, {
    quoteParts,
    lotsMeubles: new Set(lotsMeubles.map((l) => l.id)),
    ventilationLoyers,
    chargesCoproRecuperables,
  });
  const recettes = recap.rubriques.filter((r) => r.sens === "recette");
  const charges = recap.rubriques.filter((r) => r.sens === "depense");
  // Une année sans écriture n'est pas un récapitulatif à zéro : c'est un
  // livre vide pour cette année, et l'écran le dit (24/09 — neuf rubriques à
  // 0,00 € et une colonne de « — » ne l'apprenaient à personne).
  const anneeVide = recap.nbEcritures === 0 && recap.meuble.nbEcritures === 0;

  if (props.compact) return <div className="space-y-3">
    {anneeVide ? <p className="text-sm text-muted-foreground">Aucune écriture à récapituler pour {annee}.</p> : <>
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Recettes brutes", recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes],
          ["Charges déductibles", recap.ventile ? recap.totalChargesQuotePart : recap.totalCharges],
          ["Revenu foncier net", recap.ventile ? recap.revenuNetQuotePart : recap.revenuNet],
        ].map(([label, montant]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-base sm:text-xl font-semibold montant">{eur(Number(montant))}</dd></div>)}
      </dl>
      {recap.ventile && <p className="text-xs text-muted-foreground">Montants selon votre quote-part de détention.</p>}
      {recap.meuble.nbEcritures > 0 && <p className="text-sm">Locations meublées, hors revenus fonciers : {eur(recap.meuble.recettes)} de recettes et {eur(recap.meuble.depenses)} de dépenses.</p>}
    </>}
    <p className="text-xs text-muted-foreground">Aide à la déclaration de revenus fonciers ; aucune déclaration n’est envoyée.</p>
    <Link className="lien-discret inline-flex min-h-11 items-center" href={`/agence/${orgId}/comptabilite/fiscal?annee=${annee}${bien ? `&bien=${encodeURIComponent(bien)}` : ""}`}>Préparer ma déclaration {annee} →</Link>
  </div>;


  return (
    <main className="mx-auto w-full max-w-4xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        {retour}
        {/* La marge sous l'en-tête est celle de `.entete-page`, commune à
            l'espace : plus de mb-4 / mb-6 posés page par page (24/09). */}
        <div className="entete-page">
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

      {anneeVide && (
        <div className="vide-guide">
          <p className="titre">Aucune écriture datée de {annee} dans votre livre</p>
          <p className="explication">
            Ce récapitulatif restera à 0 € tant que vos loyers encaissés et vos
            dépenses de {annee} n&apos;y sont pas saisis.
          </p>
          <p className="geste">
            <Link href={`/agence/${orgId}/comptabilite`} className="lien-discret">
              Ouvrir le livre recettes-dépenses →
            </Link>
          </p>
        </div>
      )}

      {/* Recettes en vert, charges en neutre : la couleur dit ce qu'on compte
          (24/09 — `.kpi.or` et `.kpi.bleu` rendaient la même tuile). */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi vert">
          <span className="eyebrow">Recettes brutes</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : `pièces datées de ${annee}`}
          </span>
        </div>
        <div className="kpi">
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
        <Card data-tone="warning">
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

      {!anneeVide && (
        <>
          <TableauRubriques
            titre="Recettes"
            description="Lignes 211 et 212 de la 2044. Ligne 211 : loyers hors charges — la part de chaque encaissement qui correspond aux provisions de charges du bail (reconstituée au prorata du bail) n'est pas un revenu et n'y figure pas. Ligne 212 : dépenses du bailleur mises par convention à la charge du locataire, que le livre ne distingue pas — à compléter le cas échéant."
            rubriques={recettes}
            ventile={recap.ventile}
          />
          {/* L'organisation parle, pas la marque de l'outil (24/09) : l'espace
              est aux couleurs de son organisation. */}
          <TableauRubriques
            titre="Charges déductibles"
            description="Lignes 221 à 250. Taxe foncière (ligne 227) hors taxe d'enlèvement des ordures ménagères, récupérable sur le locataire. Copropriété (ligne 229) : la part récupérable des charges, quand le décompte du syndic est ventilé, est retirée ; sinon, elle se réintègre l'année suivante (ligne 230), après le décompte annuel du syndic. Les intérêts d'emprunt ne sont pas suivis dans le livre : reportez-les depuis le tableau d'amortissement de votre banque."
            rubriques={charges}
            ventile={recap.ventile}
          />
        </>
      )}

      {/* Audit gestion du 29/09 : ce qui sort de la 2044, dit et chiffré. */}
      {(recap.chargesRecuperees !== 0 || recap.teomExclue !== 0 || recap.coproRecuperableExclue !== 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Charges récupérables — hors déclaration</CardTitle>
            <CardDescription>
              Les charges remboursées par vos locataires ne sont ni un revenu ni
              une charge déductible : elles ne figurent pas ci-dessus. Cette
              année : <span className="montant">{eur(recap.chargesRecuperees)}</span> de
              provisions et régularisations de charges encaissées
              {recap.teomExclue !== 0 && (
                <>
                  , <span className="montant">{eur(recap.teomExclue)}</span> de taxe
                  d&apos;enlèvement des ordures ménagères
                </>
              )}
              {recap.coproRecuperableExclue !== 0 && (
                <>
                  {" "}et <span className="montant">{eur(recap.coproRecuperableExclue)}</span> de
                  charges de copropriété récupérables retirées de la ligne 229
                </>
              )}
              .
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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
        de 30 %). Le meublé (BIC) et la SCI relèvent d&apos;autres déclarations,
        que ce récapitulatif ne couvre pas.
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
            recopier sur la 2044 se lit sans défilement horizontal. Une
            rubrique à compléter dit « à reporter », jamais « … » ; et une
            rubrique sans catégorie n'affiche pas un « — » isolé sur sa ligne,
            qui passait pour un rang cassé (24/09). */}
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
              {(r.aCompleter || r.categories.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  {r.aCompleter ? "à compléter par vos soins" : r.categories.join(", ")}
                </p>
              )}
              {!r.aCompleter && (
                <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                  <span className={ventile ? "" : "font-medium"}>
                    {ventile ? "Total" : "Montant"} :{" "}
                    <span className="montant">{eur(r.montant)}</span>
                  </span>
                  {ventile && (
                    <span className="font-medium">
                      Votre quote-part :{" "}
                      <span className="montant">{eur(r.montantQuotePart)}</span>
                    </span>
                  )}
                </p>
              )}
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
                  <td className="nombre montant">
                    {r.aCompleter ? (
                      <span className="text-xs text-muted-foreground">à reporter</span>
                    ) : (
                      eur(r.montant)
                    )}
                  </td>
                  {ventile && (
                    <td className="nombre montant font-medium">
                      {r.aCompleter ? (
                        <span className="text-xs font-normal text-muted-foreground">à reporter</span>
                      ) : (
                        eur(r.montantQuotePart)
                      )}
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
