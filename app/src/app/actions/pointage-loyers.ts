"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { emettreRecusQuittances } from "@/lib/quittances";
import { verifierDateDejaPassee } from "@/lib/saisie-montant";
import { clePointage, modeDepuisLibelle, type LigneAPointer } from "@/lib/pointage-loyers";

// Pointage des loyers à partir d'un relevé de banque (audit palier 1, P2-05).
//
// Le relevé est lu sur l'appareil du propriétaire ; seules les lignes qu'il a cochées arrivent ici. Chaque ligne est
// revérifiée (rien de ce que dit l'écran n'est cru sur parole), sa clé est RECALCULÉE, puis elle est enregistrée par
// `pointer_loyer_releve`, qui s'appuie sur la réception déclarée : le plus ancien loyer d'abord, le reste dû relu au
// moment d'écrire, une ligne ne compte qu'une fois. Une ligne refusée n'empêche pas les autres ; chacune a sa réponse.
//
// Les justificatifs (reçu ou quittance) sont créés comme après tout encaissement ; AUCUN e-mail ne part d'ici :
// l'envoi reste le geste habituel de l'écran des loyers.

export type ResultatLignePointee = {
  position: number;
  statut: "enregistre" | "deja_enregistre" | "deja_solde" | "refuse";
  message: string;
};
export type EtatPointage = { erreur?: string; resultats?: ResultatLignePointee[]; documents?: string };

const LIGNES_MAX = 100;
const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entierBorne = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

/** Dit le refus de la base avec les mots de CET écran (la fonction appelée parle du tableau de bord). */
function direRefus(message: string): string {
  if (/plus ancien reste à régler/.test(message)) return "Un loyer plus ancien de ce bail reste à régler : pointez-le d’abord.";
  if (/montant a changé/.test(message)) return "Le reste dû de ce loyer a changé depuis la lecture du relevé : relisez le relevé avant de recommencer.";
  if (/déjà été utilisée/.test(message)) return "Cette ligne du relevé a déjà servi à enregistrer un autre règlement.";
  if (/pas encore à confirmer/.test(message)) return "L’échéance de ce loyer n’est pas encore arrivée.";
  if (/Vérifiez le montant, la date et le mode/.test(message)) return "Le montant ou la date de cette ligne ne peut pas être enregistré pour ce loyer : saisissez ce règlement sur le bail.";
  return sansJargon(message);
}

export async function enregistrerPointage(orgId: string, lignes: LigneAPointer[]): Promise<EtatPointage> {
  const { supabase, user, role } = await verifierGerant(orgId, { geste: "encaissement" });
  if (!user || role !== "proprietaire_direct") return { erreur: "Accès refusé." };
  if (!Array.isArray(lignes) || lignes.length === 0) return { erreur: "Cochez au moins un règlement à enregistrer." };
  if (lignes.length > LIGNES_MAX) return { erreur: `Enregistrez ${LIGNES_MAX} règlements au plus à la fois.` };

  // 1. Chaque ligne est relue : types, bornes, date réelle et passée. Une seule ligne malformée arrête tout, avant
  //    la moindre écriture : ce n'est pas ce que l'écran envoie.
  const positions = new Set<number>();
  for (const l of lignes) {
    const valide = l && typeof l === "object"
      && entierBorne(l.position, 0, 5000) && !positions.has(l.position)
      && typeof l.date === "string" && verifierDateDejaPassee(l.date) === null && l.date >= "1990-01-01"
      && entierBorne(l.centimes, 1, 999_999_999) && entierBorne(l.resteCentimes, 1, 999_999_999)
      && l.centimes <= l.resteCentimes
      && typeof l.libelle === "string" && l.libelle.length <= 200
      && entierBorne(l.rang, 0, 5000)
      && typeof l.appelId === "string" && FORMAT_UUID.test(l.appelId);
    if (!valide) return { erreur: "Cette sélection ne peut pas être enregistrée. Relisez le relevé avant de recommencer." };
    positions.add(l.position);
  }

  // 2. Les loyers visés, relus dans l'espace : leur bail et leur mois donnent l'ordre d'enregistrement (du plus ancien
  //    au plus récent pour chaque bail, puis dans l'ordre des dates du relevé).
  const ids = [...new Set(lignes.map((l) => l.appelId))];
  const { data: appels, error } = await supabase
    .from("appels_loyer").select("id,bail_id,periode").eq("organization_id", orgId).in("id", ids);
  if (error) return { erreur: "Impossible de relire les loyers. Aucun règlement n’a été enregistré." };
  const parAppel = new Map((appels ?? []).map((a) => [a.id as string, { bail: a.bail_id as string, periode: String(a.periode) }]));
  const ordonnees = [...lignes].sort((x, y) => {
    const a = parAppel.get(x.appelId), b = parAppel.get(y.appelId);
    return (a?.bail ?? "").localeCompare(b?.bail ?? "")
      || (a?.periode ?? "").localeCompare(b?.periode ?? "")
      || x.date.localeCompare(y.date)
      || x.position - y.position;
  });

  // 3. Une ligne après l'autre : l'ordre compte, et chaque refus reste celui de sa ligne.
  const resultats: ResultatLignePointee[] = [];
  const baux = new Set<string>();
  for (const l of ordonnees) {
    const loyer = parAppel.get(l.appelId);
    if (!loyer) {
      resultats.push({ position: l.position, statut: "refuse", message: "Ce loyer n’est plus accessible." });
      continue;
    }
    const cle = await clePointage(orgId, l);
    const { data, error: refus } = await supabase.rpc("pointer_loyer_releve", {
      p_org: orgId, p_appel: l.appelId, p_montant: l.centimes / 100, p_date: l.date,
      p_mode: modeDepuisLibelle(l.libelle), p_cle: cle, p_reste_attendu: l.resteCentimes / 100, p_libelle: l.libelle,
    });
    if (refus) {
      resultats.push({ position: l.position, statut: "refuse", message: direRefus(refus.message) });
      continue;
    }
    const statut = (data as { statut?: string } | null)?.statut;
    if (statut === "enregistre") {
      baux.add(loyer.bail);
      resultats.push({ position: l.position, statut: "enregistre", message: l.centimes === l.resteCentimes ? "Enregistré : ce loyer est soldé." : "Enregistré : règlement partiel." });
    } else if (statut === "deja_enregistre") {
      resultats.push({ position: l.position, statut: "deja_enregistre", message: "Déjà enregistré : aucun doublon ajouté." });
    } else if (statut === "deja_solde") {
      resultats.push({ position: l.position, statut: "deja_solde", message: "Ce loyer est déjà soldé : rien n’a été ajouté." });
    } else if (statut === "annule") {
      resultats.push({ position: l.position, statut: "refuse", message: "Ce règlement avait été enregistré puis retiré du bail. S’il a bien été reçu, saisissez-le sur le bail." });
    } else {
      resultats.push({ position: l.position, statut: "refuse", message: "Le résultat n’a pas pu être vérifié : consultez le bail avant de recommencer." });
    }
  }

  // 4. Les justificatifs des baux touchés, comme après tout encaissement. Un échec ici ne remet pas le règlement en cause.
  const echecs: string[] = [];
  for (const bail of baux) {
    const emission = await emettreRecusQuittances(supabase, bail).catch(() => ({ erreur: "création du justificatif à vérifier" }));
    if (emission.erreur) echecs.push(emission.erreur);
  }
  if (baux.size) {
    for (const racine of ["agence", "espace"]) {
      for (const suffixe of ["", "/loyers", "/loyers/pointage", "/comptabilite", "/alertes"]) revalidatePath(`/${racine}/${orgId}${suffixe}`);
      for (const bail of baux) revalidatePath(`/${racine}/${orgId}/baux/${bail}`);
    }
  }
  return {
    resultats: resultats.sort((x, y) => x.position - y.position),
    documents: echecs.length ? `Les justificatifs restent à vérifier sur le bail : ${echecs[0]}` : undefined,
  };
}
