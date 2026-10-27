import { SuiviLotProprietaire } from "@/components/fenetre-lot";
import { FicheContinue } from "@/components/fiche-continue";
import { OngletsDossier } from "@/components/onglets-dossier";
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
import { archiveSignee, signatureDuBail } from "@/lib/presentation-signatures";
import { occupationLot } from "@/lib/occupation-lot";
import { type QualificationDiagnostic } from "@/lib/qualification-diagnostics";
import { bilanDiagnostics } from "@/lib/presentation-diagnostics";
import { avertissementsCoherenceLoyer } from "@/lib/coherence-loyer";
import { caracteristiquesManquantes } from "@/lib/avancement-lot";
import { dureeBailNuAnnees, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { AvertissementsLoyer } from "@/components/avertissements-loyer";
import styles from "./fiche-lot.module.css";
import parcoursStyles from "@/components/presentation-parcours.module.css";
import { SupprimerBailBrouillon } from "@/components/supprimer-bail-brouillon";
import Link from "next/link";
import { ParcoursLot } from "@/components/parcours-location";
import { FormulaireBien } from "../../../formulaire-bien";
import { FormulaireLot } from "./formulaire-lot";
import { FormulaireEquipementCatalogue } from "../../../formulaire-equipement-catalogue";
import { retourBailDuLot } from "@/lib/parcours-lot";
import { House, Users, FileText, MapPin, Wrench, ArrowRight, ArrowUpRight, Building2, ChevronDown, History, Ruler, DoorOpen, Layers3, Sofa, Wallet } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  alertesDecence,
  formaterSurface,
} from "@/lib/parc";
import { diagnosticsExigibles } from "@/lib/diagnostics";
import { formaterDate, eur } from "@/lib/ged";
import { ETATS_BAIL, COULEURS_ETAT_BAIL, TYPES_BAIL } from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import { LignesDiagnostics, type DiagnosticDepose } from "../../lignes-diagnostics";
import { RecapLot, LienModifierLot } from "./recap-lot";
import { PersonnesLot, IncidentsLot } from "./personnes-incidents-lot";
import { SectionLot } from "./section-lot";
import { BoutonsEtatLot } from "./boutons-etat-lot";
import {
  FormulaireDetention,
  BoutonCloreDetention,
  BoutonSupprimerDetention,
  BoutonRouvrirDetention,
} from "./formulaire-detention";
import { FormulaireEquipementsLot } from "./formulaire-equipements-lot";
import { FormulairePiecesLot, type PieceLot } from "./formulaire-pieces-lot";
import { ChambresLogement } from "./chambres-logement";
import { FormulaireBailLot } from "./formulaire-bail-lot";
import { AppelsCharges, type AppelCharge } from "./formulaire-appels-charges";
import { buttonVariants } from "@/components/ui/button";
import { EchecLecture, PageEchecLecture } from "../../../echec-lecture";
import { BlocagesLocation } from "../../../blocages-location";
import { AttentionFiche } from "@/components/fiche-parc";
import { exigerUuids } from "@/lib/identifiants";
import { baseEspace, racineEspace } from "@/lib/racine-espace";

export const metadata = { title: "Fiche lot — Gerimmo" };

export default async function PageLot(
  props: PageProps<"/agence/[orgId]/parc/[bienId]/lots/[lotId]">
) {
  const { orgId, bienId, lotId } = await props.params;
  // Conserver le lien direct vers la modification des caractéristiques.
  const { modifier, parcours, etape, retourBail, retourEtape } = ((await props.searchParams) ?? {}) as { modifier?: string; parcours?: string; etape?: string; retourBail?: string; retourEtape?: string };
  exigerUuids(bienId, lotId);
  const { supabase, role, user, estProprietaire, traverseeLectureSeule } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  if (traverseeLectureSeule && (parcours === "1" || modifier === "1")) redirect(`${base}/parc/${bienId}/lots/${lotId}#logement-lot`);
  if (parcours === "1" && ["bail", "locataires"].includes(etape ?? "")) redirect(`${base}/parc/${bienId}/lots/${lotId}${estProprietaire ? "#nouvelle-location" : "#baux"}`);

  const { data: chambres, error: erreurChambres } = await supabase.from("lot_chambres").select("*").eq("lot_id", lotId).eq("organization_id", orgId).order("nom");

  const [
    { data: lot, error: erreurLot },
    { data: bien, error: erreurBien },
    { data: detentions, error: erreurDetentions },
    { data: diagnostics, error: erreurDiagnostics },
    { data: diagnosticsBien, error: erreurDiagnosticsBien },
    { data: qualifications, error: erreurQualifications },
    { data: catalogue, error: erreurCatalogue },
    { data: equipesLot, error: erreurEquipesLot },
    { data: personnes, error: erreurPersonnes },
    { data: blocages, error: erreurBlocages },
    { data: baux, error: erreurBaux },
    { data: proprietaires, error: erreurProprietaires },
    { data: piecesLot, error: erreurPieces },
  ] = await Promise.all([
    supabase
      .from("lots")
      .select("*")
      .eq("id", lotId)
      .eq("bien_id", bienId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("biens")
      .select("id, nom, type, address_line1, address_line2, postal_code, city, annee_construction, copropriete, zone_tendue, commune_insee, parties_communes, acces_tic")
      .eq("id", bienId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("detentions")
      // !detentions_person_id_fkey : deux relations lient detentions à persons
      // depuis les FK composites (revue 2) — jointure explicite obligatoire
      .select(
        "id, person_id, quote_part, date_debut, date_fin, person:persons!detentions_person_id_fkey(nom, prenom, account_id, qualite)"
      )
      .eq("lot_id", lotId)
      .order("date_debut", { ascending: false }),
    supabase
      .from("diagnostics")
      .select("id, type, date_realisation, date_expiration, diagnostiqueur, document_id, classe_dpe")
      .eq("lot_id", lotId)
      .is("archived_at", null)
      .order("type"),
    // Les diagnostics rattachés au BIEN (ERP, termites, amiante des parties
    // communes). Relevé du 11/09 : l'ERP est un blocage de mise en location du
    // LOT (lot_blocages_location) qui ne se déposait que depuis la fiche bien —
    // aller-retour obligatoire entre deux fiches au milieu du parcours, alors
    // que `deposerDiagnostic` range lui-même le dépôt d'après le référentiel
    // (RM-0.6.2). Une requête de plus ici, et la préparation du lot ne quitte
    // plus sa fiche.
    supabase
      .from("diagnostics")
      .select("id, type, date_realisation, date_expiration, diagnostiqueur, document_id, classe_dpe")
      .eq("bien_id", bienId)
      .is("archived_at", null)
      .order("type"),
    supabase.from("qualifications_diagnostics_lot")
      .select("type, situation, date_installation, annee_installation").eq("organization_id", orgId).eq("lot_id", lotId),
    supabase
      .from("equipements_catalogue")
      .select("id, nom")
      .eq("organization_id", orgId)
      .eq("actif", true)
      .order("nom"),
    supabase.from("lot_equipements").select("equipement_id").eq("lot_id", lotId),
    supabase
      .from("persons")
      .select("id, nom, prenom")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("nom"),
    supabase.rpc("lot_blocages_location", { p_lot: lotId }),
    supabase
      .from("baux")
      .select("id, chambre_id, type, etat, document_signe, signe_envoye_le, locataire_principal, loyer_hc, charges, date_debut, date_fin, jour_echeance, depot_garantie, encadrement_loyer, loyer_reference, loyer_reference_majore, complement_loyer, complement_justification")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false }),
    supabase
      .from("detentions")
      .select("person_id")
      .eq("organization_id", orgId)
      .is("date_fin", null),
    supabase
      .from("lot_pieces")
      .select("id, nom")
      .eq("lot_id", lotId)
      .order("ordre")
      .order("created_at"),
  ]);
  // Lecture refusée : ni le lot ni le bien n'ont disparu (relevé du 11/09).
  if (erreurLot || erreurBien)
    return (
      <PageEchecLecture
        titre="Fiche lot"
        quoi={[erreurLot ? "le lot" : "", erreurBien ? "le bien" : ""].filter(Boolean)}
        retour={{ href: `${base}/parc/${bienId}`, libelle: "Fiche bien" }}
      />
    );
  if (!lot || !bien) notFound();
  const suiviSignatures = await lirePresentationSignatures(orgId, { baux: (baux ?? []).filter(b => b.etat === "brouillon").map(b => b.id) });
  const archiveBail = (b: { id: string; document_signe: string | null }) => b.document_signe ?? archiveSignee(signatureDuBail(suiviSignatures.circuits, b.id));
  const libelleEtatBail = (b: { id: string; etat: string; document_signe: string | null }) => b.etat === "brouillon" && archiveBail(b) ? "Bail signé" : b.etat === "brouillon" && suiviSignatures.erreur ? "Signature à vérifier" : ETATS_BAIL[b.etat] ?? b.etat;

  // Appels de charges de copropriété (module 0c) — uniquement si le bien est en copropriété
  const { data: appelsRaw, error: erreurAppels } = bien.copropriete
    ? await supabase
        .from("appels_charges")
        .select(
          "id, exercice, date_reception, total, statut, document_id, postes:appel_charges_postes(id, libelle, montant, nature, fonds_alur, propose)"
        )
        .eq("lot_id", lotId)
        .order("exercice", { ascending: false })
    : { data: [], error: null };
  const appelsCharges = ((appelsRaw ?? []) as AppelCharge[]).map((a) => ({
    ...a,
    postes: [...(a.postes ?? [])].sort((x, y) => x.libelle.localeCompare(y.libelle)),
  }));

  const detentionsActives = (detentions ?? []).filter((d) => !d.date_fin);
  const nbChambres = chambres?.length ?? 0;
  const colocationPertinente =
    !["parking", "local", "terrain"].includes(bien.type ?? "") ||
    nbChambres > 0 ||
    lot.colocation_loyer_reference != null ||
    Boolean(erreurChambres);
  const totalQuoteParts = detentionsActives.reduce(
    (s, d) => s + Number(d.quote_part),
    0
  );
  // Diagnostics exigibles, par niveau de rattachement — calcul centralisé
  // (lib/diagnostics, audit 09/09). Les deux niveaux sont rendus ici : ceux du
  // lot, et ceux de l'immeuble (ils restent portés par le bien en base).
  const exigiblesLot = diagnosticsExigibles(bien, "lot");
  const exigiblesBien = diagnosticsExigibles(bien, "bien");
  const bilanLot = bilanDiagnostics(exigiblesLot.map(e => e.type), diagnostics ?? [], (qualifications ?? []) as QualificationDiagnostic[]);
  const bilanBien = bilanDiagnostics(exigiblesBien.map(e => e.type), diagnosticsBien ?? []);
  const manquants = exigiblesLot.filter(e => bilanLot.lignes.some(l => l.type === e.type && ["a_ajouter", "a_joindre"].includes(l.etat)));
  const manquantsBien = exigiblesBien.filter(e => bilanBien.lignes.some(l => l.type === e.type && ["a_ajouter", "a_joindre"].includes(l.etat)));
  const bilan = {
    aJour: bilanLot.aJour + bilanBien.aJour,
    aVerifier: bilanLot.aVerifier + bilanBien.aVerifier,
    aAjouter: bilanLot.aAjouter + bilanBien.aAjouter,
    aRenouveler: bilanLot.aRenouveler + bilanBien.aRenouveler,
    aConfirmer: bilanLot.aConfirmer + bilanBien.aConfirmer,
  };
  const decence = ["appartement", "maison", "immeuble"].includes(bien.type) ? alertesDecence(lot) : [];
  // « L'immeuble » ne se dit que d'un immeuble (24/09) : sur un appartement,
  // les diagnostics communs (ERP, termites…) sont ceux « du bien ».
  const duBien = bien.type === "immeuble" ? "de l’immeuble" : "du bien";
  const verrouille = ["loue", "preavis"].includes(lot.etat);

  const nomPersonne = (p: { nom: string; prenom: string | null } | null) =>
    p ? nomComplet(p) : "—";

  // Recette 21/08 : la fiche lot se lit d'un coup d'œil — propriétaires
  // mandants (détentions en cours) et locataire du bail en cours dans le récap.
  const nomsParId = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      nomComplet(p),
    ])
  );
  const bauxEnCours = (baux ?? []).filter((b) => ["actif", "preavis"].includes(b.etat));
  const bailEnCours = bauxEnCours[0];
  const recapLocataire = bailEnCours?.locataire_principal
    ? nomsParId.get(bailEnCours.locataire_principal)
    : undefined;

  // Ce que la base n'a pas rendu : « aucun diagnostic », « aucun bail »,
  // « 0 % de détention » sont des verdicts — pas quand la lecture a échoué.
  const echecs: string[] = [];
  const noter = (libelle: string, erreur: unknown) => {
    if (erreur) echecs.push(libelle);
  };
  noter("les propriétaires du lot", erreurDetentions);
  noter("les diagnostics", erreurDiagnostics);
  noter("les installations de gaz et d’électricité", erreurQualifications);
  noter("les chambres du lot", erreurChambres);
  noter(`les diagnostics ${duBien}`, erreurDiagnosticsBien);
  noter("le catalogue d’équipements", erreurCatalogue);
  noter("les équipements du lot", erreurEquipesLot);
  noter("les personnes de l’agence", erreurPersonnes);
  noter("ce qui bloque la mise en location", erreurBlocages);
  noter("les baux", erreurBaux);
  noter("le suivi des signatures", suiviSignatures.erreur);
  noter("les propriétaires déjà connus de l’agence", erreurProprietaires);
  noter("les pièces du lot", erreurPieces);
  noter("les appels de charges", erreurAppels);

  const nbEquip = (equipesLot ?? []).length;
  const nbDiag = (diagnostics ?? []).length;
  const nbDiagBien = (diagnosticsBien ?? []).length;
  const nbBaux = (baux ?? []).length;

  // Ce qui attend un geste, réuni EN HAUT et dit une seule fois. Le relevé du
  // 11/09 : l'état du lot était répété quatre fois (la pastille du titre, la
  // prose pédagogique, « Ce lot est loué », « État actuel : Loué »), tandis que
  // ce qui manquait vraiment se lisait en petit, dans la sixième rangée.
  const attention: { cle: string; texte: string; ancre?: string; href?: string }[] = [];
  for (const a of decence) attention.push({ cle: `decence-${a}`, texte: a });
  if (!erreurDetentions && totalQuoteParts !== 100) {
    attention.push({
      cle: "detention",
      texte: `La propriété n’est répartie qu’à ${totalQuoteParts} % : le lot ne se loue pas tant qu’elle n’atteint pas 100 %.`,
      ancre: "detention",
    });
  }
  if (!erreurDiagnostics && manquants.length > 0) {
    attention.push({
      cle: "diagnostics",
      // « du lot », comme la section où mène « Régler » (24/09)
      texte: `Diagnostic${manquants.length > 1 ? "s" : ""} du lot à déposer : ${manquants
        .map((m) => m.libelle)
        .join(", ")}.`,
      ancre: "diagnostics",
    });
  }
  if (!erreurDiagnosticsBien && manquantsBien.length > 0) {
    attention.push({
      cle: "diagnostics-immeuble",
      texte: `Diagnostic${manquantsBien.length > 1 ? "s" : ""} ${duBien} à déposer : ${manquantsBien
        .map((m) => m.libelle)
        .join(", ")}.`,
      ancre: "diagnostics-immeuble",
    });
  }
  if (!erreurPieces && !erreurChambres && (piecesLot ?? []).length === 0 && (chambres ?? []).length === 0) {
    attention.push({
      cle: "pieces",
      texte: "Aucune pièce définie : l’état des lieux n’aura pas de grille à remplir.",
      ancre: "pieces",
    });
  }
  // Mêmes contrôles que la liste des biens (« Compléter : caractéristiques ») : la fiche dit
  // ce qui manque et ouvre directement le formulaire du lot (audit #264, FL-05).
  const caracteristiquesAFaire = caracteristiquesManquantes(lot, bien.type);
  if (caracteristiquesAFaire.length > 0) {
    attention.push({
      cle: "caracteristiques",
      texte: `Caractéristiques du logement à renseigner : ${caracteristiquesAFaire.join(", ").toLowerCase()}.`,
      ancre: "caracteristiques",
      href: traverseeLectureSeule ? undefined : `${base}/parc/${bienId}/lots/${lotId}?modifier=1#caracteristiques`,
    });
  }

  const loyerCc =
    bailEnCours?.loyer_hc != null
      ? Number(bailEnCours.loyer_hc) + Number(bailEnCours.charges ?? 0)
      : null;
  const totalLoyers = bauxEnCours.reduce((total, bail) => total + Number(bail.loyer_hc ?? 0) + Number(bail.charges ?? 0), 0);
  // Plusieurs contrats en cours : le résumé additionne, il ne présente jamais le
  // loyer ni l'entrée d'un seul contrat sous « N contrats en cours » (audit #264, FL-06).
  const plusieursEnCours = bauxEnCours.length > 1;

  const rubriqueDetention = (<SectionLot ouvertParDefaut={estProprietaire || parcours === "1"}
            id="detention"
            titre={
              role === "proprietaire_direct"
                ? "Détention & quotes-parts"
                : "Propriétaires mandants du lot"
            }
            alerte={totalQuoteParts !== 100 ? `${totalQuoteParts} % sur 100 %` : undefined}
            resume={
              detentionsActives.length === 0
                ? "Aucun propriétaire"
                : `${totalQuoteParts} % — ${detentionsActives
                    .map((d) =>
                      nomPersonne(d.person as unknown as { nom: string; prenom: string | null })
                    )
                    .join(", ")}`
            }
          >
            <div className="space-y-4">
              <p
                className={`text-sm ${totalQuoteParts === 100 ? "text-success-soft-foreground" : "text-warning-soft-foreground"}`}
              >
                Détention active : {totalQuoteParts} %
              </p>
              {(detentions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {role === "proprietaire_direct"
                    ? "Aucune détention enregistrée. Le lot ne pourra pas être mis en location tant que la propriété n'est pas répartie à 100 % — en indivision, chaque quote-part compte pour votre récapitulatif fiscal."
                    : "Aucun propriétaire mandant enregistré. Le lot ne pourra pas être mis en location tant que la propriété n'est pas répartie à 100 %."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(detentions ?? []).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span
                        className={`min-w-0 flex-1 truncate ${d.date_fin ? "text-muted-foreground line-through" : ""}`}
                      >
                        {nomPersonne(d.person as unknown as { nom: string; prenom: string | null })}
                      </span>
                      <span className="shrink-0">{Number(d.quote_part)} %</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formaterDate(d.date_debut)}
                        {d.date_fin ? ` → ${formaterDate(d.date_fin)}` : ""}
                      </span>
                      {!traverseeLectureSeule && !d.date_fin && (
                        <BoutonCloreDetention
                          orgId={orgId}
                          bienId={bienId}
                          lotId={lotId}
                          detentionId={d.id}
                        />
                      )}
                      {!traverseeLectureSeule && !d.date_fin && (baux ?? []).length === 0 && (
                        /* Ce bouton SUPPRIME : au doigt, on l'écarte de
                           « Fermer » pour éviter le tap voisin. */
                        <span className="pointer-coarse:ml-2">
                          <BoutonSupprimerDetention
                            orgId={orgId}
                            bienId={bienId}
                            lotId={lotId}
                            detentionId={d.id}
                            proprietaire={nomPersonne(d.person as unknown as { nom: string; prenom: string | null })}
                            quotePart={Number(d.quote_part)}
                          />
                        </span>
                      )}
                      {!traverseeLectureSeule && d.date_fin && (
                        <BoutonRouvrirDetention
                          orgId={orgId}
                          bienId={bienId}
                          lotId={lotId}
                          detentionId={d.id}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!traverseeLectureSeule && <FormulaireDetention
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                personnes={personnes ?? []}
                proprietairesIds={[...new Set((proprietaires ?? []).map((d) => d.person_id))]}
                premierProprietaire={detentionsActives.length === 0}
                estProprietaire={estProprietaire}
              />}
            </div>
          </SectionLot>);
  const rubriqueDiagnostics = (<SectionLot ouvertParDefaut
            id="diagnostics"
            titre="Diagnostics du lot"
            // Le titre dit déjà le niveau : la pastille ne le répète pas
            // entre parenthèses, et le résumé ne redit pas ce qui manque — le
            // bandeau du haut le dit, avec « Régler » (24/09).
            alerte={erreurDiagnostics ? "Lecture à réessayer" : bilanLot.aAjouter ? `${bilanLot.aAjouter} à ajouter` : undefined}
            resume={
              nbDiag === 0
                ? "Aucun diagnostic déposé"
                : `${nbDiag} déposé${nbDiag > 1 ? "s" : ""}`
            }
          >
            <div className="space-y-3">
              {(!estProprietaire || parcours === "1") && <p className="text-xs text-muted-foreground">Documents propres à ce logement.</p>}
              {erreurDiagnostics ? <p role="alert">Documents indisponibles. Réessayez pour connaître leur état.</p> : <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                lectureSeule={traverseeLectureSeule}
                niveau="lot"
                compact={estProprietaire && parcours !== "1"}
                qualifications={(qualifications ?? []) as QualificationDiagnostic[]}
                qualificationIndisponible={Boolean(erreurQualifications)}
                attendus={exigiblesLot.map((e) => e.type)}
                diagnostics={(diagnostics ?? []) as DiagnosticDepose[]}
              />}
            </div>
          </SectionLot>);
  const rubriqueDiagnosticsImmeuble = (<SectionLot ouvertParDefaut
            id="diagnostics-immeuble"
            titre={`Diagnostics ${duBien}`}
            alerte={erreurDiagnosticsBien ? "Lecture à réessayer" : bilanBien.aAjouter ? `${bilanBien.aAjouter} à ajouter` : undefined}
            resume={
              nbDiagBien === 0
                ? "Aucun diagnostic déposé"
                : `${nbDiagBien} déposé${nbDiagBien > 1 ? "s" : ""}`
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Un seul dépôt pour tous les lots de « {bien.nom} ».
              </p>
              {erreurDiagnosticsBien ? <p role="alert">Documents indisponibles. Réessayez pour connaître leur état.</p> : <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                lectureSeule={traverseeLectureSeule}
                niveau="bien"
                compact={estProprietaire && parcours !== "1"}
                attendus={exigiblesBien.map((e) => e.type)}
                diagnostics={(diagnosticsBien ?? []) as DiagnosticDepose[]}
              />}
            </div>
          </SectionLot>);
  const rubriqueEquipements = (<SectionLot ouvertParDefaut={parcours === "1"}
            id="equipements"
            titre="Équipements"
            resume={
              // Le logement, pas la case du formulaire (24/09)
              nbEquip === 0
                ? "Aucun équipement renseigné"
                : `${nbEquip} équipement${nbEquip > 1 ? "s" : ""} renseigné${nbEquip > 1 ? "s" : ""}`
            }
          >
            {traverseeLectureSeule ? <ul className="space-y-2 text-sm">{(catalogue ?? []).filter(e => (equipesLot ?? []).some(s => s.equipement_id === e.id)).map(e => <li key={e.id}>{e.nom}</li>)}{nbEquip === 0 && <li>Aucun équipement renseigné.</li>}</ul> : <FormulaireEquipementsLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              catalogue={catalogue ?? []}
              selection={(equipesLot ?? []).map((e) => e.equipement_id)}
            />}
          </SectionLot>);
  const rubriquePieces = (<SectionLot ouvertParDefaut={parcours === "1"}
            id="pieces"
            titre="Pièces (état des lieux)"
            alerte={(piecesLot ?? []).length === 0 ? "À définir" : undefined}
            resume={
              (piecesLot ?? []).length === 0
                ? "Aucune pièce définie"
                : (piecesLot as PieceLot[]).map((p) => p.nom).join(", ")
            }
          >
            {traverseeLectureSeule ? <ul className="space-y-2 text-sm">{(piecesLot ?? []).map(p => <li key={p.id}>{p.nom}</li>)}{!piecesLot?.length && <li>Aucune pièce renseignée.</li>}</ul> : <FormulairePiecesLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              pieces={(piecesLot ?? []) as PieceLot[]}
            />}
          </SectionLot>);
  const rubriqueBaux = (<SectionLot
            id="baux"
            titre="Baux & état des lieux"
            // L’onglet ouvre directement les contrats et leur formulaire.
            ouvertParDefaut
            resume={
              nbBaux === 0
                ? "Aucun bail"
                : `${nbBaux > 1 ? `${nbBaux} baux` : "1 bail"} · ${(baux ?? [])
                    .map(libelleEtatBail)
                    .join(", ")}`
            }
          >
            <div className="space-y-4">
              {(baux ?? []).length > 0 && (
                <ul className={styles.bauxListe}>
                  {(baux ?? []).map((b) => (
                    <li key={b.id} className={styles.bailLigne}>
                      <span className={b.etat === "brouillon" && archiveBail(b) ? "puce puce-loue" : COULEURS_ETAT_BAIL[b.etat] ?? "puce puce-grise"}>
                        {libelleEtatBail(b)}
                      </span>
                      {/* Recette 21/08 puis 22/08 : la vue macro dit qui
                          habite, pour combien et depuis quand — avant
                          d'ouvrir. */}
                      <div className={styles.bailTexte}>
                        {b.etat === "brouillon" && archiveBail(b) && <span className={styles.activationAttente}>Location non activée</span>}
                        Bail {b.chambre_id ? `individuel · ${chambres?.find(c => c.id === b.chambre_id)?.nom ?? "chambre"}` : (TYPES_BAIL[b.type] ?? b.type).toLowerCase()}
                        {b.locataire_principal && nomsParId.get(b.locataire_principal)
                          ? ` — ${nomsParId.get(b.locataire_principal)}`
                          : ""}
                        {(b.loyer_hc != null || b.date_debut || b.date_fin) && (
                          <span className={styles.bailDetails}>
                            {[
                              b.loyer_hc != null
                                ? `${eur(Number(b.loyer_hc) + Number(b.charges ?? 0))} charges comprises`
                                : null,
                              b.date_debut ? `entrée le ${formaterDate(b.date_debut)}` : null,
                              b.date_fin ? `fin le ${formaterDate(b.date_fin)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      <AvertissementsLoyer avertissements={avertissementsCoherenceLoyer(b, lot.surface_m2)} />
                      </div>
                      <div className={styles.bailActions}>
                      <Link
                        href={`${base}/baux/${b.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Ouvrir
                      </Link>
                      {!traverseeLectureSeule && b.etat === "brouillon" && !archiveBail(b) && !suiviSignatures.erreur && !b.signe_envoye_le && <SupprimerBailBrouillon orgId={orgId} bailId={b.id} libelle={[lot.nom, TYPES_BAIL[b.type] ?? b.type, b.locataire_principal ? nomsParId.get(b.locataire_principal) : null, b.date_debut ? `Entrée le ${formaterDate(b.date_debut)}` : null].filter(Boolean).join(" · ")} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {traverseeLectureSeule ? <p className="text-sm text-muted-foreground">Les contrats se préparent et s’activent depuis le compte propriétaire.</p> : detentionsActives.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Ajoutez les propriétaires du lot avant de créer un bail. Le locataire sera choisi dans le parcours du bail.
                  </p>
                  {/* Le message dit où aller : la section Détention de cette
                      fiche, et la création de la fiche du locataire. */}
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    <a href="#detention" className="lien-discret">
                      Ajouter un propriétaire →
                    </a>

                  </p>
                </div>
              ) : (
                (baux ?? []).some(b => b.etat === "brouillon") ? <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Préparer un autre contrat — facultatif</summary><div className="mt-3">
                <FormulaireBailLot
                  parcours={parcours === "1"}
                  orgId={orgId}
                  bienId={bienId}
                  lotId={lotId}
                  // Le propriétaire du lot n'est pas son locataire (audit du
                  // 27/09) : « Moreau Claire » se voyait proposée comme
                  // locataire principal de son propre bien.
                  personnes={(personnes ?? []).filter(
                    (p) => !detentionsActives.some((d) => d.person_id === p.id)
                  )}
                  chambres={chambres ?? []}
                />
                </div></details> : <>
                <FormulaireBailLot
                  parcours={parcours === "1"}
                  orgId={orgId}
                  bienId={bienId}
                  lotId={lotId}
                  // Le propriétaire du lot n'est pas son locataire (audit du
                  // 27/09) : « Moreau Claire » se voyait proposée comme
                  // locataire principal de son propre bien.
                  personnes={(personnes ?? []).filter(
                    (p) => !detentionsActives.some((d) => d.person_id === p.id)
                  )}
                  chambres={chambres ?? []}
                />
                </>
              )}
            </div>
          </SectionLot>);
  // Le brouillon à reprendre est le plus avancé (signé, puis le plus renseigné), à défaut le plus ancien :
  // un contrat vide ouvert par erreur ne masque plus celui qu'on a commencé (audit #264, CB-02).
  const remplissage = (b: NonNullable<typeof baux>[number]) => [b.locataire_principal, b.date_debut, b.loyer_hc, b.chambre_id].filter(v => v != null).length;
  const bauxBrouillons = (baux ?? []).filter(b => b.etat === "brouillon").reverse()
    .sort((a, b) => Number(Boolean(archiveBail(b))) - Number(Boolean(archiveBail(a))) || remplissage(b) - remplissage(a));
  const bailAReprendre = bauxBrouillons[0];
  const bailPrincipal = bailEnCours ?? bailAReprendre;
  const signeAActiver = !bailEnCours && bailAReprendre ? archiveBail(bailAReprendre) : null;
  const hrefBailPrincipal = bailPrincipal ? `${base}/baux/${bailPrincipal.id}` : "#baux";
  const libelleBailPrincipal = bailEnCours ? "Ouvrir le bail" : signeAActiver ? "Consulter le bail signé" : bailAReprendre ? "Reprendre le bail" : "Préparer un bail";
  // En-tête du propriétaire : un contrat en préparation se reprend, un contrat en cours s'ouvre.
  // Créer un autre contrat reste possible, en geste secondaire, dans la carte du bail (audit #264, FL-02 / CB-02).
  const signeAReprendre = bailAReprendre ? archiveBail(bailAReprendre) : null;
  const actionEnTete = bailAReprendre ? { href: `${base}/baux/${bailAReprendre.id}${signeAReprendre ? "#etape-bail-7" : ""}`, libelle: signeAReprendre ? "Consulter et activer" : "Reprendre le bail" }
    : bauxEnCours.length === 1 ? { href: `${base}/baux/${bauxEnCours[0].id}`, libelle: "Ouvrir le bail" }
    : bauxEnCours.length > 1 ? { href: "#baux", libelle: `Voir les ${bauxEnCours.length} baux` } : null;
  const personnesLocataires = (personnes ?? []).filter(p => !detentionsActives.some(d => d.person_id === p.id));
  const creationSecondaire = !traverseeLectureSeule && lot.etat !== "archive" && detentionsActives.length > 0 && actionEnTete !== null;
  const valeurLogement = (valeur: string | number | null | undefined) => valeur == null || String(valeur).trim() === "" ? "Non renseigné" : valeur;

  const faitsLot = <dl className={styles.identiteFaits}>
          <div><dt><Ruler size={14} aria-hidden="true" />Surface</dt><dd>{lot.surface_m2 == null ? "À renseigner" : formaterSurface(lot.surface_m2)}</dd></div>
          <div><dt><DoorOpen size={14} aria-hidden="true" />Pièces</dt><dd>{lot.pieces ?? "À renseigner"}</dd></div>
          <div><dt><Layers3 size={14} aria-hidden="true" />Étage</dt><dd>{valeurLogement(lot.etage)}</dd></div>
          <div><dt><Sofa size={14} aria-hidden="true" />Mobilier</dt><dd>{lot.meuble ? "Meublé" : "Non meublé"}</dd></div>
        </dl>;
  const carteLogement = <section className={styles.panneau} data-ton="bleu" aria-label="Le logement">
        <div id="caracteristiques" className="scroll-mt-24"><RecapLot key={modifier ?? "lecture"} orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={bien.copropriete} typeBien={bien.type} modifierInitial={modifier === "1"} lectureSeule={traverseeLectureSeule} titre={estProprietaire ? "Le logement" : undefined} boutonModifier={!estProprietaire} faits={estProprietaire ? faitsLot : undefined} manquants={caracteristiquesAFaire} /></div>
        {estProprietaire ? <div className={styles.descriptionLogement}>
          <section id={traverseeLectureSeule || erreurPieces ? "pieces" : undefined} className={styles.inventaire}>
            <h3>Pièces pour l’état des lieux</h3>
            {erreurPieces ? <p role="alert">Pièces indisponibles.</p> : piecesLot?.length ? <ul className={styles.etiquettes}>{piecesLot.map(piece => <li key={piece.id}>{piece.nom}</li>)}</ul> : <p className={styles.texteVide}>La liste des pièces reste à préciser.</p>}
            {!traverseeLectureSeule && !erreurPieces && <details id="pieces" className={styles.editionDiscrete}><summary>{piecesLot?.length ? "Modifier les pièces" : "Définir les pièces"}<ChevronDown size={14} aria-hidden="true" /></summary><div><FormulairePiecesLot orgId={orgId} bienId={bienId} lotId={lotId} pieces={(piecesLot ?? []) as PieceLot[]} /></div></details>}
          </section>
          <section id={traverseeLectureSeule || erreurCatalogue || erreurEquipesLot ? "equipements" : undefined} className={styles.inventaire}>
            <h3>Équipements</h3>
            {erreurEquipesLot || erreurCatalogue ? <p role="alert">Équipements indisponibles.</p> : nbEquip ? <ul className={styles.etiquettes}>{(catalogue ?? []).filter(e => (equipesLot ?? []).some(selection => selection.equipement_id === e.id)).map(e => <li key={e.id}>{e.nom}</li>)}</ul> : <p className={styles.texteVide}>Aucun équipement renseigné.</p>}
            {!traverseeLectureSeule && !erreurEquipesLot && !erreurCatalogue && <details id="equipements" className={styles.editionDiscrete}><summary>{nbEquip ? "Modifier les équipements" : "Ajouter des équipements"}<ChevronDown size={14} aria-hidden="true" /></summary><div><FormulaireEquipementsLot orgId={orgId} bienId={bienId} lotId={lotId} catalogue={catalogue ?? []} selection={(equipesLot ?? []).map(e => e.equipement_id)} /></div></details>}
          </section>
        </div> : <div className="mt-4">{rubriquePieces}{rubriqueEquipements}</div>}
      </section>;
  const carteBatiment = <section className={styles.panneau} data-ton="vert" aria-labelledby="titre-batiment-lot">
          <header className={styles.panneauEntete} data-ton="vert"><span className={styles.panneauIcone}><Building2 size={18} aria-hidden="true" /></span><h2 id="titre-batiment-lot">Le bâtiment</h2></header>
          <dl className={styles.infosApercu}>
            <div><dt>Construction</dt><dd>{valeurLogement(bien.annee_construction)}</dd></div>
            <div><dt>Copropriété</dt><dd>{bien.copropriete ? "Oui" : "Non"}</dd></div>
            <div><dt>Parties communes</dt><dd>{valeurLogement(bien.parties_communes)}</dd></div>
            <div><dt>Internet, téléphone, TV</dt><dd>{valeurLogement(bien.acces_tic)}</dd></div>
          </dl>
          {!traverseeLectureSeule && <div className="mt-4"><SectionLot id="batiment" titre="Modifier l’adresse et le bâtiment" resume={[bien.address_line1, bien.city].filter(Boolean).join(" · ")}><FormulaireBien orgId={orgId} bien={bien} /></SectionLot></div>}
        </section>;
  const logement = <div className={styles.apercuGrille}>{carteLogement}<div className={styles.colonneApercu}>{carteBatiment}{!estProprietaire && <section className={styles.panneau} data-ton="or">{rubriqueDetention}</section>}</div></div>;
  const vueEnsemble = <div className={styles.apercu}>
    <section className={styles.locationResume} data-signe={Boolean(signeAActiver)} id="location-apercu" aria-labelledby="titre-location-lot">
      <span className={styles.iconeLocation}><FileText size={22} aria-hidden="true" /></span>
      <div className={styles.locationTexte}>
        <span className={styles.surtitre}>{bailEnCours ? "Location en cours" : signeAActiver ? "Bail signé" : bailAReprendre && suiviSignatures.erreur ? "Suivi du bail" : bailAReprendre ? "Bail en préparation" : "Votre location"}</span>
        <h2 id="titre-location-lot">{erreurBaux ? "Les baux sont indisponibles" : bauxEnCours.length > 1 ? `${bauxEnCours.length} contrats en cours` : bailEnCours ? recapLocataire ?? "Bail actif" : signeAActiver ? "Location non activée" : bailAReprendre && suiviSignatures.erreur ? "Signature à vérifier" : bailAReprendre ? "Votre bail vous attend" : lot.etat === "archive" ? "Ce lot est archivé" : "Préparez la prochaine location"}</h2>
        <p>{erreurBaux ? "Réessayez pour retrouver les contrats de ce lot." : plusieursEnCours ? bauxEnCours.map(b => (b.locataire_principal && nomsParId.get(b.locataire_principal)) || (b.chambre_id ? chambres?.find(c => c.id === b.chambre_id)?.nom : null) || "Locataire non renseigné").join(" · ") : bailPrincipal ? [
          bailAReprendre && !bailEnCours && bailAReprendre.locataire_principal ? nomsParId.get(bailAReprendre.locataire_principal) : null,
          `Bail ${(TYPES_BAIL[bailPrincipal.type] ?? bailPrincipal.type).toLowerCase()}`,
          bailPrincipal.date_debut ? `Entrée ${bailAReprendre && !bailEnCours ? "prévue " : ""}le ${formaterDate(bailPrincipal.date_debut)}` : "Date d’entrée à préciser",
          bauxBrouillons.length > 1 && !bailEnCours ? `Le plus avancé des ${bauxBrouillons.length} contrats à préparer ou activer` : null,
        ].filter(Boolean).join(" · ") : lot.etat === "archive" ? "Retrouvez les informations et l’historique de ce logement." : "Les informations du logement seront reprises dans le bail."}</p>
        {signeAActiver && <p>Le contrat signé est archivé. {traverseeLectureSeule ? "Le propriétaire doit encore activer la location." : "La location attend votre activation."}</p>}
        {plusieursEnCours && !erreurBaux ? <p><strong>{eur(totalLoyers)} / mois</strong> · charges comprises, au total pour {bauxEnCours.length} contrats</p> : loyerCc !== null && !erreurBaux && <p><strong>{eur(loyerCc)} / mois</strong> · charges comprises</p>}
      </div>
      {!erreurBaux && <div className={styles.locationActions}>
        {plusieursEnCours ? <a href="#baux" className="btn-or">Voir les {nbBaux} baux<ArrowRight size={15} aria-hidden="true" /></a> : <Link href={lot.etat === "archive" ? "#baux" : signeAActiver ? `${hrefBailPrincipal}#etape-bail-7` : hrefBailPrincipal} className="btn-or">{lot.etat === "archive" ? "Consulter les baux" : libelleBailPrincipal}<ArrowRight size={15} aria-hidden="true" /></Link>}
        {nbBaux > 1 && !plusieursEnCours && <a href="#baux">Voir les {nbBaux} baux</a>}
      </div>}
    </section>
    <div className={styles.apercuGrille}>        <section className={styles.panneau} data-ton="or" aria-labelledby="titre-proprietaires-lot">
          <header className={styles.panneauEntete} data-ton="or"><span className={styles.panneauIcone}><Users size={18} aria-hidden="true" /></span><h2 id="titre-proprietaires-lot">Propriétaires</h2></header>
          {erreurDetentions ? <p className={styles.texteVide}>Lecture à réessayer.</p> : detentionsActives.length ? <ul className={styles.proprietaires}>{detentionsActives.map(d => {
            const personne = d.person as unknown as { nom: string; prenom: string | null } | null;
            const nom = nomPersonne(personne);
            return <li key={d.id}><span className={styles.avatar} aria-hidden="true">{personne ? [personne.prenom?.[0], personne.nom[0]].filter(Boolean).join("").toUpperCase() : "—"}</span><div><strong>{nom}</strong><small>Propriétaire du lot</small></div><span className={styles.quotePart}>{Number(d.quote_part)} %</span></li>;
          })}</ul> : <p className={styles.texteVide}>Aucun propriétaire rattaché.</p>}
          <a href="#detention" className="inline-flex min-h-11 items-center text-sm underline">{traverseeLectureSeule ? "Voir les propriétaires" : "Gérer les propriétaires"}</a>
        </section>
    <section className={styles.panneau} data-ton="vert" aria-labelledby="etat-documents">
      <header className={styles.panneauEntete} data-ton="vert"><span className={styles.panneauIcone}><FileText size={18} aria-hidden="true" /></span><h2 id="etat-documents">Diagnostics</h2></header>
      {erreurDiagnostics || erreurDiagnosticsBien ? <p>Documents indisponibles. Réessayez pour connaître leur état.</p> : <dl className={styles.etatDocuments}>
        <div data-ton="vert"><dt>Valides</dt><dd>{bilan.aJour}</dd></div>
        <div data-ton="ambre"><dt>Manquants</dt><dd>{bilan.aAjouter}</dd></div>
        <div data-ton="ambre"><dt>Expirés</dt><dd>{bilan.aRenouveler}</dd></div>
        <div><dt>À vérifier</dt><dd>{bilan.aVerifier}</dd></div>
      </dl>}
      <a href="#documents-lot" className="inline-flex min-h-11 items-center gap-2 text-sm underline">Voir chaque document <ArrowRight size={14} aria-hidden="true" /></a>
    </section></div>
    <Link href={`${base}/reseau?bien=${bienId}`} className="inline-flex min-h-11 items-center gap-2 text-sm"><Wrench size={18} aria-hidden="true" />Trouver un artisan <ArrowUpRight size={14} aria-hidden="true" /></Link>
  </div>;

  // La fiche propriétaire est un poste de travail : un contrat se lit une fois,
  // les anciens contrats sont repliés et une chambre préparée n'est jamais
  // présentée libre lorsqu'un bail porte déjà sur le logement entier.
  const occupation = occupationLot(chambres ?? [], baux ?? []);
  const anciensBaux = (baux ?? []).filter(b => !["actif", "preavis", "brouillon"].includes(b.etat));
  // Une chambre dont le contrat se prépare figure déjà dans « Baux à finaliser » (audit #264, FL-11).
  const chambresSansBail = occupation.logementEntierOccupe ? [] : (chambres ?? []).filter(chambre => !bauxEnCours.some(b => b.chambre_id === chambre.id) && !bauxBrouillons.some(b => b.chambre_id === chambre.id));
  const ligneBail = (b: NonNullable<typeof baux>[number]) => {
    const nomChambre = b.chambre_id ? chambres?.find(chambre => chambre.id === b.chambre_id)?.nom ?? "Chambre" : null;
    const locataire = b.locataire_principal ? nomsParId.get(b.locataire_principal) : null;
    const signe = b.etat === "brouillon" && Boolean(archiveBail(b));
    return <li key={b.id} className={styles.contratTravail}>
      <div className={styles.contratIdentite}>
        <div><h3>{locataire || (b.etat === "brouillon" ? "Locataire à préciser" : "Locataire non renseigné")}</h3><p>{[nomChambre, TYPES_BAIL[b.type] ?? b.type].filter(Boolean).join(" · ")}</p></div>
        <span className={signe ? "puce puce-loue" : COULEURS_ETAT_BAIL[b.etat] ?? "puce puce-grise"}>{libelleEtatBail(b)}</span>
      </div>
      <dl className={styles.contratFaits}>
        <div><dt>Loyer et charges / mois</dt><dd>{b.loyer_hc == null ? "À préciser" : eur(Number(b.loyer_hc) + Number(b.charges ?? 0))}</dd></div>
        <div><dt>Loyer hors charges</dt><dd>{b.loyer_hc == null ? "À préciser" : eur(Number(b.loyer_hc))}</dd></div>
        <div><dt>Charges</dt><dd>{b.charges == null ? "À préciser" : eur(Number(b.charges))}</dd></div>
        <div><dt>Échéance du loyer</dt><dd>{b.jour_echeance == null ? "À préciser" : `Le ${b.jour_echeance === 1 ? "1er" : b.jour_echeance} du mois`}</dd></div>
        <div><dt>Dépôt de garantie</dt><dd>{b.depot_garantie == null ? "À préciser" : eur(Number(b.depot_garantie))}</dd></div>
        <div><dt>{b.etat === "brouillon" ? "Entrée prévue" : "Entrée"}</dt><dd>{b.date_debut ? formaterDate(b.date_debut) : "À préciser"}</dd></div>
        {b.date_fin && <div><dt>Fin du contrat</dt><dd>{formaterDate(b.date_fin)}</dd></div>}
      </dl>
      {signe && <p className={styles.activationAttente}>La location attend votre activation.</p>}
      <AvertissementsLoyer avertissements={avertissementsCoherenceLoyer(b, lot.surface_m2)} />
      <div className={styles.contratActions}>
        <Link className={b.etat === "brouillon" ? "btn-or" : "btn-secondaire"} href={`${base}/baux/${b.id}${signe ? "#etape-bail-7" : ""}`}>{signe ? "Consulter et activer" : b.etat === "brouillon" ? "Reprendre le bail" : "Gérer le bail"}<ArrowRight size={15} aria-hidden="true" /></Link>
        {!traverseeLectureSeule && b.etat === "brouillon" && !archiveBail(b) && !suiviSignatures.erreur && !b.signe_envoye_le && <SupprimerBailBrouillon orgId={orgId} bailId={b.id} libelle={[lot.nom, nomChambre, locataire].filter(Boolean).join(" · ")} />}
      </div>
    </li>;
  };
  const travailLocations = <div className={styles.travailLocations} id="baux">
    <span id="resume-lot" />
    {erreurBaux ? <section className={styles.panneau}><h2>Locations indisponibles</h2><p>Rechargez la page pour retrouver les contrats.</p></section> : <>
      {bauxEnCours.length > 0 && <section className={styles.panneau} aria-labelledby="locations-en-cours">
        <header className={styles.travailEntete}><h2 id="locations-en-cours">Location{bauxEnCours.length > 1 ? "s" : ""} en cours</h2>{bauxEnCours.length > 1 && <p>{bauxEnCours.length} contrats · <strong>{eur(totalLoyers)} / mois CC</strong></p>}</header>
        <ul className={styles.contratsTravail}>{bauxEnCours.map(ligneBail)}</ul>
      </section>}
      {bauxBrouillons.length > 0 && <section className={styles.panneau} aria-labelledby="locations-en-preparation">
        <header className={styles.travailEntete}><h2 id="locations-en-preparation">{bauxBrouillons.length > 1 ? "Baux" : "Bail"} à finaliser</h2></header>
        <ul className={styles.contratsTravail}>{bauxBrouillons.map(ligneBail)}</ul>
      </section>}
      {!erreurChambres && chambresSansBail.length > 0 && <section className={styles.panneau} aria-labelledby="chambres-sans-location">
        <header className={styles.travailEntete}><h2 id="chambres-sans-location">Chambres sans location en cours</h2><a href="#chambres">Gérer les chambres <ArrowRight size={14} aria-hidden="true" /></a></header>
        <ul className={styles.chambresDisponibles}>{chambresSansBail.map(chambre => <li key={chambre.id}><strong>{chambre.nom}</strong><span>{chambre.surface_m2 == null ? "Surface à préciser" : formaterSurface(chambre.surface_m2)}</span></li>)}</ul>
      </section>}
      {!bauxEnCours.length && !bauxBrouillons.length && <div className={styles.videCarte}><p>Aucun bail en cours.</p><small>{lot.etat === "archive" ? "Les anciens contrats restent consultables ci-dessous." : "Le loyer, les échéances et les dates apparaîtront ici dès qu’un bail sera préparé."}</small></div>}
      {creationSecondaire && <details className={`${styles.panneau} ${styles.nouvelleLocation}`}><summary>Préparer un autre contrat — facultatif<ChevronDown size={16} aria-hidden="true" /></summary><div id="nouveau-contrat"><FormulaireBailLot orgId={orgId} bienId={bienId} lotId={lotId} personnes={personnesLocataires} chambres={chambres ?? []} /></div></details>}
      {anciensBaux.length > 0 && <details className={`${styles.panneau} ${styles.anciensContrats}`}><summary>Anciens contrats · {anciensBaux.length}<ChevronDown size={16} aria-hidden="true" /></summary><ul className={styles.contratsTravail}>{anciensBaux.map(ligneBail)}</ul></details>}
    </>}

  </div>;

  const retourContrat = retourBailDuLot(orgId, retourBail, retourEtape, baux ?? [], racineEspace(estProprietaire));
  const ficheHref = `${base}/parc/${bienId}/lots/${lotId}`;
  if (parcours === "1") return <main className={`mx-auto w-full p-4 sm:p-7 ${parcoursStyles.pageCreation}`}>
    <Link href={retourContrat ?? ficheHref} className="inline-flex min-h-11 items-center text-sm">← {retourContrat ? "Revenir au bail" : "Retour au logement"}</Link>
    <header className={parcoursStyles.enteteCreation}><House size={27} aria-hidden="true"/><div><span className={parcoursStyles.surtitre}>Votre logement</span><h1>Compléter le lot</h1><p>Les informations permanentes de {lot.nom}. Elles seront reprises dans chaque bail.</p></div></header>
    <EchecLecture quoi={echecs} />
    <ParcoursLot initiale={etape ?? "lot"} resume={<div className="space-y-2"><strong>{lot.nom}</strong><p>{bien.address_line1}<br />{bien.postal_code} {bien.city}</p><p>{lot.surface_m2 == null ? "Surface à compléter" : formaterSurface(lot.surface_m2)}</p></div>} contenus={[
      <FormulaireBien key="bien" orgId={orgId} bien={bien} />,
      <FormulaireLot key="lot" orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={bien.copropriete} typeBien={bien.type} libelleEnregistrer="Enregistrer les caractéristiques" />,
      <div key="proprietaires">{role === "proprietaire_direct" ? <section id="detention" className="space-y-5">
        {erreurDetentions ? <p role="alert">Les propriétaires n’ont pas pu être chargés. Réessayez pour consulter la répartition.</p> : <>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{detentionsActives.length > 1 ? "Propriétaires actuels" : "Propriétaire actuel"}</h3><span className={`puce ${totalQuoteParts === 100 ? "puce-loue" : "puce-prep"}`}>{totalQuoteParts === 100 ? "Répartition complète · 100 %" : `${totalQuoteParts} % attribués sur 100 %`}</span></div>
          {detentionsActives.length ? <ul className="grid gap-3">{detentionsActives.map(d => {
            const personne = d.person as unknown as { nom: string; prenom: string | null; account_id: string | null } | null;
            const vous = personne?.account_id === user.id;
            return <li key={d.id} className="rounded-xl border border-[var(--or-filet)] border-l-4 border-l-[var(--or)] bg-[var(--or-clair)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--marque)] text-sm font-semibold text-[var(--sur-marque)]">{personne ? [personne.prenom?.[0], personne.nom[0]].filter(Boolean).join("").toUpperCase() : "—"}</span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="break-words text-base">{nomPersonne(personne)}</strong>{vous && <span className="puce puce-encre">Vous</span>}</div><p className="mt-1 text-xs text-muted-foreground">Propriétaire depuis le {formaterDate(d.date_debut)}</p></div>
                <div className="ml-auto text-right"><strong className="block text-2xl text-[var(--encre)]">{Number(d.quote_part)} %</strong><span className="text-xs text-muted-foreground">du lot</span></div>
              </div>
              {vous && <p className="mt-3 text-sm text-muted-foreground">Vous êtes déjà rattaché à ce lot en tant que propriétaire.</p>}
              <details className="mt-3 border-t border-[var(--or-filet)] pt-2"><summary className="cursor-pointer py-1 text-xs text-muted-foreground">Gérer cette détention</summary><div className="mt-2 flex flex-wrap gap-2"><BoutonCloreDetention orgId={orgId} bienId={bienId} lotId={lotId} detentionId={d.id} />{(baux ?? []).length === 0 && <BoutonSupprimerDetention orgId={orgId} bienId={bienId} lotId={lotId} detentionId={d.id} proprietaire={nomPersonne(personne)} quotePart={Number(d.quote_part)} />}</div></details>
            </li>;
          })}</ul> : <p className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-soft-foreground">Aucun propriétaire n’est encore rattaché. Ajoutez-le ci-dessous pour compléter le lot.</p>}
          {(detentions ?? []).some(d => d.date_fin) && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm">Anciens propriétaires</summary><ul className="mt-3 space-y-3">{(detentions ?? []).filter(d => d.date_fin).map(d => <li key={d.id} className="flex flex-wrap items-center gap-3 text-sm"><span className="min-w-0 flex-1">{nomPersonne(d.person as unknown as { nom: string; prenom: string | null })} · {Number(d.quote_part)} %<small className="block text-muted-foreground">Du {formaterDate(d.date_debut)} au {formaterDate(d.date_fin)}</small></span><BoutonRouvrirDetention orgId={orgId} bienId={bienId} lotId={lotId} detentionId={d.id} /></li>)}</ul></details>}
          <details open={detentionsActives.length === 0} className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer py-1 text-sm font-semibold">+ {detentionsActives.length ? "Ajouter un propriétaire (indivision)" : "Ajouter le propriétaire"}</summary><div className="mt-3"><FormulaireDetention orgId={orgId} bienId={bienId} lotId={lotId} personnes={personnes ?? []} proprietairesIds={[...new Set((proprietaires ?? []).map(d => d.person_id))]} premierProprietaire={detentionsActives.length === 0} estProprietaire={estProprietaire} /></div></details>
        </>}
      </section> : rubriqueDetention}</div>,
      <div key="equipements" className="space-y-5">{rubriquePieces}{rubriqueEquipements}<FormulaireEquipementCatalogue orgId={orgId} /><SectionLot id="chambres" titre="Chambres en colocation individuelle — Facultatif" resume="À préparer uniquement si chaque chambre aura son propre bail">
        {erreurChambres ? <p role="alert">Les chambres n’ont pas pu être chargées.</p> : <ChambresLogement orgId={orgId} bienId={bienId} lotId={lotId} chambres={chambres ?? []} plafond={lot.colocation_loyer_reference} mode="chambres" />}
      </SectionLot></div>,
      <div key="diagnostics" className="space-y-5">{rubriqueDiagnostics}{rubriqueDiagnosticsImmeuble}</div>,
      <div key="recapitulatif" className="space-y-5">
        <p>Le lot possède sa propre fiche. Vous pourrez créer un bail séparément lorsque vous aurez choisi de le louer.</p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Logement</dt><dd className="font-semibold">{lot.nom} · {lot.surface_m2 == null ? "Surface à compléter" : formaterSurface(lot.surface_m2)} · {lot.pieces ?? "—"} pièce(s)</dd></div>
          <div><dt className="text-sm text-muted-foreground">Adresse</dt><dd>{bien.address_line1} · {bien.postal_code} {bien.city}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Propriétaires</dt><dd>{detentionsActives.map(d => `${nomPersonne(d.person as unknown as {nom:string;prenom:string|null})} (${Number(d.quote_part)} %)`).join(", ") || "À compléter"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Dossier du logement</dt><dd>{nbEquip} équipement(s) · {nbDiag + nbDiagBien} diagnostic(s)</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3"><Link className="btn-or" href={retourContrat ?? ficheHref}>{retourContrat ? "Revenir au bail" : "Terminer et voir le lot"}</Link>{!retourContrat && <Link className="btn-secondaire" href={`${ficheHref}${estProprietaire ? "#nouvelle-location" : "#baux"}`}>Passer à la création d’un bail <ArrowRight size={16} aria-hidden="true" /></Link>}</div>
        <p className="text-sm text-muted-foreground">Locataires, garants, dates, loyer, clauses et signature se renseignent dans le parcours du bail.</p>
      </div>
    ]} />
  </main>;

  const colocationLot = <>{colocationPertinente && !(bailEnCours && nbChambres === 0) && (
            <SectionLot
              id="chambres"
              titre={estProprietaire && nbChambres === 0 ? "Configurer une colocation" : "Colocation · contrats individuels"}
              resume={
                nbChambres === 0
                  ? estProprietaire ? undefined : "Aucune chambre préparée"
                  : `${nbChambres} chambre${nbChambres > 1 ? "s" : ""} préparée${nbChambres > 1 ? "s" : ""}`
              }
            >
              {erreurChambres ? <p role="alert" className="err">Les chambres n’ont pas pu être chargées. Rechargez la page.</p> : <ChambresLogement lectureSeule={traverseeLectureSeule} orgId={orgId} lotId={lotId} bienId={bienId} chambres={chambres ?? []} plafond={lot.colocation_loyer_reference} lienContrat={!estProprietaire || lot.etat === "archive" ? "#baux" : detentionsActives.length === 0 ? "#detention" : creationSecondaire ? "#nouveau-contrat" : "#nouvelle-location"} />}
            </SectionLot>
          )}</>;
  const chargesLot = <>{bien.copropriete && (
            <SectionLot
              id="charges"
              titre="Charges de copropriété"
              // Pas de pastille sur un simple vide : aucun appel saisi n'est
              // pas une anomalie (le résumé le dit déjà).
              resume={
                appelsCharges.length === 0
                  ? "Aucun appel de charges saisi"
                  : `${appelsCharges.length} appel${appelsCharges.length > 1 ? "s" : ""} · ${
                      appelsCharges.filter((a) => a.statut === "brouillon").length
                    } en cours`
              }
            >
              <p className="mb-3 text-sm text-muted-foreground">
                Saisie de l&apos;appel du syndic poste par poste, ventilé récupérable
                (locataire) / non récupérable (propriétaire). La part récupérable alimente
                la régularisation, bloquée tant qu&apos;aucun appel n&apos;est ventilé.
              </p>
              <AppelsCharges
                lectureSeule={traverseeLectureSeule}
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                appels={appelsCharges}
                anneeCourante={new Date().getFullYear()}
              />
            </SectionLot>
          )}</>;
  const statutLot = <>{!traverseeLectureSeule && <details className={styles.gestionStatut}><summary>Gérer le statut du lot <ChevronDown size={16} aria-hidden="true" /></summary><div>
      {lot.etat === "brouillon" && !erreurBlocages && <BlocagesLocation motifs={(blocages ?? []) as string[]} ctx={{orgId,bienId,lotId,racine:racineEspace(estProprietaire)}} pageCourante={`${base}/parc/${bienId}/lots/${lotId}`} titre="Ce qui empêche la mise en location" />}
      <BoutonsEtatLot orgId={orgId} bienId={bienId} lotId={lotId} etat={lot.etat} estBailleurDirect={role === "proprietaire_direct"} bailHref={bailEnCours ? `${base}/baux/${bailEnCours.id}` : undefined} />
    </div></details>}</>;
  const complementsLogement = <>{(bien.copropriete || (colocationPertinente && !(bailEnCours && nbChambres === 0))) && <section className={styles.panneau}>{colocationLot}{chargesLot}</section>}{statutLot}</>;
  const propriete = <section id="propriete-lot" className={`${styles.panneau} ${styles.proprieteResume}`} aria-labelledby="proprietaires-fiche">
    <header className={styles.panneauEntete} data-ton="or"><span className={styles.panneauIcone}><Users size={18} aria-hidden="true" /></span><h2 id="proprietaires-fiche">Propriétaires</h2></header>
    {erreurDetentions ? <p role="alert" className={styles.texteVide}>Les propriétaires sont indisponibles.</p> : <>
      {detentionsActives.length ? <ul className={styles.proprietaires}>{detentionsActives.map(d => {
        const personne = d.person as unknown as { nom: string; prenom: string | null; account_id: string | null; qualite: string | null } | null;
        // La qualité porte la durée du bail nu : elle se lit ici, pas seulement sur la fiche de la personne (audit #264, FL-04).
        const qualite = normaliserQualiteBailleur(personne?.qualite);
        return <li key={d.id}><span className={styles.avatar} aria-hidden="true">{personne ? [personne.prenom?.[0], personne.nom[0]].filter(Boolean).join("").toUpperCase() : "—"}</span><div><strong>{nomPersonne(personne)}</strong><small>{[personne?.account_id === user.id ? "Vous" : null, qualite, qualite && !lot.meuble && dureeBailNuAnnees([qualite]) === 6 ? "bail nu de 6 ans" : null, `Depuis le ${formaterDate(d.date_debut)}`].filter(Boolean).join(" · ")}</small></div><span className={styles.quotePart}>{Number(d.quote_part)} %</span></li>;
      })}</ul> : <p className={styles.texteVide}>Aucun propriétaire rattaché.</p>}
      {totalQuoteParts !== 100 && <p className={styles.repartitionIncomplete}>{totalQuoteParts} % attribués sur 100 %</p>}
      <details className={styles.editionDiscrete}><summary>{traverseeLectureSeule ? "Historique de propriété" : "Gérer la propriété"}<ChevronDown size={14} aria-hidden="true" /></summary><div>{rubriqueDetention}</div></details>
    </>}
  </section>;
  // Même résumé que « Journal & dépenses » : icône, titre et chevron (audit #264, FL-11).
  const suiviLot = <div className={styles.carteJournal}><SuiviLotProprietaire orgId={orgId} lotId={lotId} rubrique="historique" resume={<><span className={styles.panneauIcone}><History size={18} aria-hidden="true" /></span><h2>Historique du lot</h2><ChevronDown className={styles.flecheJournal} size={18} aria-hidden="true" /></>} /></div>;
  return (
    <main data-proprietaire={estProprietaire} className={`${styles.fiche} dossier-location mx-auto w-full max-w-7xl space-y-[1.125rem] p-4 sm:p-7`}>
      <Link href={`${base}/parc`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground">← {estProprietaire ? "Biens & locations" : "Mon portefeuille"}</Link>
      <header className={styles.entete}>
        <div className={styles.identite}><span className={styles.icone}><House size={28} aria-hidden="true" /></span><div className="min-w-0"><p className={styles.surtitre}>{estProprietaire ? <Link href={`${base}/parc/${bienId}`}>{bien.nom !== lot.nom ? bien.nom : "Gérer le bien"}</Link> : <>Fiche du lot{bien.nom !== lot.nom ? ` · ${bien.nom}` : ""}</>}</p><div className="flex flex-wrap items-center gap-3"><h1>{lot.nom}</h1><span className={COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}>{ETATS_LOT[lot.etat] ?? lot.etat}</span></div><p className={styles.adresse}><MapPin size={15} aria-hidden="true" />{[bien.address_line1, bien.address_line2, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Adresse à compléter"}</p></div></div>
        {!traverseeLectureSeule && <div className={`${styles.actions} ${estProprietaire ? styles.actionsEntete : ""}`}><LienModifierLot lotId={lotId} href={`${base}/parc/${bienId}/lots/${lotId}?modifier=1#caracteristiques`} />
          {estProprietaire && lot.etat !== "archive" && !erreurBaux && !erreurDetentions && <div id="nouvelle-location">{actionEnTete ? <Link className="btn-or" href={actionEnTete.href}>{actionEnTete.libelle}<ArrowRight size={15} aria-hidden="true" /></Link> : detentionsActives.length ? <FormulaireBailLot compact orgId={orgId} bienId={bienId} lotId={lotId} personnes={personnesLocataires} chambres={chambres ?? []} /> : <a className="btn-or" href="#detention">Commencer un bail <ArrowRight size={15} aria-hidden="true" /></a>}</div>}
        </div>}
        {!estProprietaire && faitsLot}
      </header>
      <div className={styles.contenu}>
      <EchecLecture quoi={echecs} />
      {attention.length > 0 && (estProprietaire ? <aside className={styles.pointsAttention} aria-label="À compléter">
        <strong>À compléter</strong><ul>{attention.map(point => {
          const texte = point.cle === "diagnostics" ? `${manquants.length} diagnostic${manquants.length > 1 ? "s" : ""} du lot` : point.cle === "diagnostics-immeuble" ? `${manquantsBien.length} diagnostic${manquantsBien.length > 1 ? "s" : ""} ${duBien}` : point.cle === "detention" ? `Répartition de la propriété · ${totalQuoteParts} %` : point.cle === "pieces" ? "Pièces pour l’état des lieux" : point.cle === "caracteristiques" ? `Caractéristiques du logement · ${caracteristiquesAFaire.length} à renseigner` : point.texte;
          return <li key={point.cle}>{point.href ? <Link href={point.href}>{texte}<ArrowRight size={14} aria-hidden="true" /></Link> : point.ancre ? <a href={`#${point.ancre}`}>{texte}<ArrowRight size={14} aria-hidden="true" /></a> : <span>{texte}</span>}</li>;
        })}</ul>
      </aside> : <details className={styles.alertes}><summary>{attention.length} point{attention.length > 1 ? "s" : ""} à compléter dans votre dossier <ChevronDown size={16} aria-hidden="true" /></summary><AttentionFiche points={attention} /></details>)}

      {estProprietaire ? <FicheContinue afficherNavigation={false} className={`${styles.ficheProprietaire} ${styles.sixCartes}`} rubriques={[
        { id: "logement-lot", titre: "Logement", colonne: "principale", contenu: <div className={styles.carteAssemblee}>{carteLogement}{propriete}<div className={styles.complementsCarte}>{colocationLot}{statutLot}</div></div> },
        { id: "batiment-lot", titre: "Bâtiment et occupants", colonne: "secondaire", navigation: false, contenu: <div className={styles.cartesEmpilees}>
          <div className={styles.carteAssemblee}>{carteBatiment}{bien.copropriete && <div className={styles.complementsCarte}>{chargesLot}</div>}</div>
          <section id="personnes-lot" className={styles.panneau} aria-labelledby="personnes-fiche"><header className={styles.panneauEntete}><span className={styles.panneauIcone}><Users size={18} aria-hidden="true" /></span><h2 id="personnes-fiche">Locataires & garants</h2></header><PersonnesLot orgId={orgId} lotId={lotId} base={base} lectureSeule={traverseeLectureSeule} baux={baux ?? []} erreurBaux={Boolean(erreurBaux)} /></section>
        </div> },
        { id: "contrats-lot", titre: "Bail", colonne: "principale", contenu: <section className={`${styles.panneau} ${styles.carteBail}`} aria-labelledby="bail-fiche"><header className={styles.panneauEntete}><span className={styles.panneauIcone}><FileText size={18} aria-hidden="true" /></span><h2 id="bail-fiche">{bauxEnCours.length > 1 ? "Les baux" : "Le bail"}</h2></header>{travailLocations}</section> },
        { id: "journal-lot", titre: "Journal & dépenses", colonne: "principale", navigation: false, contenu: <div className={styles.carteJournal}><SuiviLotProprietaire orgId={orgId} lotId={lotId} rubrique="compta" lectureSeule={traverseeLectureSeule} resume={<><span className={styles.panneauIcone}><Wallet size={18} aria-hidden="true" /></span><h2>Journal & dépenses</h2><ChevronDown className={styles.flecheJournal} size={18} aria-hidden="true" /></>} /></div> },
        { id: "incidents-lot", titre: "Incidents", colonne: "secondaire", contenu: <div className={styles.panneau}><header className={styles.panneauEntete}><span className={styles.panneauIcone}><Wrench size={18} aria-hidden="true" /></span><h2 id="incidents-fiche">Incidents</h2></header><IncidentsLot orgId={orgId} lotId={lotId} base={base} lectureSeule={traverseeLectureSeule} /><Link className={styles.lienArtisan} href={`${base}/reseau?bien=${bienId}`}>Trouver un artisan <ArrowUpRight size={14} aria-hidden="true" /></Link></div> },
        { id: "documents-lot", titre: "Documents", repliable: true, resume: <><span className={styles.panneauIcone}><FileText size={18} aria-hidden="true" /></span><h2 id="documents-fiche">Documents</h2><ChevronDown className={styles.flecheDocuments} size={18} aria-hidden="true" /></>, contenu: <div className={styles.contenuDocuments}>
            <div className={styles.actionsDocuments}><Link href={`${base}/documents`}>Ouvrir la bibliothèque <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
            <div className={styles.diagnosticsGrille}>{rubriqueDiagnostics}{rubriqueDiagnosticsImmeuble}</div>
            <div className={styles.autresDocuments}><SuiviLotProprietaire orgId={orgId} lotId={lotId} rubrique="documents" affichage="direct" documentsDejaAffiches={[...(diagnostics ?? []), ...(diagnosticsBien ?? [])].flatMap(d => d.document_id ? [d.document_id] : [])} lectureSeule={traverseeLectureSeule} /></div>
          </div> },
        { id: "suivi-lot", titre: "Historique du lot", navigation: false, contenu: suiviLot },
      ]} /> : <OngletsDossier initiale={modifier === "1" ? "logement-lot" : "resume-lot"} rubriques={[
        { id: "resume-lot", titre: "Résumé", contenu: vueEnsemble },
        { id: "logement-lot", titre: "Logement", contenu: <>{logement}
      {complementsLogement}</> },
        { id: "documents-lot", titre: "Documents", contenu: <>
      <section className={styles.panneau} aria-labelledby="titre-documents-lot">
        <header className={styles.panneauEntete} data-ton="vert"><span className={styles.panneauIcone}><FileText size={18} aria-hidden="true" /></span><h2 id="titre-documents-lot">Documents du logement</h2><Link href={`${base}/documents`}>Tous les documents <ArrowUpRight size={14} aria-hidden="true" /></Link></header>
        <div className={styles.diagnosticsGrille}>{rubriqueDiagnostics}{rubriqueDiagnosticsImmeuble}</div>
      </section>
</> },
        { id: "contrats-lot", titre: "Contrats", contenu: <section className={styles.panneau} aria-label="Contrats de location">{rubriqueBaux}</section> },
      ]} />}


      </div>
    </main>
  );
}
