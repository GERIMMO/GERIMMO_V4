import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { avecEcheanceReglementaire, classerPiecesBail, type DiagnosticBail, type PieceBail } from "@/lib/documents-bail";
import { preparerDiagnosticsBail } from "@/lib/exigences-diagnostics-bail";
import { TYPES_DIAGNOSTIC } from "@/lib/parc";
import { jourAParis, jourValide } from "@/lib/presentation-document";
import type { QualificationDiagnostic } from "@/lib/qualification-diagnostics";
import { baseEspace } from "@/lib/racine-espace";
import { statutAttestationBail } from "@/lib/statut-attestation-bail";

export type PieceRecapitulativeBail = {
  id: string;
  titre: string;
  detail: string;
  statut: "pret" | "a_completer" | "a_verifier" | "non_concerne";
  moment: "signature" | "entree" | "gestion";
  href: string;
};
export type RecapitulatifPiecesBail = { pieces: PieceRecapitulativeBail[]; erreur?: string };
type Fichier = PieceBail & {
  created_at: string; expire_le: string | null; mime_type: string | null;
  storage_path: string | null; empreinte: string | null;
  versions: { id: string }[] | null;
};
type Lecture<T> = { data: T | null; error: unknown };
type EtatPiece = Pick<PieceRecapitulativeBail, "statut" | "detail">;
const INDISPONIBLE: EtatPiece = { statut: "a_verifier", detail: "Lecture indisponible. Actualisez avant de conclure." };
const LIMITE = 1000;
const CHAMPS_DIAGNOSTIC = "id,type,date_realisation,date_expiration,document_id,classe_dpe";

/** Une erreur ou une réponse potentiellement tronquée n'est jamais une liste vide fiable. */
function liste<T>(resultat: Lecture<T[]>): { lignes: T[]; erreur: boolean } {
  const erreur = Boolean(resultat.error) || !Array.isArray(resultat.data) || resultat.data.length >= LIMITE;
  return { lignes: erreur ? [] : resultat.data!, erreur };
}

/** Lecture de la page déjà autorisée : garde le client fourni et sa RLS, sans client privilégié.
 * « prêt » décrit une pièce disponible, jamais la validité juridique de tout le bail.
 * Aucun PDF, appel au prestataire ou envoi n'est déclenché par ce récapitulatif.
 */
export async function lireRecapitulatifPiecesBail(
  db: SupabaseClient,
  { orgId, bailId, estProprietaire, aujourdhui = jourAParis() }: {
    orgId: string; bailId: string; estProprietaire: boolean; aujourdhui?: string;
  },
): Promise<RecapitulatifPiecesBail> {
  const baseBail = `${baseEspace(orgId, estProprietaire)}/baux/${bailId}`;
  const documentsHref = `${baseBail}#etape-bail-5`;
  const indisponible = (detail: string): RecapitulatifPiecesBail => ({
    pieces: [{ id: "pieces-indisponibles", titre: "Pièces du bail", detail, statut: "a_verifier", moment: "signature", href: documentsHref }],
    erreur: detail,
  });
  if (!jourValide(aujourdhui)) return indisponible("La date de vérification est indisponible.");
  const lectureBail = await db.from("baux").select("id,lot_id,type,date_debut,reglement_copropriete")
    .eq("organization_id", orgId).eq("id", bailId).maybeSingle();
  if (lectureBail.error || !lectureBail.data) return indisponible("Les pièces de ce bail ne peuvent pas être vérifiées pour le moment.");
  const bail = lectureBail.data as { id: string; lot_id: string; type: string; date_debut: string | null; reglement_copropriete: string | null };
  const lectureLot = await db.from("lots").select("id,bien_id,meuble")
    .eq("organization_id", orgId).eq("id", bail.lot_id).maybeSingle();
  if (lectureLot.error || !lectureLot.data) return indisponible("Le logement de ce bail est indisponible. Les pièces restent à vérifier.");
  const lot = lectureLot.data as { id: string; bien_id: string; meuble: boolean | null };
  const [bienR, lotR, communsR, liensR, qualificationsR, assurancesR, inventaireR, garantsR, edlR, circuitsR] = await Promise.all([
    db.from("biens").select("type,annee_construction,copropriete").eq("organization_id", orgId).eq("id", lot.bien_id).maybeSingle(),
    db.from("diagnostics").select(CHAMPS_DIAGNOSTIC).eq("organization_id", orgId).eq("lot_id", lot.id).is("archived_at", null).order("date_realisation", { ascending: false }).limit(LIMITE),
    db.from("diagnostics").select(CHAMPS_DIAGNOSTIC).eq("organization_id", orgId).eq("bien_id", lot.bien_id).is("lot_id", null).is("archived_at", null).order("date_realisation", { ascending: false }).limit(LIMITE),
    db.from("document_liens").select("document_id").eq("organization_id", orgId).eq("entite", "bail").eq("entite_id", bailId).limit(LIMITE),
    db.from("qualifications_diagnostics_lot").select("type,situation,date_installation,annee_installation").eq("organization_id", orgId).eq("lot_id", lot.id).limit(LIMITE),
    db.from("pieces_attendues_bail").select("nature,bail_id,document_id").eq("organization_id", orgId).eq("lot_id", lot.id).limit(LIMITE),
    db.from("inventaire_lignes").select("id,designation,quantite,etat").eq("organization_id", orgId).eq("bail_id", bailId).limit(LIMITE),
    db.from("bail_personnes").select("person_id").eq("organization_id", orgId).eq("bail_id", bailId).eq("role", "garant").limit(LIMITE),
    db.from("etats_des_lieux").select("id,etat").eq("organization_id", orgId).eq("bail_id", bailId).eq("type", "entree").limit(LIMITE),
    // Ni coordonnées des signataires, ni liens secrets : le garant est identifié par le choix explicite de l'acte.
    db.from("bail_signature_circuits").select("etat,garant:options->>garant,document_id,document_signe,created_at,essai,environnement")
      .eq("organization_id", orgId).eq("bail_id", bailId).eq("cible_id", bailId).eq("modele", "cautionnement").order("created_at", { ascending: false }).limit(LIMITE),
  ]);
  const bien = bienR.data as { type: string; annee_construction: number | null; copropriete: boolean | null } | null;
  const bienIndisponible = Boolean(bienR.error) || !bien;
  const diagsLot = liste<Omit<DiagnosticBail, "niveau">>(lotR);
  const diagsBien = liste<Omit<DiagnosticBail, "niveau">>(communsR);
  const liens = liste<{ document_id: string }>(liensR);
  const qualifications = liste<QualificationDiagnostic>(qualificationsR);
  const assurances = liste<{ nature: string; bail_id: string | null; document_id: string }>(assurancesR);
  const inventaire = liste<{ id: string; designation: string; quantite: number; etat: string | null }>(inventaireR);
  const garants = liste<{ person_id: string }>(garantsR);
  const edls = liste<{ id: string; etat: string }>(edlR);
  const circuits = liste<{ etat: string; garant: string | null; document_id: string | null; document_signe: string | null; created_at: string; essai: boolean; environnement: string }>(circuitsR);
  const identifiees = assurances.lignes.filter(p => p.nature === "assurance_proprietaire" ? p.bail_id === null : p.bail_id === bailId);
  // DOC-01 : l'échéance d'un DPE d'avant le 01/07/2021 est plafonnée (décret n° 2020-1610).
  const diagnostics: DiagnosticBail[] = avecEcheanceReglementaire([
    ...diagsLot.lignes.map(d => ({ ...d, niveau: "lot" as const })),
    ...diagsBien.lignes.map(d => ({ ...d, niveau: "bien" as const })),
  ]);
  const ids = [...new Set([
    ...liens.lignes.map(p => p.document_id), ...diagnostics.map(d => d.document_id),
    ...identifiees.map(p => p.document_id), bail.reglement_copropriete,
    ...circuits.lignes.flatMap(c => [c.document_id, c.document_signe]),
  ].filter((id): id is string => Boolean(id)))];
  const fichiersR = ids.length && ids.length < LIMITE
    ? await db.from("documents").select("id,titre,type,purged_at,created_at,expire_le,mime_type,storage_path,empreinte,versions:documents!documents_remplace_id_fkey(id)")
      .eq("organization_id", orgId).in("id", ids).limit(LIMITE)
    : { data: [], error: ids.length >= LIMITE ? true : null };
  const fichiers = liste<Fichier>(fichiersR as unknown as Lecture<Fichier[]>);
  const parId = new Map(fichiers.lignes.map(d => [d.id, d]));
  const fichier = (id: string | null, pourSignature = false): EtatPiece => {
    if (!id) return { statut: "a_completer", detail: "À ajouter." };
    const doc = parId.get(id);
    if (fichiers.erreur || !doc) return INDISPONIBLE;
    if (doc.purged_at) return { statut: "a_completer", detail: "Le fichier a été supprimé. Ajoutez une nouvelle pièce." };
    if (doc.versions?.length) return { statut: "a_verifier", detail: "Une autre version existe. Vérifiez la pièce rattachée." };
    if (pourSignature && doc.mime_type !== "application/pdf") return { statut: "a_completer", detail: "Joignez un PDF pour la signature électronique." };
    if (!doc.storage_path || (pourSignature && !doc.empreinte)) return { statut: "a_verifier", detail: "Le fichier doit être vérifié avant utilisation." };
    return { statut: "pret", detail: "Fichier disponible." };
  };
  const pieces: PieceRecapitulativeBail[] = [];
  let lectureIndisponible = false;
  const ajouter = (id: string, titre: string, moment: PieceRecapitulativeBail["moment"], etat: EtatPiece, href = documentsHref) => {
    if (etat === INDISPONIBLE) lectureIndisponible = true;
    pieces.push({ id, titre, moment, ...etat, href });
  };
  const documentsBail = liens.lignes.map(l => parId.get(l.document_id)).filter((d): d is Fichier => Boolean(d))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const notice = classerPiecesBail(documentsBail, [], bail.reglement_copropriete).notices[0];
  const liensIncomplets = liens.erreur || fichiers.erreur || liens.lignes.some(l => !parId.has(l.document_id));
  ajouter("notice", "Notice d’information", "signature", liensIncomplets ? INDISPONIBLE : fichier(notice?.id ?? null, true), `${baseBail}#annexes-attendues`);
  ajouter("reglement", "Règlement de copropriété", "signature", bienIndisponible ? INDISPONIBLE
    : bien!.copropriete === false ? { statut: "non_concerne", detail: "Le bâtiment est déclaré hors copropriété." }
      : bien!.copropriete === null ? { statut: "a_verifier", detail: "Précisez si le bâtiment est en copropriété." }
        : fichier(bail.reglement_copropriete, true), `${baseBail}#reglement-copro`);

  const dateEntreeInconnue = !bail.date_debut || !jourValide(bail.date_debut);
  const referenceDate = !dateEntreeInconnue && bail.date_debut! > aujourdhui ? bail.date_debut! : aujourdhui;
  const exigences = preparerDiagnosticsBail(diagnostics, aujourdhui, bien ? {
    typeBien: bien.type, anneeConstruction: bien.annee_construction, qualifications: qualifications.lignes, referenceDate,
  } : undefined, bienIndisponible || qualifications.erreur);
  if (exigences.contexteIndisponible) ajouter("diagnostics-contexte", "Diagnostics du logement", "signature", INDISPONIBLE, `${baseBail}#completer-dpe`);
  for (const ligne of exigences.lignes) {
    const moment = ligne.exigence === "a_disposition" || ligne.exigence === "complementaire"
      || ligne.type.startsWith("amiante") ? "gestion" : "signature";
    let etat: EtatPiece;
    if (exigences.contexteIndisponible || (ligne.niveau === "lot" ? diagsLot.erreur : diagsBien.erreur)) etat = INDISPONIBLE;
    else if (ligne.exigence === "non_concerne") etat = { statut: "non_concerne", detail: "Selon les informations enregistrées sur l’installation." };
    // Un rapport enregistré se montre tel qu'il est ; l'ancienneté de l'installation n'est demandée qu'à défaut (BAIL-25).
    else if (ligne.exigence === "a_preciser" && !ligne.rapport) etat = { statut: "a_verifier", detail: ligne.precision ?? "L’ancienneté de l’installation reste à préciser." };
    else if (!ligne.rapport) etat = { statut: "a_completer", detail: ligne.precision ?? "Rapport à ajouter." };
    else {
      etat = fichier(ligne.rapport.document_id, moment === "signature");
      if (etat.statut === "pret") {
        etat = ligne.statut.ton === "ok" ? { statut: "pret", detail: ligne.statut.libelle }
          : { statut: ["Expiré", "À renouveler avant l’entrée", "Date à compléter", "Classe à compléter"].includes(ligne.statut.libelle) ? "a_completer" : "a_verifier", detail: ligne.statut.libelle };
        if (etat.statut === "pret" && dateEntreeInconnue) etat = { statut: "a_verifier", detail: "Rapport disponible. La date d’entrée manque pour vérifier sa validité à cette date." };
      }
    }
    ajouter(`diagnostic-${ligne.cle}`, TYPES_DIAGNOSTIC[ligne.type]?.libelle ?? ligne.type, moment, etat, `${baseBail}#completer-dpe`);
  }
  // Même sans contexte lisible, un échec de lecture des rapports ne disparaît pas du récapitulatif.
  if (diagsLot.erreur && !exigences.lignes.some(l => l.niveau === "lot")) ajouter("diagnostics-lot", "Diagnostics du logement", "signature", INDISPONIBLE, `${baseBail}#completer-dpe`);
  if (diagsBien.erreur && !exigences.lignes.some(l => l.niveau === "bien")) ajouter("diagnostics-bien", "Diagnostics du bâtiment", "signature", INDISPONIBLE, `${baseBail}#completer-dpe`);

  for (const nature of ["assurance_proprietaire", "assurance_locataire"] as const) {
    const proprietaire = nature === "assurance_proprietaire";
    const correspondances = identifiees.filter(p => p.nature === nature);
    const piece = correspondances[0];
    const doc = piece ? parId.get(piece.document_id) : undefined;
    let etat: EtatPiece;
    if (assurances.erreur || correspondances.length > 1 || (proprietaire && bienIndisponible)) etat = INDISPONIBLE;
    else if (!piece && proprietaire && bien!.copropriete === false) etat = { statut: "non_concerne", detail: "Facultative hors copropriété ; recommandée pour le propriétaire." };
    else if (!piece && proprietaire && bien!.copropriete === null) etat = { statut: "a_verifier", detail: "Précisez la copropriété pour connaître l’obligation de responsabilité civile." };
    else {
      etat = fichier(piece?.document_id ?? null);
      if (etat.statut === "pret") {
        const statut = statutAttestationBail(doc!, aujourdhui, referenceDate);
        etat = statut.ton === "ok" ? { statut: "pret", detail: "Attestation déposée ; garanties à relire." }
          : { statut: statut.libelle.startsWith("À renouveler") ? "a_completer" : "a_verifier", detail: statut.libelle };
        if (etat.statut === "pret" && dateEntreeInconnue) etat = { statut: "a_verifier", detail: "Attestation déposée. Précisez la date d’entrée pour vérifier la période couverte." };
      }
    }
    ajouter(nature, proprietaire ? "Assurance du propriétaire" : "Assurance du locataire", proprietaire ? "gestion" : "entree", etat, `${baseBail}#assurances-bail`);
  }
  const meuble = bail.type === "meuble" || (bail.type === "colocation" && lot.meuble === true);
  if (meuble) {
    ajouter("inventaire", "Inventaire du mobilier", "signature", inventaire.erreur ? INDISPONIBLE
      : !inventaire.lignes.length ? { statut: "a_completer", detail: "Aucun mobilier inventorié." }
        : { statut: "a_verifier", detail: `${inventaire.lignes.length} ligne${inventaire.lignes.length > 1 ? "s" : ""} enregistrée${inventaire.lignes.length > 1 ? "s" : ""}. Vérifiez le mobilier et son état avant signature.` }, `${baseBail}#inventaire`);
  } else if (bail.type === "colocation" && lot.meuble === null) {
    ajouter("inventaire", "Inventaire du mobilier", "signature", { statut: "a_verifier", detail: "Précisez si la colocation est meublée." }, `${baseBail}#inventaire`);
  }
  if (garants.erreur) ajouter("cautionnement", "Actes de cautionnement", "signature", INDISPONIBLE, `${baseBail}#inventaire`);
  else for (const [index, garantId] of [...new Set(garants.lignes.map(g => g.person_id))].entries()) {
    const circuit = circuits.lignes.filter(c => c.garant === garantId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    let etat: EtatPiece = circuits.erreur ? INDISPONIBLE : !circuit
      ? { statut: "a_verifier", detail: "Préparez l’acte ou vérifiez l’acte signé hors ligne : aucun suivi de signature n’est rattaché." }
      : { statut: "a_verifier", detail: circuit.etat === "pret" ? "Acte préparé ; signature à organiser." : ["preparation", "en_cours"].includes(circuit.etat) ? "Signature en cours." : "Suivi de signature à vérifier." };
    if (!circuits.erreur && circuit?.etat === "termine") {
      etat = circuit.essai || circuit.environnement === "sandbox"
        ? { statut: "a_verifier", detail: "Signature de test. Vérifiez l’acte signé définitif." }
        : fichier(circuit.document_signe);
      if (etat.statut === "pret") etat = { statut: "pret", detail: "Acte signé archivé." };
    }
    ajouter(`cautionnement-${garantId}`, `Cautionnement · garant ${index + 1}`, "signature", etat, `${baseBail}#inventaire`);
  }
  const edl = edls.lignes.find(e => e.etat === "signe") ?? edls.lignes[0];
  ajouter("edl-entree", "État des lieux d’entrée", "entree", edls.erreur ? INDISPONIBLE
    : !edl ? { statut: "a_completer", detail: "À préparer pour la remise des clés." }
      : edl.etat === "signe" ? { statut: "pret", detail: "État des lieux signé." }
        : { statut: "a_completer", detail: "État des lieux en préparation, à terminer à l’entrée." }, edl ? `${baseBail}/edl/${edl.id}` : documentsHref);
  // Une ancienne version non affichée, un inventaire de bail nu ou un circuit
  // sans garant ne conditionnent pas les pièces de ce dossier. La date d'entrée
  // manquante reste une information à compléter, pas un échec de lecture.
  return { pieces, ...(lectureIndisponible ? { erreur: "Certaines pièces n’ont pas pu être vérifiées. Actualisez leur suivi avant la signature." } : {}) };
}
