import { DOCUMENTS_ZOHO, type ModeleSignature } from "./politique-signature";
import { connexionSignatureProduction, motifFermetureSelonReglages, MOTIF_DEVIS } from "./reglages-signature";

export type OuvertureSignatures = {
  documents: { code: ModeleSignature; libelle: string; ouvert: boolean; motif: string }[];
  relances: boolean;
};

// Les réglages serveur (connexion, interrupteurs) se lisent dans lib/reglages-signature.ts, module léger que la ligne
// « Envoi du cautionnement » de la santé (lib/sante-service.ts) lit aussi. Ici seulement s'y ajoute le budget du mois lu
// en base : les deux écrans s'accordent sur les réglages, pas sur le budget (voir motifFermetureSelonReglages).

/** État serveur des NOUVEAUX envois clients. Aucune clé ni donnée de signataire ne sort de ce module. */
export function ouvertureSignatures(env: Record<string, string | undefined>, budget: { plafond: number; utilise: number; devisActif: boolean } | null): OuvertureSignatures {
  const connexion = connexionSignatureProduction(env);
  return {
    relances: connexion && env.ZOHO_SIGN_RELANCES_ACTIVES === "true",
    documents: (Object.entries(DOCUMENTS_ZOHO) as [ModeleSignature, string][]).map(([code, libelle]) => {
      const motif = motifFermetureSelonReglages(code, env)
        ?? (code === "devis_artisan" && !budget?.devisActif ? MOTIF_DEVIS : null)
        ?? (!budget ? "Budget non disponible" : budget.plafond <= budget.utilise ? "Plafond mensuel atteint" : null);
      return { code, libelle, ouvert: !motif, motif: motif ?? "Ouvert sous réserve du dossier et du crédit disponible" };
    }),
  };
}
