import Link from "next/link";
import { csvRecapitulatifFiscal } from "@/lib/fiscal-export";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, aujourdhuiParis } from "@/lib/ged";
import { recapitulatifFiscal, type EcritureFiscale, type QualificationFiscale, type ComposantesFiscales, type ExerciceFiscalLot } from "@/lib/fiscal";
import { QualificationPiece, ExerciceLot } from "@/components/formulaires-fiscaux";
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
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const { data: biensDisponibles, error: erreurListeBiens } = props.compact
    ? { data: [], error: null }
    : await supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("nom");

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
    {data:ecritures,error:erreurEcritures},
    {data:qualificationsRows,error:erreurQualifications},
    {data:composantesRows,error:erreurComposantes},
    {data:exercicesRows,error:erreurExercices},
    {data:lotsRows,error:erreurLots},
  ]=await Promise.all([
    supabase.from("ecritures").select("id,categorie,sens,montant,date_piece,contre_ecriture_de,lot_id,bail_id,encaissement_id,libelle").eq("organization_id",orgId).gte("date_piece",`${annee}-01-01`).lte("date_piece",`${annee}-12-31`),
    supabase.from("fiscal_qualifications_ecritures").select("*").eq("organization_id",orgId).order("version",{ascending:false}),
    supabase.from("fiscal_encaissements_composantes").select("*").eq("organization_id",orgId),
    supabase.from("fiscal_exercices_lots").select("*").eq("organization_id",orgId).eq("annee",annee).order("version",{ascending:false}),
    supabase.from("lots").select("id,nom").eq("organization_id",orgId).order("nom"),
  ]);
  const lecturesEnEchec=[erreurBien&&"les lots du bien",erreurEcritures&&"les écritures",erreurQualifications&&"les qualifications",erreurComposantes&&"les composantes historiques",erreurExercices&&"les exercices confirmés",erreurLots&&"les lots"].filter((x):x is string=>Boolean(x));

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

  const qualifications=new Map<string,QualificationFiscale>();
  for(const q of (qualificationsRows??[]) as QualificationFiscale[])if(!qualifications.has(q.ecriture_id))qualifications.set(q.ecriture_id,q);
  const composantes=new Map(((composantesRows??[]) as ComposantesFiscales[]).map(c=>[c.ecriture_id,c]));
  const exercices=new Map<string,ExerciceFiscalLot>();
  for(const x of (exercicesRows??[]) as ExerciceFiscalLot[])if((!perimetre||perimetre.has(x.lot_id))&&!exercices.has(x.lot_id))exercices.set(x.lot_id,x);
  const lots=((lotsRows??[]) as {id:string;nom:string}[]).filter(l=>!perimetre||perimetre.has(l.id));
  const pieces=((ecritures??[]) as EcritureFiscale[]).filter(e=>{
    const lot=e.lot_id??qualifications.get(e.contre_ecriture_de??e.id??'')?.lot_id;
    return !perimetre||(lot!=null&&perimetre.has(lot));
  });
  const recap=recapitulatifFiscal(pieces,annee,{qualifications,composantes,exercices,exigerPerimetre:true});
  const lotsMeubles=lots.filter(l=>exercices.get(l.id)?.periodes.some(p=>p.regime==='meuble'));
  const recettes = recap.rubriques.filter((r) => r.sens === "recette");
  const charges = recap.rubriques.filter((r) => r.sens === "depense");
  // Une année sans écriture n'est pas un récapitulatif à zéro : c'est un
  // livre vide pour cette année, et l'écran le dit (24/09 — neuf rubriques à
  // 0,00 € et une colonne de « — » ne l'apprenaient à personne).
  const anneeVide = recap.nbEcritures === 0 && recap.meuble.nbEcritures === 0 && !recap.rubriques.some(r => r.code === "230" && r.montant !== 0);

  if (props.compact) return <div className="space-y-3">
    {anneeVide ? <p className="text-sm text-muted-foreground">Aucune écriture à récapituler pour {annee}.</p> : <>
      {recap.incomplet&&<p role="status" className="text-sm">Récapitulatif à compléter : {recap.alertes.join(" ")}</p>}
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Recettes confirmées", recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes],
          ["Charges confirmées après 230", recap.ventile ? recap.totalChargesQuotePart : recap.totalCharges],
          ["Solde des montants confirmés", recap.ventile ? recap.revenuNetQuotePart : recap.revenuNet],
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
            {recap.nbEcritures} écriture{recap.nbEcritures > 1 ? "s" : ""} examinée
            {recap.nbEcritures > 1 ? "s" : ""} · date de pièce
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Vos recettes et charges de l&apos;année, rangées selon les rubriques
          de la déclaration 2044 (revenus fonciers, location nue). C&apos;est une
          aide pour recopier, pas une déclaration : vérifiez chaque montant et
          complétez ce que le livre ne suit pas.
        </p>
      </div>
      <section className="loc-carte space-y-3">
        <h2 className="text-lg">1. Choisir l’année et les biens</h2>
        <form data-saisie-libre action={`/agence/${orgId}/comptabilite/fiscal`} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <label className="space-y-1 text-sm">Année<select name="annee" defaultValue={annee} className="min-h-11 w-full rounded-lg border border-input bg-background px-3">{anneesProposees.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="space-y-1 text-sm">Biens<select name="bien" defaultValue={bien ?? ""} className="min-h-11 w-full rounded-lg border border-input bg-background px-3"><option value="">Tous mes biens</option>{(biensDisponibles ?? []).map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}</select></label>
          <button type="submit" className="btn-or">Afficher</button>
        </form>
        {erreurListeBiens && <p role="alert" className="text-sm text-destructive">La liste des biens n’a pas pu être chargée. Rechargez la page pour affiner le périmètre.</p>}
      </section>
      <h2 className="text-lg">2. Vérifier les montants</h2>
      {recap.incomplet&&<div role="status" className="loc-carte space-y-2"><p className="font-medium">À compléter — les totaux portent uniquement sur les montants confirmés.</p><ul className="list-disc pl-5 text-sm">{recap.alertes.map(a=><li key={a}>{a}</li>)}</ul><p className="text-sm">Montant net des pièces ou parts à qualifier : {eur(recap.aQualifier)}. Ces montants ne sont pas inclus dans les totaux confirmés.</p></div>}
      <section className="space-y-3"><h3 className="font-medium">Périodes fiscales et régularisation 230</h3>{lots.map(l=><ExerciceLot key={`${l.id}-${exercices.get(l.id)?.version??0}`} orgId={orgId} lot={l} annee={annee} exercice={exercices.get(l.id)}/>)}</section>
      <section className="space-y-3"><h3 className="font-medium">Qualifier les pièces</h3><p className="text-sm text-muted-foreground">Le choix est enregistré avec son auteur, sa date et sa justification. Les versions précédentes restent conservées. Les annulations reprennent la qualification de la pièce d’origine.</p>{pieces.filter(e=>e.id&&!e.contre_ecriture_de&&e.categorie!=='depot_garantie'&&(!composantes.has(e.id)||Number(composantes.get(e.id)?.non_ventile)>0)).map(e=><QualificationPiece key={`${e.id}-${qualifications.get(e.id!)?.version??0}`} orgId={orgId} ecriture={e} qualification={qualifications.get(e.id!)} lots={lots}/>)}</section>


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
          <span className="eyebrow">Recettes confirmées</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.totalRecettesQuotePart : recap.totalRecettes)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : `pièces datées de ${annee}`}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Charges confirmées après 230</span>
          <span className="chiffre montant mt-1 block">
            {eur(recap.ventile ? recap.totalChargesQuotePart : recap.totalCharges)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {recap.ventile ? "votre quote-part" : `pièces datées de ${annee}`}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Solde des montants confirmés</span>
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
            description="Lignes 211 à 213 confirmées. Les loyers proviennent des composantes historiques conservées ou d’une qualification justifiée. Les provisions récupérées restent hors recettes imposables. Les recettes anciennes non démontrées restent à compléter."
            rubriques={recettes}
            ventile={recap.ventile}
          />
          {/* L'organisation parle, pas la marque de l'outil (24/09) : l'espace
              est aux couleurs de son organisation. */}
          <TableauRubriques
            titre="Charges confirmées après 230"
            description="Les seules dépenses qualifiées sont comptées. Ligne 229 : provisions éligibles effectivement versées, sans retirer les charges récupérables de cette même année. Ligne 230 : régularisation de l’année précédente, retranchée du total des charges. Les intérêts nécessitent leurs pièces ; le forfait 222 reste à compléter séparément."
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
                  charges hors revenus fonciers
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

      {!anneeVide && <section className="loc-carte space-y-3">
        <h2 className="text-lg">3. Conserver le récapitulatif</h2>
        <p className="text-sm text-muted-foreground">Exportez les mêmes montants confirmés et alertes que ceux affichés. Les rubriques à compléter restent vides. Ce fichier daté ne remplace aucun export antérieur.</p>
        <a className="btn-or inline-flex" download={`recapitulatif-fiscal-${annee}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvRecapitulatifFiscal(recap, annee))}`}>Exporter les montants (CSV)</a>
      </section>}
      <p className="text-xs text-muted-foreground">Version des règles {recap.versionRegles}. Référence : <a className="underline" href="https://www.impots.gouv.fr/sites/default/files/formulaires/2044/2026/2044_5487.pdf">notice officielle 2044, millésime 2026 (revenus 2025)</a>. Les éditions futures, rubriques et régimes particuliers non couverts restent à vérifier. Les montants non déductibles confirmés ({eur(recap.nonDeductible)}) sont exclus.</p>
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
