import type { SupabaseClient } from "@supabase/supabase-js";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { aujourdhuiParis, estExpiree, eur, formaterDate } from "@/lib/ged";
import { diagnosticsExigibles, obligatoireEnDefaut } from "@/lib/diagnostics";
import { statutDiagnostic } from "@/lib/parc";
import { RACINE_AGENCE } from "@/lib/racine-espace";
import { lireToutesLesPages, type PageLue } from "@/lib/lecture-complete";

// Actions attendues sur les baux en cours — LA source commune (audit 09/09,
// P2). L'accueil du propriétaire disait « tout est en ordre » pendant que la
// fiche du bail listait un impayé, un état des lieux d'entrée non signé et
// des diagnostics manquants : chaque écran calculait dans son coin. Ce module
// produit les mêmes items partout — fiche bail, accueil propriétaire,
// tableau de bord — chacun menant à l'écran qui résout l'action :
//   - loyers impayés (appels échus non couverts par les encaissements,
//     imputés du plus ancien au plus récent comme etat_loyers_bail) ;
//   - état des lieux d'entrée non signé sur un bail en cours ;
//   - diagnostics obligatoires absents ou expirés (DPE au lot en habitation,
//     ERP au bien — même critère que lot_blocages_location côté SQL) ;
//   - pièces de la GED expirées (documents_a_renouveler).
// Calcul à la volée, sans nouvelle table ni tâche asynchrone.

export type ActionAttendue = {
  cle: string;
  titre: string;
  detail: string | null;
  href: string;
  critique: boolean;
  /**
   * Les diagnostics expirés que porte un item « DPE/ERP absent ou expiré » :
   * l'alerte `diagnostic_expiration` ne connaît que son `diagnostic_id`, pas
   * le lot ni le bien — c'est par là qu'on la reconnaît (25/09).
   */
  diagnosticIds?: string[];
};

type BailEnCours = {
  id: string;
  etat: string;
  lot_id: string;
  lot: UnOuPlusieurs<{
    id: string;
    nom: string;
    bien_id: string;
    bien: UnOuPlusieurs<{
      id: string;
      nom: string;
      type: string;
      annee_construction: number | null;
    }>;
  }>;
};

/** Les anciens numeric peuvent précéder les contraintes « fini / au centime » : ne jamais en déduire une dette. */
function centimesFiables(brut: unknown, zeroPermis: boolean): number | null {
  if (brut === null || brut === undefined || (typeof brut === "string" && !brut.trim())) return null;
  const montant = Number(brut), centimes = Math.round(montant * 100);
  if (!Number.isFinite(montant) || montant < 0 || (!zeroPermis && montant === 0)
    || !Number.isSafeInteger(centimes)
    || Math.abs(montant - centimes / 100) > Number.EPSILON * Math.max(1, Math.abs(montant)) * 4) return null;
  return centimes;
}

export type LectureActionsAttendues = {
  actions: ActionAttendue[];
  erreurs: { baux: boolean; edls: boolean; appels: boolean; encaissements: boolean; diagnostics: boolean; pieces: boolean };
};
type OptionsActionsAttendues = {
  bailId?: string;
  portefeuille?: Set<string> | null;
  /** « /espace » pour le propriétaire direct, « /agence » par défaut. */
  racine?: string;
};

/** Une rupture de transport et une réponse en erreur rendent la catégorie indisponible. */
async function lectureCompleteSecurisee<T extends { id: string }>(page: (debut: number, fin: number) => PromiseLike<PageLue<T>>): Promise<{ data: T[] | null; error: boolean }> {
  try { const retour = await lireToutesLesPages(page, ligne => ligne.id); return { data: retour.lignes, error: Boolean(retour.echec) }; }
  catch { return { data: null, error: true }; }
}

/** Les filtres IN restent bornés : un grand patrimoine ne dépasse pas la taille maximale de l'URL. */
async function lirePourLesBaux<T extends { id: string }>(ids: string[], page: (baux: string[], debut: number, fin: number) => PromiseLike<PageLue<T>>) {
  const lignes: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lecture = await lectureCompleteSecurisee((debut, fin) => page(ids.slice(i, i + 100), debut, fin));
    if (lecture.error) return { data: null, error: true };
    lignes.push(...lecture.data!);
  }
  return { data: lignes, error: false };
}

/** Compatibilité des lecteurs qui attendent uniquement les actions fiables. */
export async function actionsAttendues(supabase: SupabaseClient, orgId: string, options: OptionsActionsAttendues = {}): Promise<ActionAttendue[]> {
  return (await lireActionsAttendues(supabase, orgId, options)).actions;
}

export async function lireActionsAttendues(
  supabase: SupabaseClient,
  orgId: string,
  options: OptionsActionsAttendues = {}
): Promise<LectureActionsAttendues> {
  const aujourdhui = aujourdhuiParis();
  const { bailId, portefeuille, racine = RACINE_AGENCE } = options;
  const base = `${racine}/${orgId}`;

  const { data: bauxBruts, error: erreurBaux } = await lectureCompleteSecurisee<BailEnCours>((debut, fin) => {
    let requeteBaux = supabase.from("baux").select(
      "id, etat, lot_id, lot:lots(id, nom, bien_id, bien:biens!lots_bien_id_fkey(id, nom, type, annee_construction))", { count: "exact" },
    ).eq("organization_id", orgId).in("etat", ["actif", "preavis"]);
    if (bailId) requeteBaux = requeteBaux.eq("id", bailId);
    return requeteBaux.order("id").range(debut, fin);
  });
  const bauxIllisibles = Boolean(erreurBaux) || !Array.isArray(bauxBruts);

  const baux = ((bauxIllisibles ? [] : bauxBruts) as unknown as BailEnCours[]).filter(
    (b) => !portefeuille || portefeuille.has(b.lot_id)
  );
  const bailIds = baux.map((b) => b.id);

  const vide = { data: [] as never[], error: false };
  const [
    { data: edlsSignes, error: erreurEdls },
    { data: appels, error: erreurAppels },
    { data: encaissements, error: erreurEncaissements },
    { data: diagnostics, error: erreurDiagnostics },
    { data: piecesARenouveler, error: erreurPieces },
  ] = await Promise.all([
    lirePourLesBaux<{ id: string; bail_id: string }>(bailIds, (ids, debut, fin) => supabase
          .from("etats_des_lieux")
          .select("id,bail_id", { count: "exact" })
          .eq("organization_id", orgId)
          .eq("type", "entree")
          .eq("etat", "signe")
          .in("bail_id", ids).order("id").range(debut, fin)),
    lirePourLesBaux<{ id: string; bail_id: string; montant_du: number; date_echeance: string }>(bailIds, (ids, debut, fin) => supabase
          .from("appels_loyer")
          .select("id,bail_id,montant_du,date_echeance", { count: "exact" })
          .eq("organization_id", orgId)
          .in("bail_id", ids).order("id").range(debut, fin)),
    lirePourLesBaux<{ id: string; bail_id: string; montant: number }>(bailIds, (ids, debut, fin) => supabase
          .from("encaissements")
          .select("id,bail_id,montant", { count: "exact" })
          .eq("organization_id", orgId)
          .in("bail_id", ids).order("id").range(debut, fin)),
    bailIds.length
      ? lectureCompleteSecurisee<{ id: string; type: string; lot_id: string | null; bien_id: string | null; date_expiration: string | null }>((debut, fin) => supabase
          .from("diagnostics")
          .select("id,type,lot_id,bien_id,date_expiration", { count: "exact" })
          .eq("organization_id", orgId)
          .in("type", ["dpe", "erp"])
          .is("archived_at", null).order("id").range(debut, fin))
      : Promise.resolve(vide),
    // Les pièces expirées sont une affaire d'organisation, pas d'un bail :
    // hors sujet quand on ne regarde qu'un bail.
    bailId
      ? Promise.resolve(vide)
      : lectureCompleteSecurisee<{ id: string; titre: string; expire_le: string }>((debut, fin) => supabase.rpc("documents_a_renouveler", {
          p_org: orgId,
          p_limite: aujourdhui,
          p_lots: portefeuille ? [...portefeuille] : null,
        }, { count: "exact" }).order("id").range(debut, fin)),
  ]);

  const erreurs: LectureActionsAttendues["erreurs"] = {
    baux: bauxIllisibles,
    edls: Boolean(erreurEdls) || !Array.isArray(edlsSignes),
    appels: Boolean(erreurAppels) || !Array.isArray(appels),
    encaissements: Boolean(erreurEncaissements) || !Array.isArray(encaissements),
    diagnostics: Boolean(erreurDiagnostics) || !Array.isArray(diagnostics),
    pieces: Boolean(erreurPieces) || !Array.isArray(piecesARenouveler),
  };

  const bailsAvecEdl = new Set(
    ((edlsSignes ?? []) as { bail_id: string }[]).map((e) => e.bail_id)
  );
  const encaisseParBail = new Map<string, number>();
  for (const e of (encaissements ?? []) as { bail_id: string; montant: number }[]) {
    const montant = centimesFiables(e.montant, false), cumul = (encaisseParBail.get(e.bail_id) ?? 0) + (montant ?? 0);
    if (montant === null || !Number.isSafeInteger(cumul)) erreurs.encaissements = true;
    else encaisseParBail.set(e.bail_id, cumul);
  }
  const appelsParBail = new Map<string, { montant_du: number; date_echeance: string }[]>();
  for (const a of (appels ?? []) as {
    bail_id: string;
    montant_du: number;
    date_echeance: string;
  }[]) {
    const liste = appelsParBail.get(a.bail_id) ?? [];
    const montant = centimesFiables(a.montant_du, true);
    if (montant === null || !/^\d{4}-\d{2}-\d{2}$/.test(a.date_echeance)) erreurs.appels = true;
    else liste.push({ ...a, montant_du: montant });
    appelsParBail.set(a.bail_id, liste);
  }
  const lignesDiagnostics = (diagnostics ?? []) as {
    id: string;
    type: string;
    lot_id: string | null;
    bien_id: string | null;
    date_expiration: string | null;
  }[];
  // Les diagnostics d'un type déjà expirés parmi ceux déposés : ce sont eux
  // que la tâche de nuit a signalés par une alerte.
  const expires = (type: string, deposes: typeof lignesDiagnostics) =>
    deposes
      .filter((d) => d.type === type && statutDiagnostic(d.date_expiration) === "expire")
      .map((d) => d.id);

  const impayes: ActionAttendue[] = [];
  const edls: ActionAttendue[] = [];
  const diags: ActionAttendue[] = [];
  const biensSignales = new Set<string>();

  for (const bail of baux) {
    const lot = premier(bail.lot);
    const bien = premier(lot?.bien ?? null);
    const nomLot = lot?.nom ?? "Lot";
    // Sur la fiche d'UN bail, le lot est déjà en tête de page : le répéter à
    // chaque étape de « À faire maintenant » allongeait les lignes (trois sur
    // téléphone) sans rien apprendre (24/09). L'accueil, qui mêle tous les
    // baux, garde le nom du lot.
    const surLeLot = bailId ? "" : ` — ${nomLot}`;

    // Impayés : les appels échus, couverts du plus ancien au plus récent par
    // le total encaissé — même imputation qu'etat_loyers_bail (SQL).
    const duEchu = (appelsParBail.get(bail.id) ?? [])
      .filter((a) => a.date_echeance < aujourdhui)
      .reduce((s, a) => s + Number(a.montant_du), 0);
    if (!Number.isSafeInteger(duEchu)) erreurs.appels = true;
    const reste = (duEchu - (encaisseParBail.get(bail.id) ?? 0)) / 100;
    if (!erreurs.appels && !erreurs.encaissements && reste > 0) {
      impayes.push({
        cle: `impaye-${bail.id}`,
        titre: `Loyer impayé${surLeLot}`,
        detail: `${eur(reste)} échus non couverts`,
        href: `${base}/baux/${bail.id}#loyers`,
        critique: true,
      });
    }

    // État des lieux d'entrée : référence pour la comparaison à la sortie.
    if (!erreurs.edls && !bailsAvecEdl.has(bail.id)) {
      edls.push({
        cle: `edl-${bail.id}`,
        titre: `État des lieux d'entrée à signer${surLeLot}`,
        detail: "Décrire l’état du logement avec le locataire à la remise des clés",
        href: `${base}/baux/${bail.id}#edl`,
        critique: false,
      });
    }

    // Diagnostics obligatoires : DPE au lot (habitation), ERP au bien —
    // absents OU expirés, comme le contrôle bloquant de la base.
    if (!erreurs.diagnostics && lot && bien) {
      const exigiblesLot = diagnosticsExigibles(bien, "lot");
      const deposesLot = lignesDiagnostics.filter((d) => d.lot_id === lot.id);
      if (
        exigiblesLot.some((e) => e.type === "dpe") &&
        obligatoireEnDefaut("dpe", deposesLot)
      ) {
        diags.push({
          cle: `dpe-${lot.id}`,
          titre: `DPE absent ou expiré${surLeLot}`,
          detail: "Obligatoire en habitation (au lot)",
          href: `${base}/parc/${lot.bien_id}/lots/${lot.id}#diagnostics`,
          critique: false,
          diagnosticIds: expires("dpe", deposesLot),
        });
      }
      if (!biensSignales.has(bien.id)) {
        const deposesBien = lignesDiagnostics.filter((d) => d.bien_id === bien.id);
        if (obligatoireEnDefaut("erp", deposesBien)) {
          biensSignales.add(bien.id);
          diags.push({
            cle: `erp-${bien.id}`,
            titre: `ERP absent ou expiré — ${bien.nom}`,
            detail: "État des risques, validité 6 mois (à l'immeuble)",
            href: `${base}/parc/${bien.id}#diagnostics`,
            critique: false,
            diagnosticIds: expires("erp", deposesBien),
          });
        }
      }
    }
  }

  // Pièces de la GED expirées (le RPC rend « à renouveler sous 30 j » quand on
  // lui passe une limite future ; ici la limite est aujourd'hui, on ne garde
  // que le strictement expiré).
  const pieces: ActionAttendue[] = (
    (erreurs.pieces ? [] : piecesARenouveler) as { id: string; titre: string; expire_le: string }[]
  )
    .filter((p) => estExpiree(p.expire_le))
    .map((p) => ({
      cle: `piece-${p.id}`,
      titre: `Pièce expirée — ${p.titre}`,
      detail: `expirée le ${formaterDate(p.expire_le)}`,
      href: `${base}/documents?sel=${p.id}`,
      critique: false,
    }));

  // Les impayés d'abord (argent en jeu), puis ce qui fragilise le bail, puis
  // la conformité et l'intendance documentaire.
  return { actions: [...impayes, ...edls, ...diags, ...pieces], erreurs };
}

// Une alerte ouverte peut porter la même nouvelle qu'un item calculé : on ne
// l'affiche pas deux fois, l'item calculé fait foi. Longtemps limité à l'EDL
// d'entrée (alerte posée à l'activation du bail), le dédoublonnage couvre
// depuis le 25/09 tout ce que les tâches de nuit reposent chaque jour — un
// impayé donnait « Bail bloqué » ET « Alerte critique » pour le même loyer :
//   - loyer_impaye (details.bail_id)            ↔ impaye-<bail_id> ;
//   - edl_entree (details.bail_id)              ↔ edl-<bail_id> ;
//   - assurance_expiration (details.document_id) ↔ piece-<document_id> ;
//   - diagnostic_expiration (details.diagnostic_id) ↔ l'item DPE/ERP qui
//     porte ce diagnostic parmi ses `diagnosticIds`.
// Une alerte de seuil anticipé (J-30, J-15…) n'a pas d'item calculé en face,
// puisque rien n'est encore expiré : elle reste affichée.
const CLE_PAR_TYPE_ALERTE: Record<string, { champ: string; prefixe: string }> = {
  edl_entree: { champ: "bail_id", prefixe: "edl" },
  loyer_impaye: { champ: "bail_id", prefixe: "impaye" },
  assurance_expiration: { champ: "document_id", prefixe: "piece" },
};

export function sansAlertesDoublonnees<
  T extends { type: string; details: Record<string, unknown> | null }
>(alertes: T[], actions: ActionAttendue[]): T[] {
  const cles = new Set(actions.map((a) => a.cle));
  const diagnosticsCouverts = new Set(actions.flatMap((a) => a.diagnosticIds ?? []));
  const identifiant = (a: T, champ: string): string | null => {
    const v = a.details?.[champ];
    return typeof v === "string" ? v : null;
  };
  return alertes.filter((a) => {
    if (a.type === "diagnostic_expiration") {
      const id = identifiant(a, "diagnostic_id");
      return !(id && diagnosticsCouverts.has(id));
    }
    const regle = CLE_PAR_TYPE_ALERTE[a.type];
    if (!regle) return true;
    const id = identifiant(a, regle.champ);
    return !(id && cles.has(`${regle.prefixe}-${id}`));
  });
}
