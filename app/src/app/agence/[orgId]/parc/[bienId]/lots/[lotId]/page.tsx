import styles from "./fiche-lot.module.css";
import parcoursStyles from "@/components/presentation-parcours.module.css";
import { SupprimerBailBrouillon } from "@/components/supprimer-bail-brouillon";
import Link from "next/link";
import { OngletsDossier } from "@/components/onglets-dossier";
import { ParcoursLot } from "@/components/parcours-location";
import { FormulaireBien } from "../../../formulaire-bien";
import { FormulaireLot } from "./formulaire-lot";
import { FormulaireEquipementCatalogue } from "../../../formulaire-equipement-catalogue";
import { retourBailDuLot } from "@/lib/parcours-lot";
import { House, Users, Wallet, FileText, MapPin, Pencil, Wrench, ArrowRight, ArrowUpRight, Building2, KeyRound, ChevronDown, Ruler, DoorOpen, Layers3, Sofa } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  alertesDecence,
  alerteDiagnostics,
  formaterSurface,
} from "@/lib/parc";
import { diagnosticsExigibles, diagnosticsManquants } from "@/lib/diagnostics";
import { formaterDate, eur } from "@/lib/ged";
import { ETATS_BAIL, COULEURS_ETAT_BAIL, TYPES_BAIL } from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import { Card, CardContent } from "@/components/ui/card";
import { LignesDiagnostics, type DiagnosticDepose } from "../../lignes-diagnostics";
import { RecapLot } from "./recap-lot";
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

export const metadata = { title: "Fiche lot — Gerimmo" };

export default async function PageLot(
  props: PageProps<"/agence/[orgId]/parc/[bienId]/lots/[lotId]">
) {
  const { orgId, bienId, lotId } = await props.params;
  // Conserver le lien direct vers la modification des caractéristiques.
  const { modifier, parcours, etape, retourBail, retourEtape } = ((await props.searchParams) ?? {}) as { modifier?: string; parcours?: string; etape?: string; retourBail?: string; retourEtape?: string };
  exigerUuids(bienId, lotId);
  const { supabase, role } = await verifierAccesEspace(orgId);
  if (parcours === "1" && ["bail", "locataires"].includes(etape ?? "")) redirect(`/agence/${orgId}/parc/${bienId}/lots/${lotId}#baux`);

  const { data: chambres, error: erreurChambres } = await supabase.from("lot_chambres").select("*").eq("lot_id", lotId).eq("organization_id", orgId).order("nom");

  const [
    { data: lot, error: erreurLot },
    { data: bien, error: erreurBien },
    { data: detentions, error: erreurDetentions },
    { data: diagnostics, error: erreurDiagnostics },
    { data: diagnosticsBien, error: erreurDiagnosticsBien },
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
        "id, person_id, quote_part, date_debut, date_fin, person:persons!detentions_person_id_fkey(nom, prenom)"
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
      .select("id, chambre_id, type, etat, document_signe, signe_envoye_le, locataire_principal, loyer_hc, charges, date_debut, date_fin")
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
        retour={{ href: `/agence/${orgId}/parc/${bienId}`, libelle: "Fiche bien" }}
      />
    );
  if (!lot || !bien) notFound();

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
  const manquants = diagnosticsManquants(bien, diagnostics ?? [], "lot");
  const exigiblesBien = diagnosticsExigibles(bien, "bien");
  const manquantsBien = diagnosticsManquants(bien, diagnosticsBien ?? [], "bien");
  const decence = alertesDecence(lot);
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
  noter(`les diagnostics ${duBien}`, erreurDiagnosticsBien);
  noter("le catalogue d’équipements", erreurCatalogue);
  noter("les équipements du lot", erreurEquipesLot);
  noter("les personnes de l’agence", erreurPersonnes);
  noter("ce qui bloque la mise en location", erreurBlocages);
  noter("les baux", erreurBaux);
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
  const attention: { cle: string; texte: string; ancre?: string }[] = [];
  for (const a of decence) attention.push({ cle: `decence-${a}`, texte: a });
  if (totalQuoteParts !== 100) {
    attention.push({
      cle: "detention",
      texte: `La propriété n’est répartie qu’à ${totalQuoteParts} % : le lot ne se loue pas tant qu’elle n’atteint pas 100 %.`,
      ancre: "detention",
    });
  }
  if (manquants.length > 0) {
    attention.push({
      cle: "diagnostics",
      // « du lot », comme la section où mène « Régler » (24/09)
      texte: `Diagnostic${manquants.length > 1 ? "s" : ""} du lot à déposer : ${manquants
        .map((m) => m.libelle)
        .join(", ")}.`,
      ancre: "diagnostics",
    });
  }
  if (manquantsBien.length > 0) {
    attention.push({
      cle: "diagnostics-immeuble",
      texte: `Diagnostic${manquantsBien.length > 1 ? "s" : ""} ${duBien} à déposer : ${manquantsBien
        .map((m) => m.libelle)
        .join(", ")}.`,
      ancre: "diagnostics-immeuble",
    });
  }
  if ((piecesLot ?? []).length === 0 && (chambres ?? []).length === 0) {
    attention.push({
      cle: "pieces",
      texte: "Aucune pièce définie : l’état des lieux n’aura pas de grille à remplir.",
      ancre: "pieces",
    });
  }

  const loyerCc =
    bailEnCours?.loyer_hc != null
      ? Number(bailEnCours.loyer_hc) + Number(bailEnCours.charges ?? 0)
      : null;

  const rubriqueDetention = (<SectionLot ouvertParDefaut={parcours === "1"}
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
                      {!d.date_fin && (
                        <BoutonCloreDetention
                          orgId={orgId}
                          bienId={bienId}
                          lotId={lotId}
                          detentionId={d.id}
                        />
                      )}
                      {!d.date_fin && (baux ?? []).length === 0 && (
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
                      {d.date_fin && (
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
              <FormulaireDetention
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                personnes={personnes ?? []}
                proprietairesIds={[...new Set((proprietaires ?? []).map((d) => d.person_id))]}
                premierProprietaire={detentionsActives.length === 0}
              />
            </div>
          </SectionLot>);
  const rubriqueDiagnostics = (<SectionLot ouvertParDefaut
            id="diagnostics"
            titre="Diagnostics du lot"
            // Le titre dit déjà le niveau : la pastille ne le répète pas
            // entre parenthèses, et le résumé ne redit pas ce qui manque — le
            // bandeau du haut le dit, avec « Régler » (24/09).
            alerte={alerteDiagnostics(manquants.map((m) => m.type), diagnostics ?? [])}
            resume={
              nbDiag === 0
                ? "Aucun diagnostic déposé"
                : `${nbDiag} déposé${nbDiag > 1 ? "s" : ""}`
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                DPE, électricité, gaz, plomb, amiante privatif… Ceux {duBien}{" "}
                se déposent juste en dessous.
              </p>
              <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                niveau="lot"
                attendus={exigiblesLot.map((e) => e.type)}
                diagnostics={(diagnostics ?? []) as DiagnosticDepose[]}
              />
            </div>
          </SectionLot>);
  const rubriqueDiagnosticsImmeuble = (<SectionLot ouvertParDefaut
            id="diagnostics-immeuble"
            titre={`Diagnostics ${duBien}`}
            alerte={alerteDiagnostics(manquantsBien.map((m) => m.type), diagnosticsBien ?? [])}
            resume={
              nbDiagBien === 0
                ? "Aucun diagnostic déposé"
                : `${nbDiagBien} déposé${nbDiagBien > 1 ? "s" : ""}`
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                ERP, termites, amiante des parties communes… Ils valent pour
                tout le bien « {bien.nom} » : un dépôt fait ici sert à chacun de
                ses lots, et se retrouve sur la fiche du bien.
              </p>
              <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                niveau="bien"
                attendus={exigiblesBien.map((e) => e.type)}
                diagnostics={(diagnosticsBien ?? []) as DiagnosticDepose[]}
              />
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
            <FormulaireEquipementsLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              catalogue={catalogue ?? []}
              selection={(equipesLot ?? []).map((e) => e.equipement_id)}
            />
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
            <FormulairePiecesLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              pieces={(piecesLot ?? []) as PieceLot[]}
            />
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
                    .map((b) => ETATS_BAIL[b.etat] ?? b.etat)
                    .join(", ")}`
            }
          >
            <div className="space-y-4">
              {(baux ?? []).length > 0 && (
                <ul className={styles.bauxListe}>
                  {(baux ?? []).map((b) => (
                    <li key={b.id} className={styles.bailLigne}>
                      <span className={COULEURS_ETAT_BAIL[b.etat] ?? "puce puce-grise"}>
                        {ETATS_BAIL[b.etat] ?? b.etat}
                      </span>
                      {/* Recette 21/08 puis 22/08 : la vue macro dit qui
                          habite, pour combien et depuis quand — avant
                          d'ouvrir. */}
                      <span className={styles.bailTexte}>
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
                      </span>
                      <div className={styles.bailActions}>
                      <Link
                        href={`/agence/${orgId}/baux/${b.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Ouvrir
                      </Link>
                      {b.etat === "brouillon" && !b.document_signe && !b.signe_envoye_le && <SupprimerBailBrouillon orgId={orgId} bailId={b.id} libelle={[lot.nom, TYPES_BAIL[b.type] ?? b.type, b.locataire_principal ? nomsParId.get(b.locataire_principal) : null, b.date_debut ? `Entrée le ${formaterDate(b.date_debut)}` : null].filter(Boolean).join(" · ")} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {detentionsActives.length === 0 ? (
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
              )}
            </div>
          </SectionLot>);
  const bauxBrouillons = (baux ?? []).filter(b => b.etat === "brouillon");
  const bailAReprendre = bauxBrouillons[0];
  const bailPrincipal = bailEnCours ?? bailAReprendre;
  const hrefBailPrincipal = bailPrincipal ? `/agence/${orgId}/baux/${bailPrincipal.id}` : "#baux";
  const libelleBailPrincipal = bailEnCours ? "Ouvrir le bail" : bailAReprendre ? "Reprendre le bail" : "Préparer un bail";
  const equipementsNoms = (catalogue ?? []).filter(e => (equipesLot ?? []).some(l => l.equipement_id === e.id)).map(e => e.nom);
  const valeurLogement = (valeur: string | number | null | undefined) => valeur == null || String(valeur).trim() === "" ? "Non renseigné" : valeur;

  const vueEnsemble = <div className={styles.apercu}>
    <section className={styles.locationResume} id="location-apercu" aria-labelledby="titre-location-lot">
      <span className={styles.iconeLocation}><FileText size={22} aria-hidden="true" /></span>
      <div className={styles.locationTexte}>
        <span className={styles.surtitre}>{bailEnCours ? "Location en cours" : bailAReprendre ? "Bail en préparation" : "Votre location"}</span>
        <h2 id="titre-location-lot">{erreurBaux ? "Les baux sont indisponibles" : bauxEnCours.length > 1 ? `${bauxEnCours.length} contrats en cours` : bailEnCours ? recapLocataire ?? "Bail actif" : bailAReprendre ? "Votre bail vous attend" : lot.etat === "archive" ? "Ce lot est archivé" : "Préparez la prochaine location"}</h2>
        <p>{erreurBaux ? "Réessayez pour retrouver les contrats de ce lot." : bailPrincipal ? [
          bailAReprendre && !bailEnCours && bailAReprendre.locataire_principal ? nomsParId.get(bailAReprendre.locataire_principal) : null,
          `Bail ${(TYPES_BAIL[bailPrincipal.type] ?? bailPrincipal.type).toLowerCase()}`,
          bailPrincipal.date_debut ? `Entrée ${bailAReprendre && !bailEnCours ? "prévue " : ""}le ${formaterDate(bailPrincipal.date_debut)}` : "Date d’entrée à préciser",
          bauxBrouillons.length > 1 && !bailEnCours ? `Dernier des ${bauxBrouillons.length} brouillons` : null,
        ].filter(Boolean).join(" · ") : lot.etat === "archive" ? "Retrouvez les informations et l’historique de ce logement." : "Les informations du logement seront reprises dans le bail."}</p>
      </div>
      {!erreurBaux && <div className={styles.locationActions}>
        <Link href={lot.etat === "archive" ? "#baux" : hrefBailPrincipal} className="btn-or">{lot.etat === "archive" ? "Consulter les baux" : libelleBailPrincipal}<ArrowRight size={15} aria-hidden="true" /></Link>
        {nbBaux > 1 && <a href="#baux">Voir les {nbBaux} baux</a>}
      </div>}
    </section>

    <div className={styles.apercuGrille}>
      <section className={styles.panneau} aria-labelledby="titre-logement-apercu">
        <header className={styles.panneauEntete}><span className={styles.panneauIcone}><House size={18} aria-hidden="true" /></span><h2 id="titre-logement-apercu">Le logement</h2><a href="#caracteristiques">Tout voir <ArrowUpRight size={14} aria-hidden="true" /></a></header>
        <dl className={styles.infosApercu}>
          <div><dt>Chauffage</dt><dd>{valeurLogement(lot.chauffage)}</dd></div>
          <div><dt>Eau chaude</dt><dd>{valeurLogement(lot.eau_chaude)}</dd></div>
          <div><dt>Surface Carrez</dt><dd>{lot.surface_carrez == null ? "Non renseignée" : formaterSurface(lot.surface_carrez)}</dd></div>
          <div><dt>Locaux privatifs</dt><dd>{valeurLogement(lot.locaux_privatifs)}</dd></div>
        </dl>
        <div className={styles.sousRubrique}><div><h3>Pièces de l’état des lieux</h3><a href="#pieces">Gérer</a></div>
          {erreurPieces ? <p>Lecture à réessayer.</p> : piecesLot?.length ? <ul className={styles.etiquettes}>{piecesLot.map(p => <li key={p.id}>{p.nom}</li>)}</ul> : <p>Les pièces restent à définir pour préparer l’état des lieux.</p>}
        </div>
        <div className={styles.sousRubrique}><div><h3>Équipements</h3><a href="#equipements">{nbEquip ? "Modifier" : "Compléter"}</a></div>
          {erreurCatalogue || erreurEquipesLot ? <p>Lecture à réessayer.</p> : equipementsNoms.length ? <ul className={styles.etiquettes}>{equipementsNoms.map(nom => <li key={nom}>{nom}</li>)}</ul> : <p>{nbEquip ? `${nbEquip} équipement(s) rattaché(s).` : "Aucun équipement renseigné."}</p>}
        </div>
      </section>
      <div className={styles.colonneApercu}>
        <section className={styles.panneau} aria-labelledby="titre-proprietaires-lot">
          <header className={styles.panneauEntete} data-ton="or"><span className={styles.panneauIcone}><Users size={18} aria-hidden="true" /></span><h2 id="titre-proprietaires-lot">Propriétaires</h2><a href="#detention">Gérer <ArrowUpRight size={14} aria-hidden="true" /></a></header>
          {erreurDetentions ? <p className={styles.texteVide}>Lecture à réessayer.</p> : detentionsActives.length ? <ul className={styles.proprietaires}>{detentionsActives.map(d => {
            const personne = d.person as unknown as { nom: string; prenom: string | null } | null;
            const nom = nomPersonne(personne);
            return <li key={d.id}><span className={styles.avatar} aria-hidden="true">{personne ? [personne.prenom?.[0], personne.nom[0]].filter(Boolean).join("").toUpperCase() : "—"}</span><div><strong>{nom}</strong><small>Propriétaire du lot</small></div><span className={styles.quotePart}>{Number(d.quote_part)} %</span></li>;
          })}</ul> : <p className={styles.texteVide}>Aucun propriétaire rattaché.</p>}
        </section>
        <section className={styles.panneau} aria-labelledby="titre-batiment-lot">
          <header className={styles.panneauEntete} data-ton="vert"><span className={styles.panneauIcone}><Building2 size={18} aria-hidden="true" /></span><h2 id="titre-batiment-lot">Le bâtiment</h2><a href="#batiment">Modifier <ArrowUpRight size={14} aria-hidden="true" /></a></header>
          <dl className={styles.infosApercu}>
            <div><dt>Construction</dt><dd>{valeurLogement(bien.annee_construction)}</dd></div>
            <div><dt>Copropriété</dt><dd>{bien.copropriete ? "Oui" : "Non"}</dd></div>
            <div><dt>Parties communes</dt><dd>{valeurLogement(bien.parties_communes)}</dd></div>
            <div><dt>Internet, téléphone, TV</dt><dd>{valeurLogement(bien.acces_tic)}</dd></div>
          </dl>
        </section>
      </div>
    </div>
    <nav className={styles.actionsRapides} aria-label="Actions rapides du lot">
      <a href="#diagnostics"><FileText size={19} aria-hidden="true" /><span><strong>Diagnostics</strong><small>Consulter les documents et leurs dates</small></span><ArrowUpRight size={15} aria-hidden="true" /></a>
      <a href="#baux"><KeyRound size={19} aria-hidden="true" /><span><strong>Baux et états des lieux</strong><small>Retrouver les contrats du logement</small></span><ArrowUpRight size={15} aria-hidden="true" /></a>
      <Link href={`/agence/${orgId}/reseau?bien=${bienId}`}><Wrench size={19} aria-hidden="true" /><span><strong>Artisans</strong><small>Consulter le réseau pour ce bien</small></span><ArrowUpRight size={15} aria-hidden="true" /></Link>
    </nav>
    <details className={styles.gestionStatut}><summary>Gérer le statut du lot <ChevronDown size={16} aria-hidden="true" /></summary><div>
      {lot.etat === "brouillon" && !erreurBlocages && <BlocagesLocation motifs={(blocages ?? []) as string[]} ctx={{orgId,bienId,lotId}} pageCourante={`/agence/${orgId}/parc/${bienId}/lots/${lotId}`} titre="Ce qui empêche la mise en location" />}
      <BoutonsEtatLot orgId={orgId} bienId={bienId} lotId={lotId} etat={lot.etat} bailHref={bailEnCours ? `/agence/${orgId}/baux/${bailEnCours.id}` : undefined} />
    </div></details>
  </div>;

  const retourContrat = retourBailDuLot(orgId, retourBail, retourEtape, baux ?? []);
  const ficheHref = `/agence/${orgId}/parc/${bienId}/lots/${lotId}`;
  if (parcours === "1") return <main className={`mx-auto w-full p-4 sm:p-7 ${parcoursStyles.pageCreation}`}>
    <Link href={retourContrat ?? ficheHref} className="inline-flex min-h-11 items-center text-sm">← {retourContrat ? "Revenir au bail" : "Retour au logement"}</Link>
    <header className={parcoursStyles.enteteCreation}><House size={27} aria-hidden="true"/><div><span className={parcoursStyles.surtitre}>Votre logement</span><h1>Compléter le lot</h1><p>Les informations permanentes de {lot.nom}. Elles seront reprises dans chaque bail.</p></div></header>
    <EchecLecture quoi={echecs} />
    <ParcoursLot initiale={etape ?? "lot"} resume={<div className="space-y-2"><strong>{lot.nom}</strong><p>{bien.address_line1}<br />{bien.postal_code} {bien.city}</p><p>{lot.surface_m2 == null ? "Surface à compléter" : formaterSurface(lot.surface_m2)}</p></div>} contenus={[
      <FormulaireBien key="bien" orgId={orgId} bien={bien} />,
      <FormulaireLot key="lot" orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={bien.copropriete} libelleEnregistrer="Enregistrer les caractéristiques" />,
      <div key="proprietaires">{rubriqueDetention}</div>,
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
        <div className="flex flex-wrap gap-3"><Link className="btn-or" href={retourContrat ?? ficheHref}>{retourContrat ? "Revenir au bail" : "Terminer et voir le lot"}</Link>{!retourContrat && <Link className="btn-secondaire" href={`${ficheHref}#baux`}>Passer à la création d’un bail <ArrowRight size={16} aria-hidden="true" /></Link>}</div>
        <p className="text-sm text-muted-foreground">Locataires, garants, dates, loyer, clauses et signature se renseignent dans le parcours du bail.</p>
      </div>
    ]} />
  </main>;
  return (
    <main className={`${styles.fiche} dossier-location mx-auto w-full max-w-7xl space-y-[1.125rem] p-4 sm:p-7`}>
      <Link href={`/agence/${orgId}/parc`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground">← {role === "proprietaire_direct" ? "Mes lots" : "Mon portefeuille"}</Link>
      <header className={styles.entete}>
        <div className={styles.identite}><span className={styles.icone}><House size={28} aria-hidden="true" /></span><div className="min-w-0"><p className={styles.surtitre}>Fiche du lot{bien.nom !== lot.nom ? ` · ${bien.nom}` : ""}</p><div className="flex flex-wrap items-center gap-3"><h1>{lot.nom}</h1><span className={COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}>{ETATS_LOT[lot.etat] ?? lot.etat}</span></div><p className={styles.adresse}><MapPin size={15} aria-hidden="true" />{[bien.address_line1, bien.address_line2, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Adresse à compléter"}</p></div></div>
        <div className={styles.actions}><Link className="btn-secondaire" href={`/agence/${orgId}/parc/${bienId}/lots/${lotId}?modifier=1#caracteristiques`}><Pencil size={15} aria-hidden="true" /> Modifier le lot</Link></div>
        <dl className={styles.identiteFaits}>
          <div><dt><Ruler size={14} aria-hidden="true" />Surface</dt><dd>{lot.surface_m2 == null ? "À renseigner" : formaterSurface(lot.surface_m2)}</dd></div>
          <div><dt><DoorOpen size={14} aria-hidden="true" />Pièces</dt><dd>{lot.pieces ?? "À renseigner"}</dd></div>
          <div><dt><Layers3 size={14} aria-hidden="true" />Étage</dt><dd>{valeurLogement(lot.etage)}</dd></div>
          <div><dt><Sofa size={14} aria-hidden="true" />Mobilier</dt><dd>{lot.meuble ? "Meublé" : "Non meublé"}</dd></div>
        </dl>
      </header>
      <div className={styles.indicateurs}>
        <div><span className={styles.indicateurIcone}><Wallet size={20} aria-hidden="true" /></span><div><span>Loyer actif · charges comprises</span><strong>{erreurBaux ? "Lecture à réessayer" : loyerCc === null ? "Aucun bail actif" : `${eur(loyerCc)} / mois`}</strong><small>{bauxEnCours.length > 1 ? "Premier contrat · détail dans les baux" : loyerCc === null ? "Le loyer sera repris du bail activé" : "Montant mensuel du contrat en cours"}</small></div></div>
        <div data-ton="or"><span className={styles.indicateurIcone}><Users size={20} aria-hidden="true" /></span><div><span>{bauxEnCours.length > 1 ? "Locations en cours" : "Locataire en place"}</span><strong>{erreurPersonnes || erreurBaux ? "Lecture à réessayer" : bauxEnCours.length > 1 ? `${bauxEnCours.length} contrats en cours` : recapLocataire ?? (bailEnCours ? "Locataire non renseigné" : "Aucun bail actif")}</strong><a href="#baux">Consulter les baux <ArrowRight size={12} aria-hidden="true" /></a></div></div>
        <div data-ton="vert"><span className={styles.indicateurIcone}><FileText size={20} aria-hidden="true" /></span><div><span>Diagnostics déposés</span><strong>{erreurDiagnostics || erreurDiagnosticsBien ? "Lecture à réessayer" : `${nbDiag + nbDiagBien} document${nbDiag + nbDiagBien > 1 ? "s" : ""}`}</strong><a href="#diagnostics">Consulter et compléter <ArrowRight size={12} aria-hidden="true" /></a></div></div>
      </div>
      <div className={styles.contenu}>
      <EchecLecture quoi={echecs} />
      {attention.length > 0 && <div className={styles.alertes}><p className="mb-2 text-sm font-semibold">À compléter dans votre dossier</p><AttentionFiche points={attention} /></div>}

      {/* LA LOCATION D'ABORD, et c'est le correctif de fond du 11/09. Pour un
          lot loué, la seule question qui se pose en ouvrant la fiche est : qui
          habite, pour combien, jusqu'à quand. Ces trois faits étaient au FOND
          de la page, repliés sous « Baux & état des lieux », derrière neuf
          rangées de caractéristiques dont quatre vides — précédés d'un
          paragraphe expliquant le cycle de vie d'un lot, affiché à chaque
          visite, qui occupait à lui seul le premier écran d'un téléphone. */}
      <OngletsDossier initial={modifier === "1" ? 1 : 0} onglets={[
        {titre: "Vue d’ensemble", ancres:["location-apercu"], contenu:vueEnsemble},
        {titre: "Logement", ancres:["caracteristiques","batiment","detention","pieces","equipements"], contenu:<Card><CardContent className="space-y-5 pt-5"><div id="caracteristiques"><RecapLot key={modifier ?? "lecture"} orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} copropriete={bien.copropriete} modifierInitial={modifier === "1"} /></div><SectionLot id="batiment" titre="Adresse et bâtiment" resume={[bien.address_line1, bien.city].filter(Boolean).join(" · ")}><FormulaireBien orgId={orgId} bien={bien} /></SectionLot>{rubriqueDetention}{rubriquePieces}{rubriqueEquipements}</CardContent></Card>},
        {titre: "Diagnostics", ancres:["diagnostics","diagnostics-immeuble"], contenu:<Card><CardContent className="space-y-5 pt-5">{rubriqueDiagnostics}{rubriqueDiagnosticsImmeuble}</CardContent></Card>},
        {titre: "Baux et états des lieux", ancres:["baux"], contenu:<Card><CardContent className="pt-5">{rubriqueBaux}</CardContent></Card>},
        ...((bien.copropriete || colocationPertinente) ? [{titre:"Gestion complémentaire", ancres:["charges","chambres"], contenu:<Card><CardContent className="space-y-5 pt-5">          {colocationPertinente && !(bailEnCours && nbChambres === 0) && (
            <SectionLot
              id="chambres"
              titre="Colocation · contrats individuels"
              resume={
                nbChambres === 0
                  ? "Aucune chambre préparée"
                  : `${nbChambres} chambre${nbChambres > 1 ? "s" : ""} préparée${nbChambres > 1 ? "s" : ""}`
              }
            >
              {erreurChambres ? <p role="alert" className="err">Les chambres n’ont pas pu être chargées. Rechargez la page.</p> : <ChambresLogement orgId={orgId} lotId={lotId} bienId={bienId} chambres={chambres ?? []} plafond={lot.colocation_loyer_reference} />}
            </SectionLot>
          )}

          {/* Charges de copropriété (module 0c) — appels du syndic, ventilés */}
          {bien.copropriete && (
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
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                appels={appelsCharges}
                anneeCourante={new Date().getFullYear()}
              />
            </SectionLot>
          )}</CardContent></Card>}] : []),
      ]} />
      </div>
    </main>
  );
}
