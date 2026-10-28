import { SuiviBailLecture, HistoriqueBailLecture } from "./suivi-bail-lecture";
import { OngletsDossier } from "@/components/onglets-dossier";
import { avertissementsCoherenceLoyer } from "@/lib/coherence-loyer";
import { avertissementsDatesBail } from "@/lib/coherence-dates-bail";
import { AvertissementsLoyer } from "@/components/avertissements-loyer";
import { SupprimerBailBrouillon } from "@/components/supprimer-bail-brouillon";
import { FormulaireParcoursBail } from "./formulaire-parcours-bail";
import { DocumentsParcoursBail } from "./documents-parcours-bail";
import { RecapitulatifParcoursBail } from "./recapitulatif-parcours-bail";
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
import { archiveSignee, signatureDuBail } from "@/lib/presentation-signatures";
import { FinaliserParcoursBail } from "./finaliser-parcours-bail";
import { derniereVersionGeneree } from "@/lib/documents/version-generee";
import { estContratAFaireSigner } from "@/lib/documents/modeles/communs";
import { EtapePersonnesBail } from "./etape-personnes-bail";
import { AssistantBail } from "./assistant-bail";
import { verifierDossierBail } from "./verifier-dossier";
import Link from "next/link";
import { ChambresLogement } from "../../parc/[bienId]/lots/[lotId]/chambres-logement";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { bailPrecedentDuLot } from "@/lib/reprise-bail-precedent";
import { CompleterSurPlace } from "./completer-sur-place";
import { RubriqueDossier } from "@/components/rubrique-dossier";
import styles from "./bail.module.css";
import { FileText, CalendarDays, Wallet, ShieldCheck, Users, House } from "lucide-react";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate, eur, aujourdhuiParis } from "@/lib/ged";
import {
  TYPES_BAIL,
  ETATS_BAIL,
  COULEURS_ETAT_BAIL,
  COULEURS_ETAT_EDL,
  mentionsObligatoiresManquantes,
  etatDecompteSortie,
} from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import { premier } from "@/lib/postgrest";
import { actionsAttendues } from "@/lib/actions-attendues";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ETATS_ELEMENT, COULEURS_ETAT_ELEMENT } from "@/lib/etats-elements-edl";
import { REGLE_ECART_EDL } from "@/lib/regle-ecart-edl";
import {
  FormulaireBailSigne,
  FormulaireReglementCopropriete,
  FormulaireConge,
  FormulaireAnnulerConge,
  BoutonTerminerBail,
  FormulaireCreerEdl,
} from "./formulaires-bail";
import { FormulaireEditionBail } from "./formulaire-edition-bail";
import { FormulaireComplementsBail } from "./formulaire-complements-bail";
import { GenererCongeBailleur } from "./generer-conge-bailleur";
import { GenererAvenant } from "./generer-avenant";
import { CarteCautionnement } from "./carte-cautionnement";
import { ConseilsChoixLocataire } from "@/components/conseils-choix-locataire";
import { CONSEILS_LOCATAIRE_VALIDES } from "@/lib/conseils-locataire";
import { CarteBailSigne } from "./carte-bail-signe";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { FormulaireInventaire, type LigneInventaire } from "./formulaire-inventaire";
import { FormulaireColocation, type LigneColoc } from "./formulaire-colocation";
import {
  FormulaireLoyers,
  type LigneEcheance,
  type Encaissement,
  type Quittance,
  type Revision,
  type RelanceLigne,
  type RegulLigne,
} from "./formulaire-loyers";
import {
  FormulaireRestitution,
  type Restitution,
  type Retenue,
} from "./formulaire-restitution";
import { FormulaireDepot, type EncaissementDepot } from "./formulaire-depot";
import { CarteConservationBail } from "./carte-conservation-bail";
import { EchecLecture, PageEchecLecture } from "../../parc/echec-lecture";
import { exigerUuids } from "@/lib/identifiants";
import { baseEspace, racineEspace } from "@/lib/racine-espace";

export const metadata = { title: "Bail — Gerimmo" };

export default async function PageBail(props: PageProps<"/agence/[orgId]/baux/[bailId]">) {
  const { orgId, bailId } = await props.params;
  exigerUuids(bailId);
  const { supabase, organisation, estProprietaire, traverseeLectureSeule } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  const agence = organisation.type === "agence";
  // Rappel « Conseils pour choisir votre locataire », à côté des garants : le
  // propriétaire en gestion directe seulement. L'agence (hors site public V1)
  // garde la fiche telle qu'elle était. Le même bloc, replié, que dans le
  // parcours de création (étape « Personnes »).
  const rappelConseilsLocataire = estProprietaire && CONSEILS_LOCATAIRE_VALIDES ? <ConseilsChoixLocataire emplacement="garanties-bail" className="mt-4" /> : null;

  const { data: bail, error: erreurBail } = await supabase
    .from("baux")
    // Colonnes du cycle de vie + « Compléments du contrat » (bail 100 % rempli, 09/09)
    .select(
      "id, chambre_id, type, etat, zone_tendue, loyer_hc, charges, depot_garantie, jour_echeance, lot_id, locataire_principal, document_signe, reglement_copropriete, signe_envoye_le, date_debut, date_fin, date_sortie_reelle, revision_irl, charges_mode, irl_trimestre, fixation_loyer, paiement_echeance, lieu_paiement, irl_valeur, duree_reduite_evenement, travaux_recents, travaux_recents_montant, travaux_locataire, honoraires_bailleur, honoraires_locataire, clauses_particulieres, loyer_reference, loyer_reference_majore, complement_loyer, complement_justification, dernier_loyer, dernier_loyer_versement, dernier_loyer_revision, precedente_location, precedent_loyer_revise, meuble_etudiant, date_conclusion_prevue, servitude_residence_principale, encadrement_loyer, zone_honoraires, honoraires_edl_bailleur, honoraires_edl_locataire, dpe_depenses_min, dpe_depenses_max, dpe_annees_reference, clause_resolutoire_assurance, clause_resolutoire_troubles, clause_resolutoire_servitude"
    )
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Un échec de lecture n'est pas un bail supprimé : `notFound()` ferait
  // chercher un dossier qui existe (relevé du 11/09).
  if (erreurBail)
    return (
      <PageEchecLecture
        titre="Bail"
        quoi={["le bail"]}
        retour={{ href: `${base}/parc`, libelle: "Parc" }}
      />
    );
  if (!bail) notFound();
  const suiviSignature = await lirePresentationSignatures(orgId, { baux: [bailId] });
  const documentSigne = bail.document_signe ?? archiveSignee(signatureDuBail(suiviSignature.circuits, bailId));
  const signeNonActif = bail.etat === "brouillon" && Boolean(documentSigne);
  const assistantBailAffiche = bail.etat === "brouillon" && !traverseeLectureSeule;
  // Le dernier PDF du contrat déjà généré est proposé à la relecture dès l'ouverture, au lieu de « À générer »
  // après chaque rechargement — ce qui faisait regénérer et empiler des brouillons (audit final, BAIL-04).
  const pdfContrat = assistantBailAffiche && !documentSigne
    ? await derniereVersionGeneree(supabase, orgId, { typeGed: "bail", entite: "bail", entiteId: bailId, titre: estContratAFaireSigner })
    : { version: null };

  const { data: chambres, error: erreurChambres } = await supabase.from("lot_chambres").select("id, nom, surface_m2, volume_m3, description, espaces_partages").eq("lot_id", bail.lot_id).eq("organization_id", orgId).order("nom");
  const chambre = chambres?.find(c => c.id === bail.chambre_id);

  const [
    { data: lot, error: erreurLot },
    { count: piecesDuLot },
    { data: locataire, error: erreurLocataire },
    { data: edls, error: erreurEdls },
    { data: conges, error: erreurConges },
    { data: inventaire, error: erreurInventaire },
    { data: personnes, error: erreurPersonnes },
    { data: bailPersonnes, error: erreurBailPersonnes },
    { data: intentions, error: erreurIntentions },
  ] = await Promise.all([
      supabase.from("lots").select("id, nom, bien_id, meuble, surface_m2, colocation_loyer_reference, bien:biens!lots_bien_id_fkey(zone_tendue, copropriete)").eq("id", bail.lot_id).maybeSingle(),
      // Les pièces déclarées du lot : leur absence rend l'état des lieux générique.
      supabase
        .from("lot_pieces")
        .select("id", { count: "exact", head: true })
        .eq("lot_id", bail.lot_id),
      bail.locataire_principal
        ? supabase.from("persons").select("nom, prenom, email").eq("id", bail.locataire_principal).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("etats_des_lieux")
        .select("id, type, etat")
        .eq("bail_id", bailId)
        .order("type"),
      supabase
        .from("conges")
        .select("par, date_premiere_presentation, preavis_mois, date_effet, motif, annule_le, annulation_motif")
        .eq("bail_id", bailId)
        .order("created_at", { ascending: false }),
      supabase
        .from("inventaire_lignes")
        .select("id, piece, designation, quantite, etat, observation")
        .eq("bail_id", bailId)
        .order("ordre")
        .order("created_at"),
      supabase
        .from("persons")
        .select("id, nom, prenom")
        .eq("organization_id", orgId)
        .order("nom"),
      supabase
        .from("bail_personnes")
        .select("id, person_id, role, quote_part, surface_privative, garant_de, date_depart, date_solidarite_fin")
        .eq("bail_id", bailId),
      // Intention de congé transmise depuis l'espace locataire, en attente de
      // la lettre recommandée (le congé s'enregistre à sa réception)
      supabase
        .from("intentions_conge")
        .select("created_at, motif")
        .eq("bail_id", bailId)
        .is("traitee_le", null)
        .order("created_at", { ascending: false }),
    ]);

  // Mentions obligatoires du contrat encore absentes (wiki « Mentions
  // obligatoires du bail »). La base les EXIGE à l'activation ; l'écran les
  // NOMME avant le geste, plutôt que de laisser le dépôt du PDF échouer.
  const mentions = mentionsObligatoiresManquantes(bail);
  // Audit 29/09 : le congé du bailleur vise le terme calculé par la base
  // (même règle que son enregistrement), jamais une date saisie à la main.
  const { data: termeBail } =
    bail.etat === "actif"
      ? await supabase.rpc("terme_bail", { p_bail: bailId })
      : { data: null };
  // ED-01 : l’assurance du locataire classée pendant la préparation reste
  // visible sur le bail conclu ; l’assistant ne l’affiche qu’en brouillon.
  const { data: assuranceLocataire, error: erreurAssuranceLocataire } = bail.etat !== "brouillon"
    ? await supabase.from("pieces_attendues_bail").select("document:documents(id,titre,expire_le,purged_at)")
      .eq("organization_id", orgId).eq("bail_id", bailId).eq("nature", "assurance_locataire").maybeSingle()
    : { data: null, error: null };
  const attestationLocataire = premier(assuranceLocataire?.document ?? null);
  // Relocation (décision du 27/10, CB-08) : le bail précédent du lot dont le brouillon a repris les conditions
  // à sa création ; l’étape Loyer signale les valeurs encore identiques et propose de les effacer.
  const { data: bauxPrecedents } = bail.etat === "brouillon"
    ? await supabase.from("baux").select("id, chambre_id, type, date_debut, date_fin, date_sortie_reelle, loyer_hc, charges, charges_mode, jour_echeance, paiement_echeance, revision_irl, irl_trimestre, irl_valeur").eq("organization_id", orgId).eq("lot_id", bail.lot_id).in("etat", ["termine", "preavis"])
    : { data: null };
  const bailPrecedent = bailPrecedentDuLot(Array.isArray(bauxPrecedents) ? bauxPrecedents : []);

  // Résolution des noms pour la colocation (colocataires + garants nominatifs)
  const nomsPersonnes = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      nomComplet(p),
    ])
  );
  const lignesColoc: LigneColoc[] = (
    (bailPersonnes ?? []) as {
      id: string;
      person_id: string;
      role: string;
      quote_part: number | null;
      surface_privative: number | null;
      garant_de: string | null;
      date_depart: string | null;
      date_solidarite_fin: string | null;
    }[]
  ).map((l) => ({
    id: l.id,
    person_id: l.person_id,
    person_nom: nomsPersonnes.get(l.person_id) ?? "Personne",
    role: l.role,
    quote_part: l.quote_part,
    surface_privative: l.surface_privative,
    garant_de: l.garant_de,
    date_depart: l.date_depart,
    date_solidarite_fin: l.date_solidarite_fin,
    garant_de_nom: l.garant_de ? nomsPersonnes.get(l.garant_de) ?? null : null,
  }));
  // Les garants du bail (id = PERSONNE, pas la ligne) — pour le cautionnement
  const garantsDuBail = lignesColoc
    .filter((l) => l.role === "garant")
    .map((l) => ({ id: l.person_id, nom: l.person_nom }));

  const edlSignes = (edls ?? []).filter((e) => e.etat === "signe");
  const comparatifPossible =
    edlSignes.some((e) => e.type === "entree") && edlSignes.some((e) => e.type === "sortie");
  // Loyers (dès que le bail n'est plus en brouillon)
  const loyersActif = bail.etat !== "brouillon";
  // Restitution du dépôt : dès que le bail est en préavis ou terminé
  const restitutionActif = bail.etat === "preavis" || bail.etat === "termine";

  // Perf 30/08 : trois lectures qui ne dépendent que du bail partaient l'une
  // après l'autre (comparatif, loyers, restitution puis retenues) — une seule
  // vague, les retenues embarquées dans la restitution.
  // Même forme que les vraies réponses (data + error) : sans `error`, le
  // repli ne se destructure plus une fois les échecs relevés.
  const vide = { data: [] as never[], error: null };
  const [
    // Blocages du bail en cours (source commune avec l'accueil, audit 09/09) :
    // impayés, EDL d'entrée non signé, diagnostics obligatoires en défaut.
    attendues,
    { data: comparatif, error: erreurComparatif },
    [
      { data: echeancier, error: erreurEcheancier },
      { data: encaissements, error: erreurEncaissements },
      { data: quittances, error: erreurQuittances },
      { data: revisions, error: erreurRevisions },
      { data: relances, error: erreurRelances },
      { data: regularisations, error: erreurRegul },
      // Encaissement du dépôt : même condition, même aller-retour
      { data: depotEncaissements, error: erreurDepot },
    ],
    { data: restitutionBrute, error: erreurRestitution },
    // Le décompte travaille sur un INSTANTANÉ des montants (dépôt encaissé,
    // impayés) pris au démarrage. On relit la réalité du moment pour que
    // l'écran puisse dire si elle a bougé depuis — il n'en change rien tout
    // seul : la date d'arrêté appartient au gérant.
    { data: montantsAJour, error: erreurMontants },
  ] = await Promise.all([
    loyersActif
      ? actionsAttendues(supabase, orgId, { bailId, racine: racineEspace(estProprietaire) })
      : Promise.resolve([]),
    comparatifPossible
      ? supabase.rpc("comparatif_edl", { p_bail: bailId })
      : Promise.resolve({ data: null, error: null }),
    loyersActif
      ? Promise.all([
        supabase.rpc("etat_loyers_bail", { p_bail: bailId }),
        supabase
          .from("encaissements")
          .select("id, montant, date_paiement, mode, note")
          .eq("bail_id", bailId)
          .order("date_paiement", { ascending: false }),
        supabase
          .from("quittances")
          .select("id, appel_id, montant, date_emission, email_envoye_at, est_quittance")
          .eq("bail_id", bailId),
        supabase
          .from("revisions_loyer")
          .select("id, date_effet, date_echeance, date_demande, irl_trimestre, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau")
          .eq("bail_id", bailId)
          .order("date_effet", { ascending: false }),
        supabase
          .from("relances")
          .select("id, niveau, date_envoi, date_premiere_presentation, numero_recommande, origine")
          .eq("bail_id", bailId)
          .order("date_envoi", { ascending: false }),
        supabase
          .from("regularisations_charges")
          .select("id, annee, provisions, charges_reelles, ecart, tardive, etalement_12_mois, quote_part_colocation")
          .eq("bail_id", bailId)
          .order("annee", { ascending: false }),
        supabase
          .from("depot_encaissements")
          .select("id, montant, date_encaissement, moyen, versant_libelle, versant_person_id")
          .eq("bail_id", bailId)
          .order("date_encaissement"),
      ])
      : Promise.resolve([vide, vide, vide, vide, vide, vide, vide]),
    restitutionActif
      ? supabase
          .from("restitutions")
          .select(
            "id, date_remise_cles, delai_mois, depot, impayes, trop_percu, montants_arretes_le, sans_edl_entree, statut, solde, date_emission, envoye_le, retenues(id, libelle, cout, duree_vie_ans, age_ans, montant_retenu, sans_justificatif, created_at)"
          )
          .eq("bail_id", bailId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    restitutionActif
      ? supabase.rpc("montants_restitution_a_jour", { p_bail: bailId })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const ecarts = ((comparatif ?? []) as {
    piece: string | null;
    libelle: string;
    etat_entree: string | null;
    etat_sortie: string | null;
    ecart: boolean;
  }[]).filter((c) => c.ecart);
  const restitution = restitutionBrute as
    | (Restitution & { retenues?: (Retenue & { created_at: string })[] })
    | null;
  const retenues: Retenue[] = [...(restitution?.retenues ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  // La RPC renvoie une ligne par bail (aucune si le bail sort du portefeuille)
  const montantsReels =
    ((montantsAJour ?? []) as { depot: number; impayes: number; trop_percu: number }[])[0] ?? null;

  // La fiche suivait le cycle du bail, mais les cartes de la SORTIE (congé,
  // historique des congés, restitution, comparatif) étaient dispersées entre
  // celles de l'entrée — relevé du 11/09. Elles sont regroupées sous leur
  // propre titre, qui ne s'affiche que si l'une d'elles a quelque chose à dire
  // (sur un brouillon, aucune : le titre resterait vide).
  const sectionSortie =
    bail.etat === "actif" ||
    (conges ?? []).length > 0 ||
    restitutionActif ||
    Boolean(comparatif);

  // Ce que la base n'a pas su rendre. Sans ce relevé, un échéancier illisible
  // se présente comme un bail sans loyers appelés, et l'écran propose de les
  // regénérer — sur un bail qui en a déjà.
  const echecs: string[] = [];
  const noter = (libelle: string, erreur: unknown) => {
    if (erreur) echecs.push(libelle);
  };
  noter("le lot", erreurLot);
  noter("le locataire", erreurLocataire);
  noter("les états des lieux", erreurEdls);
  noter("les congés", erreurConges);
  noter("l’inventaire du mobilier", erreurInventaire);
  noter("les personnes de l’agence", erreurPersonnes);
  noter("les colocataires et garants", erreurBailPersonnes);
  noter("les départs annoncés par le locataire", erreurIntentions);
  noter("le comparatif entrée / sortie", erreurComparatif);
  noter("l’échéancier des loyers", erreurEcheancier);
  noter("les encaissements", erreurEncaissements);
  noter("les quittances", erreurQuittances);
  noter("les révisions de loyer", erreurRevisions);
  noter("les relances", erreurRelances);
  noter("les régularisations de charges", erreurRegul);
  noter("les encaissements du dépôt de garantie", erreurDepot);
  noter("la restitution du dépôt", erreurRestitution);
  noter("les montants de restitution à jour", erreurMontants);

  // « À faire maintenant » : la page suit le cycle de vie du bail, mais un
  // agent qui débute ne connaît pas l'ordre — on le déduit des données et on
  // l'affiche en tête, chaque étape pointant vers sa carte. 3 étapes maximum :
  // au-delà, la liste redevient du bruit.
  const edlEntreeSigne = (edls ?? []).some((e) => e.type === "entree" && e.etat === "signe");
  const edlSortieSigne = (edls ?? []).some((e) => e.type === "sortie" && e.etat === "signe");
  const depotEncaisse = ((depotEncaissements ?? []) as { montant: number }[]).reduce(
    (s, e) => s + Number(e.montant),
    0
  );
  const resteDepot = Number(bail.depot_garantie ?? 0) - depotEncaisse;
  // Le dépôt s'encaisse à l'entrée et se restitue à la sortie (RM-2.1.3) : une
  // fois le bail terminé ou le décompte arrêté (figé, RM-2.7.3), plus rien ne
  // rentre — la base le refuse (encaisser_depot), l'écran ne le propose plus.
  const depotEncaissable = bail.etat !== "termine" && restitution?.statut !== "finalise";
  const aFaire: { texte: string; href: string }[] = [];
  // Sprint « Alertes & documents » : plus de bouton « Valider » — le dépôt du
  // bail signé active le bail et loue le lot ; l'état des lieux d'entrée se
  // signe à la remise des clés, avant ou après, et une alerte le rappelle.
  if (bail.etat === "brouillon") {
    // En premier : sans ses mentions obligatoires, le bail ne s'active pas —
    // inutile d'envoyer l'agent chercher le PDF signé avant de le lui dire.
    if (mentions.length > 0)
      aFaire.push({
        texte: `Compléter les mentions obligatoires du contrat (${mentions.join(", ").toLowerCase()})`,
        href: "#corriger",
      });
    if (!edlEntreeSigne && piecesDuLot === 0 && !bail.chambre_id)
      aFaire.push({
        texte:
          "Déclarer les pièces du lot — sans elles, l'état des lieux ne distingue pas la cuisine de la chambre",
        href: `${base}/parc/${lot?.bien_id}/lots/${bail.lot_id}#pieces`,
      });
    if (!edlEntreeSigne)
      aFaire.push({ texte: "Réaliser et signer l'état des lieux d'entrée (à la remise des clés)", href: "#edl" });
    if (mentions.length === 0)
      aFaire.push({
        texte: "Déposer le bail signé (PDF) — il active le bail et loue le lot",
        href: "#bail-signe",
      });
  } else {
    // Déclarer les pièces vient AVANT l'état des lieux : une fois signé, il est
    // figé, et une grille sans pièces ne rattache aucune dégradation à un endroit.
    if (!edlEntreeSigne && piecesDuLot === 0 && !bail.chambre_id)
      aFaire.push({
        texte:
          "Déclarer les pièces du lot — sans elles, l'état des lieux ne distingue pas la cuisine de la chambre",
        href: `${base}/parc/${lot?.bien_id}/lots/${bail.lot_id}#pieces`,
      });
    // Les blocages calculés par la source commune (impayés, EDL d'entrée,
    // diagnostics obligatoires) — les mêmes items que l'accueil affiche.
    for (const a of attendues) {
      aFaire.push({
        texte: a.detail ? `${a.titre} (${a.detail})` : a.titre,
        href: a.href,
      });
    }
    if (resteDepot > 0 && depotEncaissable)
      aFaire.push({
        texte: `Encaisser le dépôt de garantie (reste ${eur(resteDepot)})`,
        href: "#depot",
      });
    if ((echeancier ?? []).length === 0)
      aFaire.push({ texte: "Générer l'échéancier des loyers", href: "#loyers" });
    if (bail.etat === "preavis" && !edlSortieSigne)
      aFaire.push({
        texte: `Prévoir l'état des lieux de sortie${bail.date_fin ? ` (départ le ${formaterDate(bail.date_fin)})` : ""}`,
        href: "#edl",
      });
    if ((bail.etat === "preavis" || bail.etat === "termine") && edlSortieSigne && !restitution)
      aFaire.push({ texte: "Démarrer la restitution du dépôt de garantie", href: "#restitution" });
    if (restitution && (restitution as { statut: string }).statut === "en_cours")
      aFaire.push({ texte: "Finaliser le décompte de restitution", href: "#restitution" });
  }

  const complementsContrat = (<FormulaireComplementsBail
            surfaceHabitable={lot?.surface_m2}
            loyerHc={bail.loyer_hc}
            individuel={Boolean(bail.chambre_id)}
            orgId={orgId}
            bailId={bailId}
            defauts={{
              fixation_loyer: bail.fixation_loyer,
              paiement_echeance: bail.paiement_echeance,
              lieu_paiement: bail.lieu_paiement,
              irl_valeur: bail.irl_valeur,
              duree_reduite_evenement: bail.duree_reduite_evenement,
              travaux_recents: bail.travaux_recents,
              travaux_recents_montant: bail.travaux_recents_montant,
              travaux_locataire: bail.travaux_locataire,
              honoraires_bailleur: bail.honoraires_bailleur,
              honoraires_locataire: bail.honoraires_locataire,
              clauses_particulieres: bail.clauses_particulieres,
              loyer_reference: bail.loyer_reference,
              loyer_reference_majore: bail.loyer_reference_majore,
              complement_loyer: bail.complement_loyer,
              complement_justification: bail.complement_justification,
              dernier_loyer: bail.dernier_loyer,
              dernier_loyer_versement: bail.dernier_loyer_versement,
              dernier_loyer_revision: bail.dernier_loyer_revision,
              precedente_location: bail.precedente_location,
              precedent_loyer_revise: bail.precedent_loyer_revise,
              meuble_etudiant: Boolean(bail.meuble_etudiant),
              date_conclusion_prevue: bail.date_conclusion_prevue,
              servitude_residence_principale: bail.servitude_residence_principale,
              encadrement_loyer: bail.encadrement_loyer,
              zone_honoraires: bail.zone_honoraires,
              honoraires_edl_bailleur: bail.honoraires_edl_bailleur,
              honoraires_edl_locataire: bail.honoraires_edl_locataire,
              dpe_depenses_min: bail.dpe_depenses_min,
              dpe_depenses_max: bail.dpe_depenses_max,
              dpe_annees_reference: bail.dpe_annees_reference,
              clause_resolutoire_assurance: bail.clause_resolutoire_assurance,
              clause_resolutoire_troubles: bail.clause_resolutoire_troubles,
              clause_resolutoire_servitude: bail.clause_resolutoire_servitude,

            }}
            zoneTendue={Boolean(bail.zone_tendue ?? premier(lot?.bien ?? null)?.zone_tendue)}
            meuble={bail.type === "meuble" || (bail.type === "colocation" && Boolean(lot?.meuble))}
            agence={agence}
            modifiable={bail.etat === "brouillon"}
          />);
  const annexesContrat = (<div id="inventaire" className="space-y-4">      {/* Cautionnement : un acte par garant (réforme 2021 — mention type à
          apposer par la caution), forme solidaire par défaut. */}
      {garantsDuBail.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cautionnement</CardTitle>
            <CardDescription>
              Un acte par garant : forme (solidaire par défaut ou simple),
              plafond garanti, mention type à apposer par la caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarteCautionnement orgId={orgId} bailId={bailId} garants={garantsDuBail} />
          </CardContent>
        </Card>
      )}

      {/* Inventaire du mobilier (bail meublé) */}
      {(bail.type === "meuble" || (bail.type === "colocation" && lot?.meuble)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventaire du mobilier</CardTitle>
            <CardDescription>
              Annexe obligatoire du bail meublé (décret 2015-981), reprise dans
              l&apos;état des lieux.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireInventaire
              orgId={orgId}
              bailId={bailId}
              lignes={(inventaire ?? []) as LigneInventaire[]}
            />
          </CardContent>
        </Card>
      )}

</div>);
  const depotSigne = (<div>      {/* Cycle du bail */}
      {(bail.etat === "brouillon" || bail.document_signe) && (
        <Card id="bail-signe" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Bail signé</CardTitle>
            <CardDescription>
              Déposez le contrat signé par les parties pour démarrer la location.
              Le locataire le retrouve ensuite dans « Mes documents ».
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bail.document_signe ? (
              <CarteBailSigne
                orgId={orgId}
                bailId={bailId}
                documentId={bail.document_signe}
                envoyeLe={bail.signe_envoye_le}
                locataireEmail={locataire?.email ?? null}
                // Retour en brouillon possible tant que rien n'a vécu : ni loyer
                // appelé, ni restitution — la base est seule juge.
                corrigeable={
                  bail.etat === "actif" && (echeancier ?? []).length === 0 && !restitution
                }
                actif={bail.etat !== "brouillon"}
              />
            ) : mentions.length > 0 ? (
              // Le dépôt active le bail : ne pas le proposer quand la base le
              // refusera de toute façon — on dit pourquoi et où corriger.
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Le dépôt reste fermé : ce bail n&apos;a pas encore toutes ses
                  mentions obligatoires ({mentions.join(", ").toLowerCase()}).
                </p>
                <a href="#corriger" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Compléter le brouillon →
                </a>
              </div>
            ) : (
              <FormulaireBailSigne orgId={orgId} bailId={bailId} />
            )}
          </CardContent>
        </Card>
      )}

</div>);
  const piecesAdministratives = (<div className="space-y-4">      {/* Documents-0 : la notice d'information (05), annexe obligatoire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notice d&apos;information</CardTitle>
          <CardDescription>
            Le PDF généré est un résumé des droits et obligations, rangé dans Documents. Le texte intégral de la
            notice fixée par l’arrêté du 29 mai 2015 doit être annexé au bail :{" "}
            <a className="underline" href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000030649868" target="_blank" rel="noopener noreferrer">texte officiel sur Légifrance</a>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BoutonGenererDocument
            orgId={orgId}
            code="notice"
            cibleId={bailId}
            cheminRetour={`${base}/baux/${bailId}`}
            libelle="Générer la notice (PDF)"
          />
        </CardContent>
      </Card>

      {(erreurAssuranceLocataire || attestationLocataire) && (
        <Card id="assurance-locataire-bail">
          <CardHeader>
            <CardTitle className="text-base">Assurance du locataire</CardTitle>
            <CardDescription>Attestation classée pendant la préparation du bail. Elle figure aussi sur la fiche du locataire, qui suit son échéance.</CardDescription>
          </CardHeader>
          <CardContent>
            {erreurAssuranceLocataire ? <p role="alert" className="text-sm text-destructive">L’assurance du locataire n’a pas pu être chargée. Actualisez la page.</p>
              : attestationLocataire?.purged_at ? <p className="text-sm text-muted-foreground">{attestationLocataire.titre} : fichier purgé.</p>
              : attestationLocataire && <p className="text-sm">{attestationLocataire.titre}{attestationLocataire.expire_le ? ` · échéance le ${formaterDate(attestationLocataire.expire_le)}` : " · échéance non renseignée"}.{" "}
                <a href={`${base}/documents/${attestationLocataire.id}/fichier`} target="_blank" rel="noreferrer" className="text-[var(--bleu)] underline-offset-2 hover:underline">La consulter</a></p>}
          </CardContent>
        </Card>
      )}

      <Card id="reglement-copro" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Règlement de copropriété</CardTitle>
          <CardDescription>
            À joindre si le logement est en copropriété : les extraits concernant l’usage des parties privatives et communes. Hors copropriété : non applicable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bail.reglement_copropriete ? (
            <p className="text-sm text-success-soft-foreground">
              Règlement déposé.{" "}
              <a
                href={`${base}/documents/${bail.reglement_copropriete}/fichier`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--bleu)] underline-offset-2 hover:underline"
              >
                Le consulter
              </a>
            </p>
          ) : (
            <FormulaireReglementCopropriete orgId={orgId} bailId={bailId} />
          )}
        </CardContent>
      </Card>

</div>);
  const rubriqueContrat = (<RubriqueDossier id="contrat" ouverte titre={bail.etat === "brouillon" ? "Dates et montants" : "Informations du contrat"} resume={bail.etat === "brouillon" ? "Type de contrat, dates, loyer et charges" : "Vérifier le locataire, les montants, les conditions et les garants"}>


      {/* Audit gestion du 29/09 : une zone tendue inconnue ne vaut plus « non ».
          On le dit avant la signature, là où elle se renseigne encore. */}
      {bail.etat === "brouillon" &&
        bail.zone_tendue == null &&
        premier(lot?.bien ?? null)?.zone_tendue == null && (
          <p className="border-l-[3px] border-l-warning bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            Zone tendue non renseignée pour ce logement : elle fixe le préavis du
            locataire (1 mois de plein droit en zone tendue) et le plafond des
            honoraires. Renseignez-la sur la fiche du bien, ou choisissez la zone
            des honoraires, avant la signature. À défaut, un congé du locataire à
            1 mois sera accepté puis signalé à vérifier.
          </p>
        )}
      {/* Brouillon corrigeable (recette 21/08) : la saisie de création se
          reprend ici tant que le bail n'est pas signé. */}
      {bail.etat === "brouillon" && (
        <RubriqueDossier id="corriger" titre="Conditions du bail" resume="Type de contrat, dates et montants" ouverte={mentions.length > 0}>
<Card>
          <CardHeader>
            <CardTitle className="text-base">Corriger le brouillon</CardTitle>
            <CardDescription>
              Type, date d&apos;entrée, montants — tout se reprend tant
              que le bail n&apos;est pas signé.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Le refus doit se lire AVANT le geste : un brouillon amputé d'une
                mention obligatoire ne s'activera pas au dépôt du PDF signé
                (wiki « Mentions obligatoires du bail »). Un brouillon incomplet
                reste enregistrable — c'est le bail qu'on prépare. */}
            {mentions.length > 0 && (
              <div className="border-l-[3px] border-l-destructive bg-destructive-soft p-3">
                <p className="text-sm font-semibold text-destructive-soft-foreground">
                  Mentions obligatoires du contrat à compléter
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-destructive-soft-foreground">
                  {mentions.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-destructive-soft-foreground">
                  Le dépôt du bail signé sera refusé tant qu&apos;elles manquent :
                  sans loyer ni date d&apos;effet, les appels de loyer, le prorata
                  d&apos;entrée et les quittances seraient faux.
                </p>
              </div>
            )}
            <FormulaireEditionBail
              chambres={chambres ?? []}
              orgId={orgId}
              bailId={bailId}
              personnes={(personnes ?? []) as { id: string; nom: string; prenom: string | null }[]}
              defauts={{
                type: bail.type,
                chambre_id: bail.chambre_id,
                locataire_principal: bail.locataire_principal,
                date_debut: bail.date_debut,
                date_conclusion_prevue: bail.date_conclusion_prevue,
                loyer_hc: bail.loyer_hc,
                charges: bail.charges,
                charges_mode: bail.charges_mode,
                depot_garantie: bail.depot_garantie,
                jour_echeance: bail.jour_echeance,
                irl_trimestre: bail.irl_trimestre,
                revision_irl: bail.revision_irl,
              }}
            />
          </CardContent>
        </Card>
</RubriqueDossier>
      )}

      {bail.chambre_id && <Card><CardHeader><CardTitle>Contrat individuel · {chambre?.nom ?? "Chambre"}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {erreurChambres ? <p role="alert">La description de la chambre n’a pas pu être chargée.</p> : <>
          <p>{chambre?.surface_m2} m² privatifs · {chambre?.volume_m3} m³</p><p>{chambre?.description}</p>
          <p><strong>Espaces partagés :</strong> {chambre?.espaces_partages}</p>
        </>}
        <p>Les loyers, régularisations, états des lieux et congés ci-dessous concernent uniquement ce contrat. Les autres colocataires ne sont pas solidaires de ses dettes.</p>
      </CardContent></Card>}

      {/* Compléments du contrat (bail 100 % rempli, 09/09) : les conditions
          détaillées que le contrat type imprime — modifiables en brouillon,
          figées ensuite (le composant gère la lecture seule). */}
      {bail.etat !== "brouillon" && (<>      <RubriqueDossier id="complements" titre="Compléments du contrat" resume="Énergie, paiement, travaux et clauses particulières">
<Card>
        <CardHeader>
          <CardTitle className="text-base">Compléments du contrat</CardTitle>
          <CardDescription>
            Dates, énergie, fixation et paiement du loyer, travaux et honoraires :
            renseignez les conditions convenues avec les parties et vérifiez leur cohérence
            avec le contrat signé.
          </CardDescription>
        </CardHeader>
        <CardContent>
{complementsContrat}
        </CardContent>
      </Card>
</RubriqueDossier></>)}

      {/* Colocation (bail unique) : colocataires + garants — un bail terminé
          ne se complète plus (audit vie du bail 09/09) */}
      {bail.type === "colocation" && !bail.chambre_id && bail.etat !== "termine" && bail.etat !== "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colocataires & garants</CardTitle>
            <CardDescription>
              Bail unique solidaire : ajoutez les colocataires (quote-part) et les
              garants (nominatifs).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireColocation
              orgId={orgId}
              bailId={bailId}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: nomComplet(p) })
              )}
              lignes={lignesColoc}
              principal={{
                id: bail.locataire_principal ?? "",
                nom: locataire ? nomComplet(locataire) : "—",
              }}
              colocation
              etatBail={bail.etat}
            />
            {rappelConseilsLocataire}
          </CardContent>
        </Card>
      )}

      {/* Garants d'un bail nu ou meublé (hors colocation, qui a sa carte) —
          l'acte de cautionnement se génère dans la carte suivante. */}
      {(bail.type !== "colocation" || bail.chambre_id) && bail.etat !== "termine" && bail.etat !== "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Garants</CardTitle>
            <CardDescription>
              Rattachez le ou les garants du bail — l&apos;acte de cautionnement
              se génère dans la carte « Cautionnement ».
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireColocation
              orgId={orgId}
              bailId={bailId}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: nomComplet(p) })
              )}
              lignes={lignesColoc}
              principal={{
                id: bail.locataire_principal ?? "",
                nom: locataire ? nomComplet(locataire) : "—",
              }}
              colocation={false}
              etatBail={bail.etat}
            />
            {rappelConseilsLocataire}
          </CardContent>
        </Card>
      )}

      {annexesContrat}
      </RubriqueDossier>);
  const rubriqueSignature = (<RubriqueDossier id="signature" ouverte titre={bail.etat === "brouillon" ? "Créer et faire signer le bail" : "Bail signé et documents"} resume={bail.document_signe ? "Retrouver le contrat signé et ses annexes" : "Créer le PDF, le faire signer aux parties, puis déposer le document signé"}>
      {/* Documents-0 : générer le contrat (nu 01 / meublé 02) depuis le
          brouillon — le PDF sert à imprimer et faire signer ; le dépôt du
          signé reste le seul déclencheur d'activation. */}
      {bail.etat === "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{bail.type === "colocation" ? "Préparer le contrat de colocation" : "Générer le bail"}</CardTitle>
            <CardDescription>
              {bail.chambre_id ? (
                <>Un contrat indépendant pour {chambre?.nom ?? "la chambre désignée"}, avec son propre loyer, ses charges et son dépôt. Le départ de ce locataire ne met pas fin aux autres contrats.</>
              ) : bail.type === "colocation" ? (
                <>Un contrat commun pour tous les colocataires, adapté au logement {lot?.meuble ? "meublé, avec son inventaire" : "nu"}.
                  Vérifiez les personnes et les informations du dossier, relisez le PDF, puis faites-le signer par toutes les parties.</>
              ) : (
                <>Le contrat type ({bail.type === "meuble" ? "logement meublé, inventaire du mobilier annexé" : "logement nu"})
                  rempli avec les informations du dossier. Les données manquantes sont signalées.
                  Relisez-le, faites-le signer, puis déposez le PDF signé ci-dessous.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bail.locataire_principal ? (
              <BoutonGenererDocument
                orgId={orgId}
                code={bail.chambre_id ? "bail_individuel" : bail.type === "colocation" ? "bail_colocation" : bail.type === "meuble" ? "bail_meuble" : "bail_nu"}
                cibleId={bailId}
                cheminRetour={`${base}/baux/${bailId}`}
                completionSurPlace
                libelle={bail.chambre_id ? "Générer le contrat individuel (PDF)" : bail.type === "colocation" ? "Générer le contrat commun (PDF)" : "Générer le bail (PDF)"}
                variant="default"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Renseignez d&apos;abord le locataire principal (carte « Corriger le
                brouillon ») : le contrat se génère ensuite.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {depotSigne}
      {piecesAdministratives}
      </RubriqueDossier>);
  const rubriqueSuivi = (<section id="suivi-bail" className="space-y-4">

      {/* États des lieux */}
      <RubriqueDossier id="edl" titre="États des lieux" resume="Retrouver une grille ou préparer la prochaine visite">
        <div className="space-y-4">
          {(edls ?? []).length === 0 ? (
            // L’état des lieux sert de référence pour comparer l’entrée et la sortie.
            bail.etat === "brouillon" ? (
              <p className="text-sm text-muted-foreground">
                Aucun état des lieux. Celui d&apos;entrée se signe à la remise des
                clés pour décrire ensemble l’état du logement. Une alerte le
                rappellera dès le dépôt du bail signé.
              </p>
            ) : (
              <div className="border-l-[3px] border-l-destructive bg-destructive-soft p-3">
                <p className="text-sm font-medium text-destructive-soft-foreground">
                  Aucun état des lieux d&apos;entrée
                </p>
                <p className="mt-0.5 text-sm text-destructive-soft-foreground">
                  Le bail est {ETATS_BAIL[bail.etat]?.toLowerCase() ?? "dans un état à vérifier"} : sans
                  état des lieux d&apos;entrée signé, la comparaison à la sortie sera
                  plus délicate. Documentez l’état du logement avec les parties
                  et conservez les justificatifs.
                </p>
              </div>
            )
          ) : (
            <ul className="space-y-2">
              {(edls ?? []).map((e) => (
                <li key={e.id}>
                  {/* Tout le rang ouvre la grille, pas seulement le bouton (retour du 24/09). */}
                  <Link
                    href={`${base}/baux/${bailId}/edl/${e.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 hover:bg-[var(--survol)]"
                  >
                    <span className="w-20 text-sm font-medium">
                      {e.type === "entree" ? "Entrée" : "Sortie"}
                    </span>
                    <span className={COULEURS_ETAT_EDL[e.etat] ?? "puce puce-grise"}>
                      {e.etat === "signe" ? "Signé" : "En cours"}
                    </span>
                    <span className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Ouvrir la grille
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!erreurEdls && <FormulaireCreerEdl orgId={orgId} bailId={bailId} bailEtat={bail.etat} typesExistants={(edls ?? []).map((e) => e.type)} />}
        </div>
      </RubriqueDossier>

      {/* Loyers & quittances */}
      {loyersActif && (
        <RubriqueDossier id="loyers" titre="Loyers & paiements" resume="Consulter les échéances, encaisser et retrouver les quittances">
          <div>
            <FormulaireLoyers
              orgId={orgId}
              bailId={bailId}
              racine={racineEspace(estProprietaire)}
              echeancier={(echeancier ?? []) as LigneEcheance[]}
              encaissements={(encaissements ?? []) as Encaissement[]}
              quittances={(quittances ?? []) as Quittance[]}
              revisionIrl={Boolean(bail.revision_irl)}
              irlReference={bail.irl_valeur === null ? null : Number(bail.irl_valeur)}
              irlTrimestre={bail.irl_trimestre}
              revisions={(revisions ?? []) as Revision[]}
              relances={(relances ?? []) as RelanceLigne[]}
              regularisations={(regularisations ?? []) as RegulLigne[]}
              chargesForfait={bail.charges_mode === "forfait"}
              dateDebut={bail.date_debut}
              dateFin={bail.date_fin}
              copropriete={Boolean(premier(lot?.bien ?? null)?.copropriete)}
              aujourdhui={aujourdhuiParis()}
              decompteSortie={etatDecompteSortie(restitution, erreurRestitution)}
            />
          </div>
        </RubriqueDossier>
      )}

      {/* Dépôt de garantie — encaissement */}
      {loyersActif && (
        <RubriqueDossier id="depot" titre="Dépôt de garantie" resume="Consulter les versements ou enregistrer un encaissement">
          <div>
            <FormulaireDepot
              orgId={orgId}
              bailId={bailId}
              encaissementOuvert={depotEncaissable}
              depotDu={Number(bail.depot_garantie ?? 0)}
              encaissements={(depotEncaissements ?? []) as EncaissementDepot[]}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: nomComplet(p) })
              )}
              locataireNom={locataire ? nomComplet(locataire) : "Le locataire"}
            />
          </div>
        </RubriqueDossier>
      )}

      {/* Avenant au bail : modification du contrat en cours, actée par les parties */}
      {(bail.etat === "actif" || bail.etat === "preavis") && (
        <RubriqueDossier id="avenant" titre="Avenant au bail" resume="Préparer une modification à faire signer aux parties">
          <div>
            <GenererAvenant
              orgId={orgId}
              bailId={bailId}
              cheminRetour={`${base}/baux/${bailId}`}
            />
          </div>
        </RubriqueDossier>
      )}

      </section>);
  // Conservation des pièces (plan de conformité du 23/10) : lue seulement pour un bail en préavis ou terminé.
  const conservation = restitutionActif ? await supabase.rpc("lire_conservation_bail", { p_bail: bailId }) : null;
  const rubriqueSortie = (sectionSortie && <RubriqueDossier id="sortie-bail" titre="Départ du locataire" resume={bail.date_fin ? `Fin prévue le ${formaterDate(bail.date_fin)} · congé, comparaison des états des lieux et restitution` : "Enregistrer un congé et préparer la fin de location"} ouverte={restitutionActif || (intentions ?? []).length > 0}>

      {bail.etat === "actif" && (
        <Card className={(intentions ?? []).length > 0 ? "border-l-4 border-l-[var(--or)]" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Congé</CardTitle>
            <CardDescription>
              Enregistrez la réception effective du congé à partir de son justificatif. Le
              préavis réduit exige un justificatif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Le congé ÉMIS par le bailleur (vente, reprise, motif légitime) se
                génère ici ; le formulaire en dessous enregistre un congé REÇU. */}
            <div className="mb-4 border-b border-border pb-4">
              <GenererCongeBailleur
                orgId={orgId}
                bailId={bailId}
                cheminRetour={`${base}/baux/${bailId}`}
                meuble={bail.type === "meuble" || (bail.type === "colocation" && Boolean(lot?.meuble))}
                terme={(termeBail as string | null) ?? null}
              />
            </div>
            {((intentions ?? []) as { created_at: string; motif: string | null }[]).map((it) => (
              <p key={it.created_at} className="mb-3 rounded-lg bg-warning-soft p-3 text-sm">
                <b className="font-semibold">
                  Le locataire a annoncé son départ le {formaterDate(it.created_at)}
                </b>
                {it.motif ? <> — « {it.motif} »</> : null}
                <span className="block text-muted-foreground">
                  À réception de sa lettre recommandée, enregistrez le congé ci-dessous avec la
                  date de réception — le locataire verra sa fin de bail confirmée.
                </span>
              </p>
            ))}
            <FormulaireConge
              orgId={orgId}
              bailId={bailId}
              type={bail.type}
              meubleLot={Boolean(lot?.meuble)}
              zoneTendue={bail.zone_tendue ?? premier(lot?.bien ?? null)?.zone_tendue ?? null}
            />
          </CardContent>
        </Card>
      )}

      {(conges ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {bail.etat === "preavis" ? "Congé en cours" : "Congés"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(conges ?? []).map((c, i) => (
              <p key={i} className={c.annule_le ? "text-muted-foreground" : undefined}>
                Donné par {c.par === "bailleur" ? "le bailleur" : "le locataire"}, date enregistrée
                le {formaterDate(c.date_premiere_presentation)}, préavis {c.preavis_mois} mois
                → effet le <span className="font-medium">{formaterDate(c.date_effet)}</span>
                {c.motif && !c.annule_le && (
                  <span className="block text-muted-foreground">Motif : {c.motif}</span>
                )}
                {/* Un congé annulé reste au dossier : il a existé. */}
                {c.annule_le && (
                  <span className="badge-statut ml-2 text-muted-foreground">
                    annulé le {formaterDate(c.annule_le)}
                    {c.annulation_motif ? ` — ${c.annulation_motif}` : ""}
                  </span>
                )}
              </p>
            ))}
            {bail.etat === "preavis" && (
              <div className="space-y-3 border-t border-border pt-3">
                {edlSortieSigne && <BoutonTerminerBail orgId={orgId} bailId={bailId} dateEffet={bail.date_fin} />}
                <FormulaireAnnulerConge orgId={orgId} bailId={bailId} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comparatif entrée/sortie — AVANT la restitution : c'est lui qui
          fonde les retenues. Affiché sous le formulaire qui le consomme,
          il obligeait à descendre lire chaque écart puis à remonter le
          saisir (relevé du 11/09). */}
      {comparatif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparatif entrée / sortie</CardTitle>
            <CardDescription>
              Les écarts d&apos;état entre l&apos;entrée et la sortie sont mis en évidence.{" "}
              {REGLE_ECART_EDL}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ecarts.length === 0 ? (
              <p className="text-sm text-success-soft-foreground">
                Aucun écart : le logement est rendu dans le même état.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ecarts.map((c) => (
                  <li
                    key={`${c.piece ?? ""}-${c.libelle}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {/* En étroit, l'élément dégradé se lit en entier sur sa ligne */}
                    <span className="min-w-0 basis-full sm:w-44 sm:basis-auto sm:shrink-0 sm:truncate">
                      {c.piece ? <span className="text-muted-foreground">{c.piece} · </span> : null}
                      {c.libelle}
                    </span>
                    <span
                      className={
                        (c.etat_entree && COULEURS_ETAT_ELEMENT[c.etat_entree]) || "puce puce-grise"
                      }
                    >
                      {c.etat_entree ? ETATS_ELEMENT[c.etat_entree] ?? c.etat_entree : "—"}
                    </span>
                    <span aria-hidden className="text-muted-foreground">→</span>
                    <span
                      className={
                        (c.etat_sortie && COULEURS_ETAT_ELEMENT[c.etat_sortie]) || "puce puce-grise"
                      }
                    >
                      {c.etat_sortie ? ETATS_ELEMENT[c.etat_sortie] ?? c.etat_sortie : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Restitution du dépôt de garantie */}
      {restitutionActif && (
        <Card id="restitution" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Restitution du dépôt de garantie</CardTitle>
            <CardDescription>
              Après la remise des clés : impayés imputés d&apos;abord, retenues avec
              décote de vétusté justifiées, solde de tout compte dans le délai légal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireRestitution
              orgId={orgId}
              bailId={bailId}
              restitution={(restitution ?? null) as Restitution | null}
              retenues={(retenues ?? []) as Retenue[]}
              montantsReels={montantsReels}
              ecarts={ecarts.map((c) => ({ piece: c.piece, libelle: c.libelle }))}
              comparatifDisponible={Boolean(comparatif)}
            />
          </CardContent>
        </Card>
      )}

      {/* Conservation des pièces et gel en cas de litige (plan de conformité du 23/10, lots 1E et 2) */}
      {conservation && <CarteConservationBail conservation={conservation.error ? null : conservation.data} erreur={conservation.error ? (conservation.error.code === "42501" ? "acces" : "lecture") : undefined} orgId={orgId} bailId={bailId} base={base} />}

      </RubriqueDossier>);
  return (
    <main className={`${styles.page} dossier-bail mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7`}>
      <Link href={lot ? `${base}/parc/${lot.bien_id}/lots/${lot.id}` : `${base}/parc`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground">← {lot?.nom ?? "Mes lots"}</Link>
      <header className={`${styles.entete}${assistantBailAffiche ? ` ${styles.enteteBrouillon}` : ""}`}>
        <span className={styles.icone}><FileText size={26} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className={styles.surtitre}>Contrat de location · {TYPES_BAIL[bail.type] ?? bail.type}</p>
          <div className="flex flex-wrap items-center gap-3"><h1>{lot?.nom ?? "Fiche du bail"}</h1><span className={signeNonActif ? "puce puce-loue" : COULEURS_ETAT_BAIL[bail.etat] ?? "puce puce-grise"}>{signeNonActif ? "Bail signé" : suiviSignature.erreur && bail.etat === "brouillon" ? "Signature à vérifier" : ETATS_BAIL[bail.etat] ?? "État à vérifier"}</span>{signeNonActif && <span className="puce puce-prep">Location non activée</span>}</div>
          {(erreurLocataire || locataire || !assistantBailAffiche || signeNonActif) ? <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Users size={16} aria-hidden="true" />{erreurLocataire ? "Locataire indisponible" : locataire ? nomComplet(locataire) : "Locataire à renseigner"}{bail.chambre_id && ` · ${chambre?.nom ?? "Chambre"}`}</p> : bail.chambre_id && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><House size={16} aria-hidden="true" />{chambre?.nom ?? "Chambre"}</p>}
        </div>
        {!assistantBailAffiche && lot && <Link className="btn-secondaire" href={`${base}/parc/${lot.bien_id}/lots/${lot.id}`}><House size={15} aria-hidden="true" /> Voir le logement</Link>}
        {!traverseeLectureSeule && bail.etat === "brouillon" && !documentSigne && !suiviSignature.erreur && !bail.signe_envoye_le && <SupprimerBailBrouillon orgId={orgId} bailId={bailId} revenirAuLot libelle={[lot?.nom, TYPES_BAIL[bail.type] ?? bail.type, locataire ? nomComplet(locataire) : null, bail.date_debut ? `Entrée le ${formaterDate(bail.date_debut)}` : null].filter(Boolean).join(" · ")} />}
        {bail.etat === "brouillon" && (bail.loyer_hc != null || bail.charges != null || bail.date_debut) && <dl className={styles.resumeBrouillon}>
          {(bail.loyer_hc != null || bail.charges != null) && <div><dt><Wallet size={16} aria-hidden="true"/>{bail.loyer_hc != null ? bail.charges != null ? "Loyer charges comprises" : "Loyer hors charges" : "Charges mensuelles"}</dt><dd>{eur(Number(bail.loyer_hc ?? 0) + Number(bail.charges ?? 0))}</dd></div>}
          {bail.date_debut && <div><dt><CalendarDays size={16} aria-hidden="true"/>Entrée le</dt><dd>{formaterDate(bail.date_debut)}</dd></div>}
        </dl>}
      </header>
      {bail.etat !== "brouillon" && <dl className={styles.chiffres}>
        <div><dt><Wallet size={17} aria-hidden="true" /> Loyer mensuel</dt><dd>{bail.loyer_hc == null || bail.charges == null ? "À compléter" : eur(Number(bail.loyer_hc) + Number(bail.charges))}</dd><dd className={styles.precision}>{bail.loyer_hc == null ? "Loyer à définir" : `${eur(Number(bail.loyer_hc))} hors charges`}{bail.charges != null && ` + ${eur(Number(bail.charges))} de charges`}</dd></div>
        <div><dt><CalendarDays size={17} aria-hidden="true" /> Dates du bail</dt><dd>{bail.date_debut ? formaterDate(bail.date_debut) : "Entrée à renseigner"}</dd><dd className={styles.precision}>{bail.date_fin ? `Fin le ${formaterDate(bail.date_fin)}` : "Fin non renseignée"}{bail.date_sortie_reelle ? ` · sortie réelle le ${formaterDate(bail.date_sortie_reelle)}` : ""}</dd></div>
        <div><dt><ShieldCheck size={17} aria-hidden="true" /> Dépôt de garantie</dt><dd>{bail.depot_garantie == null ? "À renseigner" : eur(Number(bail.depot_garantie))}</dd><dd className={styles.precision}>Montant prévu au contrat</dd></div>
        <div><dt><CalendarDays size={17} aria-hidden="true" /> Échéance du loyer</dt><dd>{bail.jour_echeance == null ? "À renseigner" : `Le ${bail.jour_echeance} du mois`}</dd><dd className={styles.precision}>{bail.charges_mode === "forfait" ? "Charges au forfait" : bail.charges_mode === "provision" ? "Provisions sur charges" : "Conditions du contrat"}</dd></div>
      </dl>}
      {signeNonActif && <div className="rounded-xl border border-success/20 bg-success-soft p-4 text-sm"><strong>Le bail est signé. La location n’est pas encore activée.</strong><p className="mt-1">Le contrat signé est archivé ; l’activation reste une action séparée.</p><Link className="inline-flex min-h-11 items-center underline" href={`${base}/documents/${documentSigne}/fichier`}>Consulter le bail signé →</Link></div>}
      {suiviSignature.erreur && <p role="status" className="text-sm">Le suivi des signatures est indisponible. Réessayez pour connaître l’état du contrat.</p>}
      <EchecLecture quoi={echecs} />

      {/* La prochaine action évidente, dérivée de l'état du bail */}
      {!traverseeLectureSeule && bail.etat !== "brouillon" && aFaire.length > 0 && (
        <div className={styles.attention}>
          <div className="entete-carte">
            <p className="text-sm font-semibold">À faire maintenant</p>
          </div>
          <ol className="space-y-1.5">
            {aFaire.slice(0, 3).map((a, i) => (
              <li key={a.href + i} className="flex items-center gap-2 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {i + 1}
                </span>
                <a href={a.href} className="inline-flex min-h-11 min-w-0 flex-1 items-center underline-offset-2 hover:underline">
                  {a.texte}
                </a>
              </li>
            ))}
          </ol>
          {/* Le reste de la liste était un compteur MUET : sur un bail qui sort
              avec un impayé, un dépôt partiel et un diagnostic expiré, les
              blocages occupaient les trois places et « Démarrer la restitution
              du dépôt de garantie » disparaissait derrière « 2 autres ensuite »
              — retour au défilement (relevé du 11/09). Le compteur s'ouvre
              maintenant sur ce qu'il compte, sans JavaScript. */}
          {aFaire.length > 3 && (
            <details className="mt-2">
              <summary className="mono-discret cursor-pointer py-1 pointer-coarse:py-3.5">
                {aFaire.length - 3} autre{aFaire.length - 3 > 1 ? "s" : ""} ensuite
              </summary>
              <ol className="mt-1.5 space-y-1.5">
                {aFaire.slice(3).map((a, i) => (
                  <li key={a.href + (i + 3)} className="flex items-center gap-2 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {i + 4}
                    </span>
                    <a href={a.href} className="inline-flex min-h-11 min-w-0 flex-1 items-center underline-offset-2 hover:underline">
                      {a.texte}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {bail.etat !== "brouillon" && <AvertissementsLoyer avertissements={avertissementsCoherenceLoyer(bail, lot?.surface_m2)} />}
      {traverseeLectureSeule ? <OngletsDossier libelle="Consultation du bail" initiale={signeNonActif ? "signature" : undefined} rubriques={[
        { id: "bail-informations", titre: "Contrat", contenu: <RecapitulatifParcoursBail
          lectureSeule orgId={orgId} lotId={bail.lot_id} bailId={bailId} bail={bail} estProprietaire={estProprietaire} erreurPersonnes={Boolean(erreurLocataire || erreurPersonnes || erreurBailPersonnes)}
          personnes={[...(locataire ? [{nom:nomComplet(locataire),role:"Locataire principal"}]:[]),...lignesColoc.filter(p=>!p.date_depart).map(p=>({nom:p.person_nom,role:p.role === "garant"?"Garant":"Colocataire"}))]}
          documents={null} signature={null} /> },
        { id: "signature", titre: "Documents", contenu: <section className="rounded-xl border bg-card p-4 space-y-3">
          <span id="etape-bail-7" /><h2 className="text-base font-semibold">{signeNonActif ? "Bail signé · location non activée" : documentSigne ? "Bail signé" : "Documents du contrat"}</h2>
          {documentSigne && <Link className="inline-flex min-h-11 items-center underline" href={`${base}/documents/${documentSigne}/fichier`}>Consulter le bail signé</Link>}
          {bail.reglement_copropriete && <p><Link className="inline-flex min-h-11 items-center underline" href={`${base}/documents/${bail.reglement_copropriete}/fichier`}>Règlement de copropriété</Link></p>}
          <p><Link className="inline-flex min-h-11 items-center underline" href={`${base}/documents`}>Consulter les documents du client</Link></p>
          <p className="text-sm text-muted-foreground">La génération, la signature et l’activation restent réservées au propriétaire ou à son gestionnaire.</p>
        </section> },
        { id: "bail-suivi", titre: "Suivi", contenu: <SuiviBailLecture base={base} bailId={bailId}
          echeances={(echeancier ?? []) as LigneEcheance[]} encaissements={(encaissements ?? []) as Encaissement[]} edls={edls ?? []}
          indisponibles={{loyers: Boolean(erreurEcheancier), encaissements: Boolean(erreurEncaissements), edls: Boolean(erreurEdls)}}
          historique={<>
            <HistoriqueBailLecture titre="Quittances et reçus" erreur={Boolean(erreurQuittances)}>
              {!quittances?.length && <p>Aucun document établi.</p>}
              {quittances?.map(q => <p key={q.id}><Link className="underline" href={`/quittance/${q.id}`}>{q.est_quittance ? "Quittance" : "Reçu"} du {formaterDate(q.date_emission)} · {eur(q.montant)}</Link>{q.email_envoye_at ? ` · envoyé le ${formaterDate(q.email_envoye_at)}` : " · non envoyé"}</p>)}
            </HistoriqueBailLecture>
            <HistoriqueBailLecture titre="Révisions et régularisations" erreur={Boolean(erreurRevisions || erreurRegul)}>
              {!revisions?.length && <p>Aucune révision enregistrée.</p>}
              {revisions?.map(r => <p key={r.id}>Révision au {formaterDate(r.date_effet)} : {eur(r.ancien_loyer)} → {eur(r.nouveau_loyer)} · IRL {r.irl_reference} → {r.irl_nouveau}</p>)}
              {!regularisations?.length && <p>Aucune régularisation enregistrée.</p>}
              {regularisations?.map(r => <p key={r.id}>Exercice {r.annee} · provisions {eur(r.provisions)} · charges réelles {eur(r.charges_reelles)} · écart {eur(r.ecart)}</p>)}
            </HistoriqueBailLecture>
            <HistoriqueBailLecture titre="Relances" erreur={Boolean(erreurRelances)}>
              {!relances?.length && <p>Aucune relance enregistrée.</p>}
              {relances?.map(r => <p key={r.id}>{({relance_1:"Première relance", relance_2:"Deuxième relance", mise_en_demeure:"Mise en demeure"} as Record<string,string>)[r.niveau] ?? "Relance"} · {formaterDate(r.date_envoi)}{r.numero_recommande && ` · recommandé ${r.numero_recommande}`}{r.date_premiere_presentation && ` · présenté le ${formaterDate(r.date_premiere_presentation)}`}</p>)}
            </HistoriqueBailLecture>
            <HistoriqueBailLecture titre="Mobilier" erreur={Boolean(erreurInventaire)}>
              {!inventaire?.length && <p>Aucun mobilier inventorié.</p>}
              {inventaire?.map(l => <p key={l.id}>{l.piece && `${l.piece} · `}{l.quantite} × {l.designation} · {l.etat ? ETATS_ELEMENT[l.etat] ?? l.etat : "État non renseigné"}{l.observation && ` · ${l.observation}`}</p>)}
            </HistoriqueBailLecture>
            <HistoriqueBailLecture titre="Dépôt de garantie et départ" erreur={Boolean(erreurDepot || erreurConges || erreurIntentions || erreurRestitution)}>
              {!depotEncaissements?.length && <p>Aucun dépôt encaissé.</p>}
              {depotEncaissements?.map(d => <p key={d.id}>Dépôt encaissé le {formaterDate(d.date_encaissement)} · {eur(d.montant)}{d.versant_libelle && ` · ${d.versant_libelle}`}</p>)}
              {intentions?.map((i,n) => <p key={`intention-${n}`}>Intention de départ le {formaterDate(i.created_at)} · {i.motif || "Motif non renseigné"}</p>)}
              {!conges?.length && <p>Aucun congé enregistré.</p>}
              {conges?.map((c,n) => <p key={`conge-${n}`}>Congé du {c.par === "locataire" ? "locataire" : "bailleur"} · effet le {formaterDate(c.date_effet)} · {c.preavis_mois} mois de préavis{c.motif && ` · ${c.motif}`}{c.annule_le && ` · annulé le ${formaterDate(c.annule_le)} (${c.annulation_motif ?? "motif non renseigné"})`}</p>)}
              {restitution ? <div><p>Restitution {restitution.statut === "finalise" ? "finalisée" : "en cours"} · remise des clés le {formaterDate(restitution.date_remise_cles)}</p><p>Dépôt : {eur(restitution.depot)} · impayés : {eur(restitution.impayes)} · solde : {restitution.solde == null ? "Non arrêté" : eur(restitution.solde)}</p>{retenues.map(r => <p key={r.id}>{r.libelle} · retenue {eur(r.montant_retenu)}{r.sans_justificatif ? " · sans justificatif" : ""}</p>)}</div> : <p>Aucune restitution enregistrée.</p>}
            </HistoriqueBailLecture>
          </>} /> },
      ]} /> : bail.etat === "brouillon" ? <AssistantBail
        formulaire={<FormulaireParcoursBail lienChambres={lot?lienLotDepuisBail(orgId,lot.bien_id,bail.lot_id,bailId,"equipements",1,racineEspace(estProprietaire)):undefined} surfaceHabitable={lot?.surface_m2} orgId={orgId} bailId={bailId} defauts={bail} bailPrecedent={bailPrecedent} agence={agence} meuble={Boolean(lot?.meuble)} chambres={chambres ?? []} />}
        orgId={orgId} bailId={bailId} controleInitial={await verifierDossierBail(orgId, bailId)}
        contenus={[
          null,
          <EtapePersonnesBail key="personnes" orgId={orgId} bailId={bailId} lotId={bail.lot_id} principalId={bail.locataire_principal} colocation={bail.type === "colocation" && !bail.chambre_id} />,
          <CompleterSurPlace key="logement" orgId={orgId} bailId={bailId} lotId={bail.lot_id} individuel={Boolean(bail.chambre_id)} />,
          bail.chambre_id && lot ? <div key="plafond" id="loyer-plafond-colocation"><ChambresLogement orgId={orgId} lotId={bail.lot_id} bienId={lot.bien_id} chambres={[]} plafond={lot.colocation_loyer_reference} mode="plafond" /></div> : null,
          lot ? <DocumentsParcoursBail key="documents" orgId={orgId} bailId={bailId} lotId={bail.lot_id} bienId={lot.bien_id} copropriete={premier(lot.bien)?.copropriete ?? null} reglementId={bail.reglement_copropriete} annexes={annexesContrat} dateDebut={bail.date_debut} edlEntree={(edls ?? []).find(e => e.type === "entree") ?? null} erreurEdl={Boolean(erreurEdls)} /> : <p key="documents">Le logement est indisponible.</p>,
          null,
          <div key="recapitulatif" className="space-y-4"><AvertissementsLoyer objet="dates" avertissements={avertissementsDatesBail(bail, aujourdhuiParis())} /><AvertissementsLoyer avertissements={avertissementsCoherenceLoyer(bail, lot?.surface_m2)} /><RecapitulatifParcoursBail orgId={orgId} lotId={bail.lot_id} bailId={bailId} bail={bail} estProprietaire={estProprietaire} erreurPersonnes={Boolean(erreurLocataire || erreurPersonnes || erreurBailPersonnes)}
            personnes={[...(locataire ? [{nom:nomComplet(locataire),role:"Locataire principal"}]:[]),...lignesColoc.filter(p=>!p.date_depart).map(p=>({nom:p.person_nom,role:p.role === "garant"?"Garant":"Colocataire"}))]}
            documents={null}
            signature={<FinaliserParcoursBail recapitulatifStructure key={JSON.stringify([bail,lignesColoc,inventaire])} orgId={orgId} bailId={bailId}
              code={bail.chambre_id?"bail_individuel":bail.type==="colocation"?"bail_colocation":bail.type==="meuble"?"bail_meuble":"bail_nu"}
              signataires={[...(bail.locataire_principal ? [{id:bail.locataire_principal,nom:locataire?nomComplet(locataire):"Locataire principal"}]:[]),...lignesColoc.filter(p=>p.role==="colocataire"&&!p.date_depart).map(p=>({id:p.person_id,nom:p.person_nom}))]}
              edlId={(edls??[]).find(e=>e.type==="entree")?.id??null}
              preparationEdl={erreurEdls?<p role="alert">Les états des lieux n’ont pas pu être chargés.</p>:<FormulaireCreerEdl orgId={orgId} bailId={bailId} bailEtat={bail.etat} typesExistants={(edls??[]).map(e=>e.type)}/>}
              signatureManuelle={depotSigne} proprietaireDirect={estProprietaire} documentSigne={documentSigne} lectureSeule={traverseeLectureSeule}
              pdfInitial={pdfContrat.version ? { documentId: pdfContrat.version.id, genereLe: pdfContrat.version.created_at } : null}/>} /></div>
        ]} /> : <OngletsDossier libelle="Rubriques du bail" rubriques={[
          {id:"bail-informations",titre:"Contrat",contenu:rubriqueContrat},
          {id:"bail-documents",titre:"Documents",contenu:rubriqueSignature},
          {id:"bail-suivi",titre:"Suivi",contenu:rubriqueSuivi},
          ...(sectionSortie ? [{id:"bail-depart",titre:"Départ",contenu:rubriqueSortie}] : []),
        ]} />}
      {!traverseeLectureSeule && bail.etat === "brouillon" && rubriqueSortie}

    </main>
  );
}
