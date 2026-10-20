import type { EtatPersonne } from "@/app/actions/personnes";
import type { EtatDossier } from "@/app/actions/dossier";
import type { EtatPieceDemandee } from "@/app/actions/pieces-demandees";
import { MAX_DEPOT_DIRECT } from "@/lib/depot-direct-commun";
import { MESSAGE_SESSION_EXPIREE, sessionExpiree } from "@/lib/session-expiree";

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
  creationIncertaine?: boolean;
};
type Actions = {
  preparer?: (data:FormData,pieceId:string)=>Promise<void>;
  memoriser?: (bilan: BilanCreationFiche) => Promise<unknown>;
  creer: (org: string, etat: EtatPersonne, data: FormData) => Promise<EtatPersonne>;
  deposer: (org: string, personne: string, etat: EtatDossier, data: FormData) => Promise<EtatDossier>;
  demander: (org: string, personne: string, etat: EtatPieceDemandee, data: FormData) => Promise<EtatPieceDemandee>;
};

export function erreurJustificatif(piece: JustificatifPrepare): string | undefined {
  if (!piece.titre.trim()) return "Indiquez le nom du document.";
  if (piece.titre.trim().length > (piece.mode === "demande" ? 120 : 200)) return "Le nom du document est trop long.";
  if (piece.mode === "depot") {
    if (!piece.fichier?.size) return "Choisissez un fichier ou retirez ce document pour continuer sans lui.";
    if (piece.fichier.size > MAX_DEPOT_DIRECT) return "Le fichier dépasse 10 Mo.";
    if (!/\.(pdf|jpe?g|png)$/i.test(piece.fichier.name)) return "Choisissez un fichier PDF, JPG ou PNG.";
  }
}

/** Orchestration côté client : un envoi par fichier, sans recréer la personne
 * ni renvoyer une pièce déjà confirmée lors d'une reprise après un refus. Les
 * actions existantes revérifient chacune les droits et le contenu côté serveur.
 *
 * Décision D31 (PR178-A-03) : la demande de création porte une clé (`creation_id`, tirée par l'écran et conservée
 * avec sa copie locale). Après une réponse perdue, renvoyer la même demande est sans risque : le serveur retrouve
 * la fiche déjà créée au lieu d'en créer une seconde. Sans clé (copie enregistrée avant cette décision), on ne peut
 * pas le prouver : l'ancienne protection reste, la fiche est à vérifier dans la liste avant de recommencer. */
export async function enregistrerFicheAvecJustificatifs(
  orgId: string, formData: FormData, pieces: JustificatifPrepare[],
  precedent: BilanCreationFiche, actions: Actions,
): Promise<BilanCreationFiche> {
  const avecCle = Boolean(formData.get("creation_id"));
  if (precedent.creationIncertaine && !avecCle) return { ...precedent, erreur: "La création précédente n’a pas été confirmée. Vérifiez la liste des fiches avant de recommencer." };
  const resultats = { ...precedent.pieces };
  const invalide = pieces.find(p => !resultats[p.id]?.succes && erreurJustificatif(p));
  if (invalide) return { ...precedent, erreur: `${invalide.titre || "Justificatif"} : ${erreurJustificatif(invalide)}` };
  let creation: EtatPersonne = precedent;
  if (!creation.personneCreee) {
    // Les fichiers sont envoyés séparément, après confirmation de la fiche.
    const identite = new FormData();
    for (const [cle, valeur] of formData) if (typeof valeur === "string") identite.set(cle, valeur);
    identite.set("rester_dans_parcours", "1");
    await actions.memoriser?.({ ...precedent, creationIncertaine: true });
    try { creation = await actions.creer(orgId, {}, identite); }
    catch {
      // Audit du 13/10 (PR178-A-03, PR178-A-05) : une session expirée est refusée par le proxy AVANT l'action : la fiche
      // n'existe pas. On retire la marque « incertaine » posée avant l'envoi, sans quoi le bouton restait désactivé pour toujours.
      if (await sessionExpiree()) {
        await actions.memoriser?.({ ...precedent });
        return { ...precedent, erreur: MESSAGE_SESSION_EXPIREE };
      }
      return {
        creationIncertaine: true,
        erreur: avecCle
          ? "La création n’a pas pu être confirmée. Vous pouvez relancer l’envoi : si la fiche a bien été créée, elle sera retrouvée et ne sera pas créée une seconde fois."
          : "La création n’a pas pu être confirmée. Vérifiez la liste des fiches avant de réessayer.",
      };
    }
    await actions.memoriser?.(creation);
    if (!creation.personneCreee) return creation;
  }
  for (const piece of pieces) {
    if (resultats[piece.id]?.succes || resultats[piece.id]?.incertain) continue;
    const data = new FormData();
    data.set("type", piece.type);
    if(piece.mode === "depot") {
      data.set("titre",piece.titre.trim());data.set("fichier",piece.fichier!);
      if(piece.expireLe)data.set("expire_le",piece.expireLe);
      try { await actions.preparer?.(data,piece.id); }
      catch { resultats[piece.id]={erreur:"Le transfert a échoué. Votre fichier est conservé ; réessayez.",incertain:false};await actions.memoriser?.({...creation,pieces:{...resultats}});continue; }
    }
    await actions.memoriser?.({ ...creation, pieces: { ...resultats, [piece.id]: { incertain: true, erreur: "Envoi non confirmé. Vérifiez ce document dans la fiche avant de le renvoyer." } } });
    try {
      if (piece.mode === "depot") {
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
    await actions.memoriser?.({ ...creation, pieces: { ...resultats } });
  }
  const terminee = pieces.every(p => Boolean(resultats[p.id]?.succes));
  return {
    ...creation, pieces: resultats, terminee,
    erreur: terminee ? undefined : "La fiche est créée. Certains justificatifs restent à traiter : les éléments déjà enregistrés sont conservés.",
  };
}
