import type { EtatPersonne } from "@/app/actions/personnes";
import type { EtatDossier } from "@/app/actions/dossier";
import type { EtatPieceDemandee } from "@/app/actions/pieces-demandees";
import { TAILLE_MAX_OCTETS } from "@/lib/file-type";

export type JustificatifPrepare = {
  id: string;
  type: "piece_identite" | "justificatif" | "attestation_assurance";
  titre: string;
  mode: "depot" | "demande";
  fichier?: File;
  expireLe?: string;
};
export type ResultatJustificatif = { succes?: string; erreur?: string; avertissement?: string; incertain?: boolean };
export type BilanCreationFiche = EtatPersonne & {
  pieces?: Record<string, ResultatJustificatif>;
  terminee?: boolean;
};
type Actions = {
  creer: (org: string, etat: EtatPersonne, data: FormData) => Promise<EtatPersonne>;
  deposer: (org: string, personne: string, etat: EtatDossier, data: FormData) => Promise<EtatDossier>;
  demander: (org: string, personne: string, etat: EtatPieceDemandee, data: FormData) => Promise<EtatPieceDemandee>;
};

export function erreurJustificatif(piece: JustificatifPrepare): string | undefined {
  if (!piece.titre.trim()) return "Indiquez le nom du document.";
  if (piece.titre.trim().length > (piece.mode === "demande" ? 120 : 200)) return "Le nom du document est trop long.";
  if (piece.mode === "depot") {
    if (!piece.fichier?.size) return "Choisissez un fichier ou retirez ce document pour continuer sans lui.";
    if (piece.fichier.size > TAILLE_MAX_OCTETS) return "Le fichier dépasse 10 Mo.";
    if (!/\.(pdf|jpe?g|png)$/i.test(piece.fichier.name)) return "Choisissez un fichier PDF, JPG ou PNG.";
  }
}

/** Orchestration côté client : un envoi par fichier, sans recréer la personne
 * ni renvoyer une pièce déjà confirmée lors d'une reprise après un refus. Les
 * actions existantes revérifient chacune les droits et le contenu côté serveur. */
export async function enregistrerFicheAvecJustificatifs(
  orgId: string, formData: FormData, pieces: JustificatifPrepare[],
  precedent: BilanCreationFiche, actions: Actions,
): Promise<BilanCreationFiche> {
  const resultats = { ...precedent.pieces };
  const invalide = pieces.find(p => !resultats[p.id]?.succes && erreurJustificatif(p));
  if (invalide) return { ...precedent, erreur: `${invalide.titre || "Justificatif"} : ${erreurJustificatif(invalide)}` };
  let creation: EtatPersonne = precedent;
  if (!creation.personneCreee) {
    // Les fichiers sont envoyés séparément, après confirmation de la fiche.
    const identite = new FormData();
    for (const [cle, valeur] of formData) if (typeof valeur === "string") identite.set(cle, valeur);
    identite.set("rester_dans_parcours", "1");
    try { creation = await actions.creer(orgId, {}, identite); }
    catch { return { erreur: "La création n’a pas pu être confirmée. Vérifiez la liste des fiches avant de réessayer." }; }
    if (!creation.personneCreee) return creation;
  }
  for (const piece of pieces) {
    if (resultats[piece.id]?.succes || resultats[piece.id]?.incertain) continue;
    const data = new FormData();
    data.set("type", piece.type);
    try {
      if (piece.mode === "depot") {
        data.set("titre", piece.titre.trim());
        data.set("fichier", piece.fichier!);
        if (piece.expireLe) data.set("expire_le", piece.expireLe);
        resultats[piece.id] = await actions.deposer(orgId, creation.personneCreee.id, {}, data);
      } else {
        data.set("libelle", piece.titre.trim());
        resultats[piece.id] = await actions.demander(orgId, creation.personneCreee.id, {}, data);
      }
    } catch {
      // Une réponse perdue ne prouve pas un échec. Ne pas doubler un dépôt ou
      // un e-mail : la fiche permet de vérifier le résultat avant de poursuivre.
      resultats[piece.id] = { erreur: "Envoi non confirmé. Vérifiez ce document dans la fiche avant de le renvoyer.", incertain: true };
    }
  }
  const terminee = pieces.every(p => Boolean(resultats[p.id]?.succes));
  return {
    ...creation, pieces: resultats, terminee,
    erreur: terminee ? undefined : "La fiche est créée. Certains justificatifs restent à traiter : les éléments déjà enregistrés sont conservés.",
  };
}
