import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eur, formaterDate, formaterDateHeure } from "@/lib/ged";
import {
  IMPUTATIONS_INCIDENT,
  categorieIncident,
  titreIncident,
} from "@/lib/incidents";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EchecLecture } from "../documents/echec-lecture";
import {
  AUTEURS_CRENEAU,
  COULEURS_DEVIS,
  COULEURS_INTERVENTION,
  COULEURS_SCOPE,
  COULEURS_SOLLICITATION,
  centsEnEuros,
  decennaleRequise,
  LIBELLES_SCOPE,
  METIERS_ARTISAN,
  MOMENTS_PHOTO,
  NATURES_TRAVAUX,
  scopeArtisan,
  STATUTS_CRENEAU,
  STATUTS_DEVIS,
  STATUTS_INTERVENTION,
  STATUTS_MISSION_VIVANTE,
  STATUTS_SOLLICITATION,
} from "../artisans/referentiel";
import {
  BoutonRetenirDevis,
  BoutonSolliciter,
  FormulaireAnnulationMission,
  FormulaireConsultation,
  FormulaireEvaluation,
  FormulaireRendezVous,
  FormulaireRevisionImputation,
} from "./formulaires-artisan";

// LE VOLET ARTISAN DE LA FICHE D'INCIDENT — missionner, comparer, suivre.
//
// Il se greffe sur le cycle d'incident existant sans le réécrire : la
// qualification, la contestation, la clôture et la chronologie restent où
// elles sont. Ce volet ajoute les quatre gestes qui manquaient entre
// « qualifié » et « clos » :
//   1. ouvrir une mise en concurrence (RM-7.2.7 : jamais avant la
//      qualification — la base le refuse, l'écran le dit avant) ;
//   2. solliciter jusqu'à DEUX artisans (RM-9.1.1) ;
//   3. retenir un devis — la seconde approbation, celle de l'agence ou du
//      propriétaire, jamais du locataire ni de Gerimmo ;
//   4. suivre la mission, lire le compte rendu, et réviser l'imputation quand
//      l'artisan a signalé une cause différente (RM-7.5.3).
//
// Composant serveur : il fait ses propres lectures, en requêtes PLATES puis
// jointure en mémoire. Aucun embed PostgREST : ces tables portent à la fois
// une clé étrangère simple et une clé composite qui garde l'agence cohérente,
// et le produit a déjà payé le prix d'un embed ambigu — une liste vide qui
// ressemble à « rien à signaler ».

type Consultation = {
  id: string;
  metier: string;
  nature_travaux: string;
  decennale_requise: boolean;
  devis_unique_assume: boolean;
  validite_jours: number;
  statut: string;
  created_at: string;
};

type Sollicitation = {
  id: string;
  consultation_id: string;
  artisan_id: string;
  statut: string;
  envoyee_le: string;
  repondue_le: string | null;
  refus_motif: string | null;
};

type Devis = {
  id: string;
  sollicitation_id: string;
  artisan_id: string;
  montant_ttc_cents: number;
  description: string;
  valide_jusqu_au: string;
  document_id: string | null;
  statut: string;
  depose_le: string;
};

type Intervention = {
  id: string;
  artisan_id: string;
  devis_id: string | null;
  nature_travaux: string;
  statut: string;
  confiee_le: string;
  acceptee_le: string | null;
  refusee_le: string | null;
  refus_motif: string | null;
  debut_prevu: string | null;
  fin_prevue: string | null;
  demarree_le: string | null;
  terminee_le: string | null;
  annulation_motif: string | null;
};

type Creneau = {
  id: string;
  intervention_id: string;
  propose_par: string;
  tour: number;
  debut: string;
  fin: string;
  statut: string;
};

type CompteRendu = {
  id: string;
  intervention_id: string;
  travaux_realises: string;
  cause_reelle: string | null;
  imputation_suggeree: string | null;
  montant_final_cents: number | null;
  nouvelle_intervention_necessaire: boolean;
  created_at: string;
};

type Photo = { id: string; intervention_id: string; document_id: string; moment: string };

type Evaluation = {
  id: string;
  intervention_id: string;
  source: string;
  note_globale: number;
  retiree_le: string | null;
};

type Affectable = {
  artisan_id: string;
  raison_sociale: string;
  telephone: string;
  email: string | null;
  rattache: boolean;
  note_publiee: number | null;
  nb_evaluations: number;
  publiable: boolean;
  decennale_valide: boolean;
};

// Le montant d'un devis, en euros lisibles. Les colonnes sont en centimes.
const montant = (cents: number | null | undefined) => eur(centsEnEuros(cents));

// RM-9.2.3 : un devis expiré est caduc. On le dit avant que la base ne le
// refuse — l'agent n'a pas à essayer pour l'apprendre.
function devisExpire(d: Devis, aujourdhui: string): boolean {
  return d.statut === "depose" && d.valide_jusqu_au < aujourdhui;
}

export async function VoletArtisan({
  orgId,
  incidentId,
  etat,
  categorie,
  imputation,
  lotId,
}: {
  orgId: string;
  incidentId: string;
  etat: string;
  categorie: string;
  imputation: string | null;
  lotId: string | null;
}) {
  // Avant la qualification, il n'y a rien à afficher et rien à faire :
  // RM-7.2.7 interdit d'affecter sans imputation. On l'annonce plutôt que de
  // laisser un formulaire se faire refuser.
  if (etat === "declare" || etat === "rouvert") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Artisan</CardTitle>
          <CardDescription>
            Qualifiez d&apos;abord l&apos;imputation : aucun artisan n&apos;est
            sollicité tant qu&apos;on ne sait pas qui paie.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

  const [
    { data: consultationsBrutes, error: erreurConsultations },
    { data: sollicitationsBrutes, error: erreurSollicitations },
    { data: devisBruts, error: erreurDevis },
    { data: interventionsBrutes, error: erreurInterventions },
  ] = await Promise.all([
    supabase
      .from("incident_consultations")
      .select(
        "id, metier, nature_travaux, decennale_requise, devis_unique_assume, validite_jours, statut, created_at"
      )
      .eq("organization_id", orgId)
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("incident_sollicitations")
      .select("id, consultation_id, artisan_id, statut, envoyee_le, repondue_le, refus_motif")
      .eq("organization_id", orgId)
      .eq("incident_id", incidentId)
      .order("envoyee_le", { ascending: true }),
    supabase
      .from("incident_devis")
      .select(
        "id, sollicitation_id, artisan_id, montant_ttc_cents, description, valide_jusqu_au, document_id, statut, depose_le"
      )
      .eq("organization_id", orgId)
      .eq("incident_id", incidentId)
      .order("montant_ttc_cents", { ascending: true }),
    supabase
      .from("incident_interventions")
      .select(
        "id, artisan_id, devis_id, nature_travaux, statut, confiee_le, acceptee_le, refusee_le, refus_motif, debut_prevu, fin_prevue, demarree_le, terminee_le, annulation_motif"
      )
      .eq("organization_id", orgId)
      .eq("incident_id", incidentId)
      .order("confiee_le", { ascending: false }),
  ]);

  const consultations = (consultationsBrutes ?? []) as Consultation[];
  const sollicitations = (sollicitationsBrutes ?? []) as Sollicitation[];
  const devis = (devisBruts ?? []) as Devis[];
  const interventions = (interventionsBrutes ?? []) as Intervention[];

  const consultationOuverte = consultations.find((c) => c.statut === "ouverte") ?? null;
  // La mission COURANTE : la vivante s'il y en a une (un index unique partiel
  // garantit qu'il n'y en a jamais deux), sinon la plus récente — celle qu'on
  // vient de terminer, de refuser ou d'annuler.
  const mission =
    interventions.find((i) => STATUTS_MISSION_VIVANTE.includes(i.statut)) ??
    interventions[0] ??
    null;

  const idsInterventions = interventions.map((i) => i.id);
  const idsArtisans = [
    ...new Set([
      ...sollicitations.map((s) => s.artisan_id),
      ...devis.map((d) => d.artisan_id),
      ...interventions.map((i) => i.artisan_id),
    ]),
  ];

  const [
    { data: creneauxBruts, error: erreurCreneaux },
    { data: comptesRendusBruts, error: erreurComptesRendus },
    { data: photosBrutes, error: erreurPhotos },
    { data: evaluationsBrutes, error: erreurEvaluations },
    { data: artisansBruts, error: erreurArtisans },
    { data: bienBrut },
  ] = await Promise.all([
    idsInterventions.length
      ? supabase
          .from("intervention_creneaux")
          .select("id, intervention_id, propose_par, tour, debut, fin, statut")
          .eq("organization_id", orgId)
          .in("intervention_id", idsInterventions)
          .order("debut", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    idsInterventions.length
      ? supabase
          .from("intervention_comptes_rendus")
          .select(
            "id, intervention_id, travaux_realises, cause_reelle, imputation_suggeree, montant_final_cents, nouvelle_intervention_necessaire, created_at"
          )
          .eq("organization_id", orgId)
          .in("intervention_id", idsInterventions)
      : Promise.resolve({ data: [], error: null }),
    idsInterventions.length
      ? supabase
          .from("intervention_photos")
          .select("id, intervention_id, document_id, moment")
          .eq("organization_id", orgId)
          .in("intervention_id", idsInterventions)
      : Promise.resolve({ data: [], error: null }),
    idsInterventions.length
      ? supabase
          .from("artisan_evaluations")
          // Les RETIRÉES sont lues elles aussi, et c'est volontaire :
          // l'unicité (intervention_id, source) tient en base indépendamment
          // du retrait. Les masquer ferait rouvrir un formulaire que la base
          // refuserait — « déjà évaluée par l'agence ».
          .select("id, intervention_id, source, note_globale, retiree_le")
          .eq("organization_id", orgId)
          .in("intervention_id", idsInterventions)
      : Promise.resolve({ data: [], error: null }),
    idsArtisans.length
      ? supabase
          .from("artisans")
          .select("id, raison_sociale, telephone")
          .in("id", idsArtisans)
      : Promise.resolve({ data: [], error: null }),
    // Le code postal du BIEN : RM-8.3 compare la zone d'intervention de
    // l'artisan à celui du lot. Deux requêtes plates — `lots` porte deux clés
    // étrangères vers `biens`, PostgREST refuserait d'arbitrer l'embed.
    lotId
      ? supabase.from("lots").select("bien_id").eq("id", lotId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const creneaux = (creneauxBruts ?? []) as Creneau[];
  const comptesRendus = (comptesRendusBruts ?? []) as CompteRendu[];
  const photos = (photosBrutes ?? []) as Photo[];
  const evaluations = (evaluationsBrutes ?? []) as Evaluation[];
  const nomArtisan = new Map(
    ((artisansBruts ?? []) as { id: string; raison_sociale: string; telephone: string }[]).map(
      (a) => [a.id, a]
    )
  );

  let codePostal: string | null = null;
  const bienId = (bienBrut as { bien_id: string } | null)?.bien_id ?? null;
  if (bienId) {
    const { data: bien } = await supabase
      .from("biens")
      .select("postal_code")
      .eq("id", bienId)
      .maybeSingle();
    codePostal = (bien as { postal_code: string } | null)?.postal_code ?? null;
  }

  // La recherche d'affectation (RM-8.3), déléguée entièrement à la base :
  // métier, zone, décennale selon la nature, deux listes noires, validation
  // plateforme — et le tri par score décroissant. L'écran n'en refait aucun
  // morceau, sinon les deux divergeraient.
  let affectables: Affectable[] = [];
  let erreurAffectables: string | null = null;
  if (consultationOuverte) {
    const { data, error } = await supabase.rpc("artisans_affectables", {
      p_org: orgId,
      p_metier: consultationOuverte.metier,
      p_nature: consultationOuverte.nature_travaux,
      p_code_postal: codePostal,
    });
    affectables = (data ?? []) as Affectable[];
    if (error) erreurAffectables = error.message;
  }
  const noteDe = new Map(affectables.map((a) => [a.artisan_id, a]));

  const lecturesManquees = [
    erreurConsultations && "les mises en concurrence",
    erreurSollicitations && "les artisans sollicités",
    erreurDevis && "les devis reçus",
    erreurInterventions && "les interventions",
    erreurCreneaux && "les créneaux proposés",
    erreurComptesRendus && "le compte rendu de l'artisan",
    erreurPhotos && "les photos de chantier",
    erreurEvaluations && "les notes déjà données",
    erreurArtisans && "les fiches des artisans",
    erreurAffectables && "les artisans proposables",
  ].filter((q): q is string => Boolean(q));

  const compteRenduCourant = mission
    ? (comptesRendus.find((c) => c.intervention_id === mission.id) ?? null)
    : null;
  // RM-7.5.3 : c'est l'ÉCART entre la cause signalée et l'imputation posée qui
  // appelle une révision — pas le compte rendu en lui-même.
  const revisionAttendue =
    compteRenduCourant?.imputation_suggeree != null &&
    compteRenduCourant.imputation_suggeree !== imputation &&
    (etat === "en_cours" || etat === "termine");

  const nom = (id: string) => nomArtisan.get(id)?.raison_sociale ?? "Artisan";
  const devisRetenu = mission?.devis_id
    ? (devis.find((d) => d.id === mission.devis_id) ?? null)
    : null;
  const noteDuGerant = mission
    ? (evaluations.find(
        (e) => e.intervention_id === mission.id && e.source === "gerant"
      ) ?? null)
    : null;
  // L'écart devis → réalisé, dit en clair. Le module 9 le veut « alerté sans
  // blocage » : l'artisan justifie, l'agent tranche. Faute de facture dans le
  // produit, on le signale ici, sur le compte rendu.
  const ecartCents =
    devisRetenu && compteRenduCourant?.montant_final_cents != null
      ? compteRenduCourant.montant_final_cents - devisRetenu.montant_ttc_cents
      : null;

  return (
    <div className="space-y-4">
      <EchecLecture quoi={lecturesManquees} />

      {/* ─── RM-7.5.3 : la révision d'imputation passe AVANT tout le reste ───
          L'artisan est le seul à avoir vu la cause réelle ; l'agent tranche, et
          il doit trancher avant la facture. */}
      {revisionAttendue && compteRenduCourant && (
        <Card className="border-l-[3px] border-l-[var(--destructive)]">
          <CardHeader>
            <p className="eyebrow" style={{ color: "var(--destructive)" }}>
              L&apos;artisan signale une autre cause — à trancher avant facturation
            </p>
            <CardDescription>
              Il a constaté sur place ce que personne d&apos;autre n&apos;a vu. Il
              ne requalifie pas : c&apos;est vous qui décidez, et votre décision
              est opposable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-l-2 border-l-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning-soft-foreground)]">
              <p>« {compteRenduCourant.cause_reelle} »</p>
              <p className="mt-1">
                Imputation actuelle :{" "}
                {imputation ? (IMPUTATIONS_INCIDENT[imputation] ?? imputation) : "—"} · il
                suggère :{" "}
                {IMPUTATIONS_INCIDENT[compteRenduCourant.imputation_suggeree!] ??
                  compteRenduCourant.imputation_suggeree}
              </p>
            </div>
            <FormulaireRevisionImputation orgId={orgId} incidentId={incidentId} />
          </CardContent>
        </Card>
      )}

      {/* ─── La mission en cours, ou la dernière en date ─────────────────── */}
      {mission && (
        <Card>
          <CardHeader>
            <div className="entete-carte !mb-0">
              <CardTitle className="text-base">
                Intervention — {nom(mission.artisan_id)}
              </CardTitle>
              <span className={COULEURS_INTERVENTION[mission.statut] ?? "puce puce-grise"}>
                {STATUTS_INTERVENTION[mission.statut] ?? mission.statut}
              </span>
            </div>
            <CardDescription>
              {NATURES_TRAVAUX[mission.nature_travaux] ?? mission.nature_travaux} ·
              confiée le {formaterDate(mission.confiee_le)}
              {nomArtisan.get(mission.artisan_id)?.telephone && (
                <>
                  {" · "}
                  <a
                    href={`tel:${nomArtisan.get(mission.artisan_id)!.telephone.replace(/\s/g, "")}`}
                    className="hover:underline"
                  >
                    {nomArtisan.get(mission.artisan_id)!.telephone}
                  </a>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mission.statut === "refusee" && (
              <div className="err" role="alert">
                <p className="font-medium">
                  Mission refusée le {formaterDate(mission.refusee_le)} — à réaffecter.
                </p>
                <p className="mt-1">
                  {mission.refus_motif ? `« ${mission.refus_motif} » — ` : ""}
                  Le devis retenu est tombé avec elle et l&apos;incident est
                  revenu en attente d&apos;affectation : ouvrez une nouvelle mise
                  en concurrence ci-dessous.
                </p>
              </div>
            )}
            {mission.statut === "annulee" && (
              <p className="text-sm text-muted-foreground">
                Mission annulée par l&apos;agence
                {mission.annulation_motif ? ` : « ${mission.annulation_motif} »` : ""}.
              </p>
            )}

            <div>
              {/* Le montant ENGAGÉ, sur la fiche de la mission : sans lui,
                  l'agent ne peut pas juger le montant final du compte rendu,
                  qui est affiché plus bas. */}
              {devisRetenu && (
                <div className="ligne-info">
                  <span>Devis retenu</span>
                  <span className="montant">{montant(devisRetenu.montant_ttc_cents)}</span>
                </div>
              )}
              <div className="ligne-info">
                <span>Rendez-vous</span>
                <span>
                  {mission.debut_prevu
                    ? `${formaterDateHeure(mission.debut_prevu)} → ${formaterDateHeure(mission.fin_prevue)}`
                    : "pas encore fixé"}
                </span>
              </div>
              {mission.acceptee_le && (
                <div className="ligne-info">
                  <span>Acceptée le</span>
                  <span>{formaterDateHeure(mission.acceptee_le)}</span>
                </div>
              )}
              {mission.demarree_le && (
                <div className="ligne-info">
                  <span>Démarrée le</span>
                  <span>{formaterDateHeure(mission.demarree_le)}</span>
                </div>
              )}
              {mission.terminee_le && (
                <div className="ligne-info">
                  <span>Terminée le</span>
                  <span>{formaterDateHeure(mission.terminee_le)}</span>
                </div>
              )}
            </div>

            {/* Les créneaux : proposés, retenu, et surtout les REFUSÉS — ils
                restent au dossier, un refus persistant est opposable
                (RM-10.4.4). */}
            {creneaux.filter((c) => c.intervention_id === mission.id).length > 0 && (
              <div>
                <p className="libelle-champ mb-1">Créneaux</p>
                {creneaux
                  .filter((c) => c.intervention_id === mission.id)
                  .map((c) => (
                    // Deux lignes plutôt qu'une : « 11/09/2026 09:00 →
                    // 11/09/2026 11:00 » plus l'auteur et le tour ne tiennent
                    // pas sur une rangée de 390 px, et .ligne-info ne va pas à
                    // la ligne.
                    <div key={c.id} className="ligne-info">
                      <span className="min-w-0">
                        <b className="block text-[13px] font-medium text-foreground">
                          {formaterDateHeure(c.debut)}
                        </b>
                        <span className="block text-xs text-muted-foreground">
                          fin {formaterDateHeure(c.fin)} ·{" "}
                          {AUTEURS_CRENEAU[c.propose_par] ?? c.propose_par} · tour {c.tour}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 ${
                          c.statut === "retenu"
                            ? "puce puce-loue"
                            : c.statut === "refuse"
                              ? "puce puce-rouge"
                              : c.statut === "propose"
                                ? "puce puce-prep"
                                : "puce puce-grise"
                        }`}
                      >
                        {STATUTS_CRENEAU[c.statut] ?? c.statut}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* RM-10.4.1 : l'arbitrage. Ouvert dès que la mission est acceptée —
                la base borne le geste aux états « acceptée » et « planifiée ».
                Six créneaux refusés, c'est le seuil où l'on cesse d'échanger. */}
            {(mission.statut === "acceptee" || mission.statut === "planifiee") && (
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {creneaux.filter(
                    (c) => c.intervention_id === mission.id && c.statut === "refuse"
                  ).length >= 6
                    ? "Six créneaux refusés — réglez le rendez-vous au téléphone"
                    : "Fixer le rendez-vous vous-même"}
                </summary>
                <div className="pt-3">
                  <FormulaireRendezVous orgId={orgId} interventionId={mission.id} />
                </div>
              </details>
            )}

            {/* Le compte rendu — la pièce qui conditionne la facturation */}
            {compteRenduCourant ? (
              <div className="border-t border-border pt-3">
                <p className="libelle-champ mb-1">Compte rendu de l&apos;artisan</p>
                <p className="text-sm">« {compteRenduCourant.travaux_realises} »</p>
                <div className="mt-2">
                  <div className="ligne-info">
                    <span>Montant final</span>
                    <span className="montant">
                      {montant(compteRenduCourant.montant_final_cents)}
                    </span>
                  </div>
                  {/* L'écart sur sa propre rangée : une puce ne se coupe pas
                      (white-space: nowrap) et débordait de la rangée du
                      montant sur un pane de 390 px. */}
                  {ecartCents !== null && ecartCents !== 0 && (
                    <div className="ligne-info">
                      <span>Écart avec le devis</span>
                      <span className={`shrink-0 puce ${ecartCents > 0 ? "puce-prep" : "puce-loue"}`}>
                        {ecartCents > 0 ? "+" : "−"}
                        {eur(centsEnEuros(Math.abs(ecartCents)))}
                      </span>
                    </div>
                  )}
                  {compteRenduCourant.cause_reelle && (
                    <div className="ligne-info">
                      <span>Cause constatée</span>
                      <span>{compteRenduCourant.cause_reelle}</span>
                    </div>
                  )}
                  <div className="ligne-info">
                    <span>Déposé le</span>
                    <span>{formaterDateHeure(compteRenduCourant.created_at)}</span>
                  </div>
                </div>
                {compteRenduCourant.nouvelle_intervention_necessaire && (
                  <p className="mt-2 text-sm text-[var(--warning-soft-foreground)]">
                    L&apos;artisan signale qu&apos;une nouvelle intervention sera
                    nécessaire.
                  </p>
                )}
              </div>
            ) : STATUTS_MISSION_VIVANTE.includes(mission.statut) ? (
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                Pas encore de compte rendu. L&apos;intervention ne peut pas être
                terminée sans lui — ni sans la photo du travail réalisé.
              </p>
            ) : null}

            {/* Les photos de chantier : le locataire les consulte avant de
                noter, et celle d'« après » est la garde de RM-7.5.2. */}
            {photos.filter((p) => p.intervention_id === mission.id).length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="libelle-champ mb-1.5">Photos de chantier</p>
                <div className="flex flex-wrap gap-2">
                  {photos
                    .filter((p) => p.intervention_id === mission.id)
                    .map((p) => (
                      // La route documents journalise chaque consultation
                      // (RM-A4 : pas de trace, pas d'accès).
                      <a
                        key={p.id}
                        href={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                        title={`Photo ${MOMENTS_PHOTO[p.moment] ?? p.moment}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                          alt={`Chantier — ${MOMENTS_PHOTO[p.moment] ?? p.moment}`}
                          className="h-20 w-20 rounded-[3px] border border-border object-cover"
                        />
                      </a>
                    ))}
                </div>
              </div>
            )}

            {/* Module 11 : la clôture « déclenche la notation ». On la propose
                dès que l'intervention est terminée, sans attendre la clôture —
                l'agent a le chantier en tête maintenant. */}
            {mission.statut === "terminee" && !noteDuGerant && (
              <details className="border-t border-border pt-3" open>
                <summary className="cursor-pointer text-sm font-medium">
                  Noter {nom(mission.artisan_id)}
                </summary>
                <div className="pt-3">
                  <FormulaireEvaluation orgId={orgId} interventionId={mission.id} />
                </div>
              </details>
            )}
            {noteDuGerant && (
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                {noteDuGerant.retiree_le
                  ? // RM-11.4.4 : l'artisan conteste auprès de Gerimmo, pas de
                    // l'agence — « l'agence est juge et partie ». Le retrait est
                    // la décision de la plateforme ; on l'annonce, on ne
                    // rouvre pas le formulaire (une note par acteur, retirée ou
                    // non).
                    `Votre note (${noteDuGerant.note_globale}/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l'artisan.`
                  : `Vous avez noté cette intervention ${noteDuGerant.note_globale}/5`}
                {!noteDuGerant.retiree_le &&
                  (evaluations.some(
                    (e) =>
                      e.intervention_id === mission.id &&
                      e.source === "locataire" &&
                      !e.retiree_le
                  )
                    ? " ; le locataire aussi."
                    : " ; le locataire n'a pas encore donné la sienne — son absence ne bloque rien.")}
              </p>
            )}

            {STATUTS_MISSION_VIVANTE.includes(mission.statut) && (
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Retirer la mission à cet artisan
                </summary>
                <div className="pt-3">
                  <FormulaireAnnulationMission orgId={orgId} interventionId={mission.id} />
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── La mise en concurrence ouverte ──────────────────────────────── */}
      {consultationOuverte && (
        <ConsultationOuverte
          orgId={orgId}
          consultation={consultationOuverte}
          sollicitations={sollicitations.filter(
            (s) => s.consultation_id === consultationOuverte.id
          )}
          devis={devis}
          affectables={affectables}
          noteDe={noteDe}
          nom={nom}
          aujourdhui={aujourdhui}
          codePostal={codePostal}
        />
      )}

      {/* ─── Ouvrir une (nouvelle) mise en concurrence ───────────────────── */}
      {!consultationOuverte && etat === "qualifie" && (
        <Card className="border-l-[3px] border-l-[var(--or)]">
          <CardHeader>
            <p className="eyebrow" style={{ color: "var(--or-texte)" }}>
              {consultations.length > 0 ? "Réaffecter" : "Confier à un artisan"}
            </p>
            <CardDescription>
              Un incident peut aussi se clore sans artisan — un conseil au
              téléphone suffit parfois. Si des travaux s&apos;imposent, mettez
              deux entreprises en concurrence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireConsultation
              orgId={orgId}
              incidentId={incidentId}
              categorieLibelle={
                categorieIncident(categorie)?.libelle ?? titreIncident(categorie)
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Les tours précédents restent au dossier : deux consultations sur un
          même incident racontent une réaffectation, pas un doublon. */}
      {consultations.filter((c) => c.statut !== "ouverte").length > 0 && (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            {consultations.filter((c) => c.statut !== "ouverte").length} mise
            {consultations.filter((c) => c.statut !== "ouverte").length > 1 ? "s" : ""} en
            concurrence close
            {consultations.filter((c) => c.statut !== "ouverte").length > 1 ? "s" : ""} sur
            ce dossier — le détail des devis et des refus est dans la chronologie.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// La mise en concurrence ouverte : qui a été sollicité, ce qu'ils ont répondu,
// et les devis côte à côte.
function ConsultationOuverte({
  orgId,
  consultation,
  sollicitations,
  devis,
  affectables,
  noteDe,
  nom,
  aujourdhui,
  codePostal,
}: {
  orgId: string;
  consultation: Consultation;
  sollicitations: Sollicitation[];
  devis: Devis[];
  affectables: Affectable[];
  noteDe: Map<string, Affectable>;
  nom: (id: string) => string;
  aujourdhui: string;
  codePostal: string | null;
}) {
  // RM-9.1.1 : deux au maximum EN PARALLÈLE — ce sont les sollicitations
  // vivantes qui comptent, pas celles qu'un artisan a déclinées.
  const vivantes = sollicitations.filter((s) =>
    ["envoyee", "devis_depose", "retenue"].includes(s.statut)
  );
  const idsSollicites = new Set(sollicitations.map((s) => s.artisan_id));
  const devisDeLaConsultation = devis.filter((d) =>
    sollicitations.some((s) => s.id === d.sollicitation_id)
  );
  const comparables = devisDeLaConsultation.filter((d) => d.statut === "depose");
  const restants = affectables.filter((a) => !idsSollicites.has(a.artisan_id));

  return (
    <Card>
      <CardHeader>
        <div className="entete-carte !mb-0">
          <CardTitle className="text-base">Mise en concurrence</CardTitle>
          <span className="mono-discret">
            {vivantes.length} artisan{vivantes.length > 1 ? "s" : ""} sur 2
          </span>
        </div>
        <CardDescription>
          {METIERS_ARTISAN[consultation.metier] ?? consultation.metier} ·{" "}
          {NATURES_TRAVAUX[consultation.nature_travaux] ?? consultation.nature_travaux} ·
          devis valables {consultation.validite_jours} jours
          {/* La colonne est CALCULÉE en base à partir de la nature : la règle ne
              peut pas être décochée à la saisie (RM-8.3.1). */}
          {consultation.decennale_requise || decennaleRequise(consultation.nature_travaux)
            ? " · décennale exigée"
            : " · décennale non exigée pour ces travaux"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tranché le 2026-07-25 : le devis unique est permis, mais il ne se
            cache pas — le signal est affiché, ici et au rapport de gestion. */}
        {consultation.devis_unique_assume && (
          <div className="border-l-2 border-l-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning-soft-foreground)]">
            Devis unique assumé : ce dossier ne met pas les artisans en
            concurrence. Le propriétaire le verra écrit.
          </div>
        )}

        {/* Qui a été sollicité, et où en est chacun */}
        {sollicitations.length > 0 && (
          <div>
            <p className="libelle-champ mb-1">Artisans sollicités</p>
            {sollicitations.map((s) => (
              <div key={s.id} className="ligne-info">
                <span className="min-w-0 truncate">
                  {nom(s.artisan_id)}
                  {s.refus_motif && (
                    <span className="block text-xs text-muted-foreground">
                      « {s.refus_motif} »
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="mono-discret">{formaterDate(s.envoyee_le)}</span>
                  <span className={COULEURS_SOLLICITATION[s.statut] ?? "puce puce-grise"}>
                    {STATUTS_SOLLICITATION[s.statut] ?? s.statut}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* LA COMPARAISON — montants côte à côte, note de l'artisan à côté du
            prix (module 9). Triés du moins-disant au plus cher : c'est la
            lecture qu'on fait spontanément, et la base a déjà trié. */}
        {comparables.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="entete-carte">
              <p className="libelle-champ">
                {comparables.length} devis reçu{comparables.length > 1 ? "s" : ""}
              </p>
              {comparables.length === 1 && !consultation.devis_unique_assume && (
                <span className="puce puce-prep">Un seul devis</span>
              )}
            </div>
            {comparables.length === 1 && !consultation.devis_unique_assume && (
              <p className="mb-2 text-xs text-muted-foreground">
                Vous n&apos;avez qu&apos;une proposition : sollicitez un second
                artisan pour comparer, ou retenez celle-ci en connaissance de
                cause.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {comparables.map((d) => {
                const fiche = noteDe.get(d.artisan_id);
                const expire = devisExpire(d, aujourdhui);
                const moinsDisant =
                  comparables.length > 1 &&
                  d.montant_ttc_cents === Math.min(...comparables.map((x) => x.montant_ttc_cents));
                return (
                  <div
                    key={d.id}
                    className="space-y-2 rounded-md border border-border p-3"
                  >
                    <div className="entete-carte !mb-0">
                      <b className="min-w-0 truncate text-sm">{nom(d.artisan_id)}</b>
                      <span className={COULEURS_DEVIS[d.statut] ?? "puce puce-grise"}>
                        {STATUTS_DEVIS[d.statut] ?? d.statut}
                      </span>
                    </div>
                    <p className="chiffre montant font-heading text-2xl text-[var(--encre)]">
                      {montant(d.montant_ttc_cents)}
                    </p>
                    <div>
                      <div className="ligne-info">
                        <span>Note Gerimmo</span>
                        <span>
                          {/* RM-11 : la note n'est publiée qu'au-delà de trois
                              évaluations — avant, on dit « nouveau », on
                              n'affiche pas une moyenne de deux avis. */}
                          {fiche?.publiable && fiche.note_publiee != null
                            ? `${fiche.note_publiee} / 5 · ${fiche.nb_evaluations} avis`
                            : fiche
                              ? "Nouveau sur Gerimmo"
                              : "—"}
                        </span>
                      </div>
                      <div className="ligne-info">
                        <span>Valable jusqu&apos;au</span>
                        <span>{formaterDate(d.valide_jusqu_au)}</span>
                      </div>
                      {moinsDisant && (
                        <div className="ligne-info">
                          <span>Prix</span>
                          <span>Le moins-disant</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">« {d.description} »</p>
                    {d.document_id && (
                      <a
                        href={`/agence/${orgId}/documents/${d.document_id}/fichier`}
                        target="_blank"
                        rel="noreferrer"
                        className="lien-discret"
                      >
                        Ouvrir le devis
                      </a>
                    )}
                    {expire ? (
                      <p className="text-sm text-destructive">
                        Expiré le {formaterDate(d.valide_jusqu_au)} — caduc. Demandez
                        une proposition à jour.
                      </p>
                    ) : !fiche ? (
                      <p className="text-xs text-muted-foreground">
                        Cet artisan ne ressort plus de la recherche du jour
                        (décennale, zone, métier ou liste noire) : la sélection
                        sera refusée si son profil n&apos;est plus affectable.
                      </p>
                    ) : null}
                    {!expire && (
                      <BoutonRetenirDevis
                        orgId={orgId}
                        devisId={d.id}
                        raisonSociale={nom(d.artisan_id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Retenir un devis confie la mission : c&apos;est votre décision, pas
              celle du locataire. Le second artisan est écarté automatiquement.
            </p>
          </div>
        )}

        {/* ─── La recherche d'affectation ──────────────────────────────── */}
        {vivantes.length >= 2 ? (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Deux artisans sont déjà en lice — c&apos;est le maximum. Attendez leurs
            devis, ou retirez-en un en attendant sa réponse.
          </p>
        ) : (
          <div className="border-t border-border pt-3">
            <div className="entete-carte">
              <p className="libelle-champ">
                Artisans proposables{codePostal ? ` sur le ${codePostal}` : ""}
              </p>
              <span className="mono-discret">triés par score</span>
            </div>
            {restants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun artisan ne remonte pour ce métier
                {codePostal ? ` sur le code postal ${codePostal}` : ""}
                {consultation.decennale_requise ? " avec une décennale valide" : ""}.{" "}
                <Link href={`/agence/${orgId}/artisans`} className="lien-discret">
                  Enregistrez une entreprise dans votre carnet
                </Link>
                , ou changez la nature des travaux si vous vous êtes trompé.
              </p>
            ) : (
              restants.map((a) => (
                <div key={a.artisan_id} className="ligne-info">
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-medium">{a.raison_sociale}</b>
                    <span className="block text-xs text-muted-foreground">
                      {a.publiable && a.note_publiee != null
                        ? `${a.note_publiee} / 5 · ${a.nb_evaluations} avis`
                        : "Nouveau sur Gerimmo"}
                      {" · "}
                      {a.telephone}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {/* D'où il vient : de votre carnet, ou de l'annuaire de la
                        plateforme. C'est la notion `artisan_scope` du wiki,
                        déduite du rattachement — voir referentiel.ts. */}
                    <span className={COULEURS_SCOPE[scopeArtisan(a.rattache)]}>
                      {LIBELLES_SCOPE[scopeArtisan(a.rattache)]}
                    </span>
                    <BoutonSolliciter
                      orgId={orgId}
                      consultationId={consultation.id}
                      artisanId={a.artisan_id}
                      raisonSociale={a.raison_sociale}
                    />
                  </span>
                </div>
              ))
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Cette liste est déjà filtrée : métier, zone, validation Gerimmo,
              listes noires, et décennale valide quand ces travaux l&apos;exigent.
              Un artisan absent d&apos;ici ne peut pas être sollicité.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
