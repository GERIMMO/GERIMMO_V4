import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { eur } from "@/lib/ged";
import { IMPUTATIONS_INCIDENT } from "@/lib/incidents";
import { centsEnEuros } from "../artisans/referentiel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EchecLecture } from "../documents/echec-lecture";

export const metadata = { title: "Statistiques — Gerimmo" };

// Statistiques (maquette v6) : des métriques RÉELLES tirées des incidents —
// résolution, délai moyen de clôture, répartition des imputations, lots les
// plus signalés. L'agent lit son portefeuille, l'admin toute l'agence.
//
// LES COÛTS (11/09). Cet écran promettait depuis août que « les coûts par
// intervention arriveront avec les devis d'artisans ». La donnée existe
// désormais : le devis RETENU porte le montant engagé, le compte rendu de
// l'artisan porte le montant réalisé. On tient donc la promesse plutôt que de
// la répéter — et on dit lequel des deux montants on affiche, parce que
// confondre un devis et une facture est la première façon de mentir avec un
// chiffre. Ce qui manque encore : la FACTURE (seconde moitié du module 9,
// non construite), donc aucun « payé » ici, seulement de l'engagé et du
// constaté.
const TOP_LOTS = 5;

export default async function PageStatistiques(
  props: PageProps<"/agence/[orgId]/statistiques">
) {
  const { orgId } = await props.params;
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);

  const [
    { data: incidentsBruts, error: erreurIncidents },
    { data: lots, error: erreurLots },
    { data: devisBruts, error: erreurDevis },
    { data: missionsBrutes, error: erreurMissions },
    { data: comptesRendusBruts, error: erreurComptesRendus },
  ] = await Promise.all([
    supabase
      .from("incidents")
      .select("id, lot_id, etat, imputation, created_at, clos_le")
      .eq("organization_id", orgId),
    supabase.from("lots").select("id, nom").eq("organization_id", orgId),
    // Le devis RETENU, et lui seul : un devis reçu puis écarté n'a jamais
    // engagé un euro, l'additionner gonflerait le coût de l'agence.
    supabase
      .from("incident_devis")
      .select("incident_id, montant_ttc_cents")
      .eq("organization_id", orgId)
      .eq("statut", "retenu"),
    supabase
      .from("incident_interventions")
      .select("id, incident_id")
      .eq("organization_id", orgId),
    supabase
      .from("intervention_comptes_rendus")
      .select("intervention_id, montant_final_cents")
      .eq("organization_id", orgId),
  ]);
  // Un échec de lecture ne doit pas devenir « 0 incident » (audit 09/09) :
  // une agence sans incident et une base injoignable se ressemblaient trait
  // pour trait. On nomme ce qui n'a pas pu être lu.
  const lecturesEnEchec = [
    erreurIncidents && "les incidents",
    erreurLots && "les lots",
  ].filter((x): x is string => Boolean(x));
  if (lecturesEnEchec.length > 0) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
        <div className="entete-page mb-4">
          <h1>Statistiques</h1>
        </div>
        <div className="err" role="alert">
          <p className="font-medium">
            Aucune métrique n’est calculée : {lecturesEnEchec.join(" et ")} n’
            {lecturesEnEchec.length > 1 ? "ont" : "a"} pas pu être lu
            {lecturesEnEchec.length > 1 ? "s" : ""}.
          </p>
          <p className="mt-1">
            Ce n’est pas une agence sans incident : c’est la lecture qui a
            échoué. Rechargez la page dans un instant — un taux calculé sur une
            lecture incomplète ne vaut rien.
          </p>
        </div>
      </main>
    );
  }
  // lotsDuPortefeuille renvoie déjà null pour tout rôle autre qu'agent
  const perimetre = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const nomLot = new Map(((lots ?? []) as { id: string; nom: string }[]).map((l) => [l.id, l.nom]));
  const incidents = ((incidentsBruts ?? []) as {
    id: string;
    lot_id: string;
    etat: string;
    imputation: string | null;
    created_at: string;
    clos_le: string | null;
  }[]).filter((i) => perimetre === null || perimetre.has(i.lot_id));

  const clos = incidents.filter((i) => i.etat === "clos");
  const enCours = incidents.length - clos.length;
  // Un incident clos SANS date de clôture ne se mesure pas : il sortait du
  // calcul, mais la légende comptait quand même tous les clos — le taux et sa
  // base ne parlaient pas de la même population.
  const delais = clos
    .filter((i) => i.clos_le)
    .map((i) => (new Date(i.clos_le!).getTime() - new Date(i.created_at).getTime()) / 86_400_000);
  const delaiMoyen = delais.length
    ? Math.round((delais.reduce((s, d) => s + d, 0) / delais.length) * 10) / 10
    : null;
  const sous15j = delais.length
    ? Math.round((delais.filter((d) => d <= 15).length / delais.length) * 100)
    : null;

  const parImputation = new Map<string, number>();
  for (const i of incidents) {
    const cle = i.imputation ?? "a_qualifier";
    parImputation.set(cle, (parImputation.get(cle) ?? 0) + 1);
  }
  const imputationsTriees = [...parImputation.entries()].sort((a, b) => b[1] - a[1]);
  const parLot = new Map<string, number>();
  for (const i of incidents) parLot.set(i.lot_id, (parLot.get(i.lot_id) ?? 0) + 1);
  const lotsTries = [...parLot.entries()].sort((a, b) => b[1] - a[1]);
  const topLots = lotsTries.slice(0, TOP_LOTS);
  const maxLot = topLots[0]?.[1] ?? 1;

  // ── Le coût des interventions ────────────────────────────────────────────
  // Deux montants, deux natures, jamais mélangés :
  //   · ENGAGÉ  = le devis retenu — ce que l'agence a signé ;
  //   · CONSTATÉ = le montant final du compte rendu quand l'artisan l'a
  //     renseigné, à défaut l'engagé. C'est lui qui sert de base au coût moyen,
  //     parce que c'est le plus proche de la réalité qu'on ait sans facture.
  // La facture (module 9, seconde moitié) n'existe pas encore : aucun montant
  // n'est ici présenté comme payé.
  const incidentsDuPerimetre = new Map(incidents.map((i) => [i.id, i]));
  const incidentDeMission = new Map(
    ((missionsBrutes ?? []) as { id: string; incident_id: string }[]).map((m) => [
      m.id,
      m.incident_id,
    ])
  );
  const engagePar = new Map<string, number>();
  for (const d of (devisBruts ?? []) as { incident_id: string; montant_ttc_cents: number }[]) {
    if (!incidentsDuPerimetre.has(d.incident_id)) continue;
    engagePar.set(d.incident_id, (engagePar.get(d.incident_id) ?? 0) + d.montant_ttc_cents);
  }
  const finalPar = new Map<string, number>();
  for (const cr of (comptesRendusBruts ?? []) as {
    intervention_id: string;
    montant_final_cents: number | null;
  }[]) {
    if (cr.montant_final_cents === null) continue;
    const incidentId = incidentDeMission.get(cr.intervention_id);
    if (!incidentId || !incidentsDuPerimetre.has(incidentId)) continue;
    finalPar.set(incidentId, (finalPar.get(incidentId) ?? 0) + cr.montant_final_cents);
  }

  const idsChiffres = [...new Set([...engagePar.keys(), ...finalPar.keys()])];
  const coutConstateCents = (id: string) => finalPar.get(id) ?? engagePar.get(id) ?? 0;
  const totalConstateCents = idsChiffres.reduce((s, id) => s + coutConstateCents(id), 0);
  const coutMoyenCents = idsChiffres.length
    ? Math.round(totalConstateCents / idsChiffres.length)
    : null;

  // L'écart devis → réalisé ne se mesure que là où les DEUX montants existent :
  // comparer un devis à lui-même donnerait un écart de zéro et diluerait le vrai.
  const idsCompares = idsChiffres.filter((id) => engagePar.has(id) && finalPar.has(id));
  const ecartCents = idsCompares.reduce(
    (s, id) => s + (finalPar.get(id)! - engagePar.get(id)!),
    0
  );

  // Qui paie, en euros cette fois : la répartition en nombre d'incidents ne dit
  // pas combien chacun supporte — trois fuites de joint ne pèsent pas une
  // chaudière.
  const coutParImputation = new Map<string, number>();
  for (const id of idsChiffres) {
    const cle = incidentsDuPerimetre.get(id)?.imputation ?? "a_qualifier";
    coutParImputation.set(cle, (coutParImputation.get(cle) ?? 0) + coutConstateCents(id));
  }
  const coutsTries = [...coutParImputation.entries()].sort((a, b) => b[1] - a[1]);

  // Ces trois lectures ne conditionnent PAS la page : un écran de statistiques
  // sans les coûts reste utile, alors qu'un écran blanc ne l'est pas. On les
  // nomme dans la carte des coûts, là où le manque se voit.
  const coutsIllisibles = [
    erreurDevis && "les devis retenus",
    erreurMissions && "les interventions",
    erreurComptesRendus && "les comptes rendus d'artisans",
  ].filter((x): x is string => Boolean(x));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-7">
      <div className="entete-page">
        <h1>{perimetre ? "Mes statistiques" : "Statistiques"}</h1>
        <span className="mono-discret">
          {perimetre ? "Mon portefeuille · " : ""}
          {incidents.length} incident{incidents.length > 1 ? "s" : ""} au total
        </span>
      </div>

      {/* .kpi / .eyebrow / .chiffre : la tuile de la charte, celle du tableau
          de bord et de la comptabilité. Cet écran en avait sa propre version
          (.loc-kpi + tailles en dur) pour dire exactement la même chose. Les
          liserés restent catégoriels, jamais évaluatifs : un taux de 20 %
          sous liseré vert se lirait comme une bonne nouvelle. */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="kpi bleu">
          <span className="eyebrow">Résolus sous 15 jours</span>
          <span className="chiffre montant mt-1 block">
            {sous15j !== null ? `${sous15j} %` : "—"}
          </span>
          <span className="block text-xs text-muted-foreground">
            sur {delais.length} incident{delais.length > 1 ? "s" : ""} clos et daté
            {delais.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Délai moyen de clôture</span>
          <span className="chiffre montant mt-1 block">
            {delaiMoyen !== null ? `${delaiMoyen.toLocaleString("fr-FR")} j` : "—"}
          </span>
          <span className="block text-xs text-muted-foreground">
            du signalement à la clôture
          </span>
        </div>
        <div className="kpi or">
          <span className="eyebrow">En cours</span>
          <span className="chiffre montant mt-1 block">{enCours}</span>
          <span className="block text-xs text-muted-foreground">
            incident{enCours > 1 ? "s" : ""} ouvert{enCours > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {incidents.length === 0 ? (
        <div className="vide-guide">
          <p className="titre">Aucun incident à mesurer</p>
          <p className="explication">
            {perimetre
              ? "Aucun incident n'a encore été signalé sur les lots de votre portefeuille."
              : "Aucun incident n'a encore été signalé dans cette agence."}{" "}
            Dès le premier signalement, cet écran chiffre le délai de clôture,
            la répartition des imputations et les lots qui reviennent le plus
            souvent.
          </p>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              {/* h2 : la page ne porte qu'un h1 — les panneaux sautaient au h3 */}
              <h2 className="font-heading text-base leading-snug font-medium">
                Qui paie — répartition des imputations
              </h2>
            </CardHeader>
            <CardContent>
              {imputationsTriees.map(([imp, n]) => (
                <div key={imp} className="ligne-info">
                  <span className="min-w-0 truncate">
                    {imp === "a_qualifier"
                      ? "Pas encore qualifié"
                      : (IMPUTATIONS_INCIDENT[imp] ?? imp)}
                  </span>
                  {/* .barre : la même jauge que le parc, plutôt qu'un
                      pourcentage à lire de rang en rang. */}
                  <span className="barre hidden flex-1 self-center sm:block">
                    <i
                      style={{
                        width: `${Math.round((n / incidents.length) * 100)}%`,
                        background: "var(--encre)",
                      }}
                    />
                  </span>
                  <span className="montant whitespace-nowrap">
                    {n} · {Math.round((n / incidents.length) * 100)} %
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* CE QUE COÛTENT LES INTERVENTIONS — la promesse d'août, tenue.
              Deux montants distincts et nommés : l'engagé (devis retenu) et le
              constaté (montant final du compte rendu). Pas de « payé » : la
              facture n'existe pas encore dans le produit. */}
          <Card>
            <CardHeader>
              <div className="entete-carte !mb-0">
                <h2 className="font-heading text-base leading-snug font-medium">
                  Ce que coûtent les interventions
                </h2>
                <span className="mono-discret">
                  {idsChiffres.length} incident{idsChiffres.length > 1 ? "s" : ""} chiffré
                  {idsChiffres.length > 1 ? "s" : ""}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <EchecLecture quoi={coutsIllisibles} />
              {idsChiffres.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun devis n&apos;a encore été retenu
                  {perimetre ? " sur votre portefeuille" : " dans cette agence"}. Dès
                  la première mission confiée à un artisan, cet écran chiffre le
                  coût moyen, l&apos;écart entre devis et réalisé, et la part
                  supportée par chacun.
                </p>
              ) : (
                <>
                  <div className="grid gap-3.5 sm:grid-cols-3">
                    <div className="kpi">
                      <span className="eyebrow">Coût constaté</span>
                      <span className="chiffre montant mt-1 block">
                        {eur(centsEnEuros(totalConstateCents))}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        montant final de l&apos;artisan, à défaut le devis retenu
                      </span>
                    </div>
                    <div className="kpi">
                      <span className="eyebrow">Coût moyen</span>
                      <span className="chiffre montant mt-1 block">
                        {eur(centsEnEuros(coutMoyenCents))}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        par incident confié à un artisan
                      </span>
                    </div>
                    <div className="kpi or">
                      <span className="eyebrow">Écart devis → réalisé</span>
                      <span className="chiffre montant mt-1 block">
                        {idsCompares.length
                          ? `${ecartCents > 0 ? "+" : ""}${eur(centsEnEuros(ecartCents))}`
                          : "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {idsCompares.length
                          ? `sur ${idsCompares.length} intervention${idsCompares.length > 1 ? "s" : ""} terminée${idsCompares.length > 1 ? "s" : ""} et chiffrée${idsCompares.length > 1 ? "s" : ""}`
                          : "aucune intervention n'a encore de montant final"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="libelle-champ mb-1">Qui supporte ces montants</p>
                    {coutsTries.map(([imp, cents]) => (
                      <div key={imp} className="ligne-info">
                        <span className="min-w-0 truncate">
                          {imp === "a_qualifier"
                            ? "Pas encore qualifié"
                            : (IMPUTATIONS_INCIDENT[imp] ?? imp)}
                        </span>
                        <span className="barre hidden flex-1 self-center sm:block">
                          <i
                            style={{
                              width: `${totalConstateCents ? Math.round((cents / totalConstateCents) * 100) : 0}%`,
                              background: "var(--encre)",
                            }}
                          />
                        </span>
                        <span className="montant whitespace-nowrap">
                          {eur(centsEnEuros(cents))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seul le devis retenu compte : un devis reçu puis écarté
                    n&apos;engage rien. Ces montants ne sont pas des factures — la
                    facturation viendra compléter l&apos;écran.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="entete-carte !mb-0">
                <h2 className="font-heading text-base leading-snug font-medium">
                  Lots les plus signalés
                </h2>
                {/* La liste s'arrête à cinq : le dire, sinon un parc de
                    quarante lots passe pour un parc de cinq. */}
                <span className="mono-discret">
                  {topLots.length} sur {lotsTries.length} lot
                  {lotsTries.length > 1 ? "s" : ""} signalé{lotsTries.length > 1 ? "s" : ""}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {topLots.map(([lotId, n]) => (
                <div key={lotId} className="ligne-info">
                  <span className="min-w-0 truncate">{nomLot.get(lotId) ?? "Lot"}</span>
                  <span className="barre hidden flex-1 self-center sm:block">
                    <i style={{ width: `${Math.round((n / maxLot) * 100)}%`, background: "var(--encre)" }} />
                  </span>
                  <span className="montant whitespace-nowrap">
                    {n} incident{n > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
              <p className="mt-3 text-xs text-muted-foreground">
                Un même lot signalé plusieurs fois pour la même famille de panne :
                {estProprietaire
                  ? " le signe chiffré qu'un travail de fond s'impose."
                  : " l'argument chiffré à présenter au propriétaire pour des travaux de fond."}{" "}
                {/* La phrase qui promettait les coûts « avec les devis
                    d'artisans » est tenue depuis le 11/09 : elle renvoie
                    désormais au chiffre, au lieu de l'annoncer. */}
                Le coût cumulé de ces dépannages est ci-dessus.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
