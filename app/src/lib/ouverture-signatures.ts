import { DOCUMENTS_ZOHO, type ModeleSignature } from "./politique-signature";
import { configurationSuiviSignatureBail } from "./signature-bail";
import { fermetureModeleSignature } from "./signature-interrupteurs";

export type OuvertureSignatures = {
  documents: { code: ModeleSignature; libelle: string; ouvert: boolean; motif: string }[];
  relances: boolean;
};

/** État serveur des NOUVEAUX envois clients. Aucune clé ni donnée de signataire ne sort de ce module. */
export function ouvertureSignatures(env: Record<string, string | undefined>, budget: { plafond: number; utilise: number; devisActif: boolean } | null): OuvertureSignatures {
  const connexion = configurationSuiviSignatureBail(env)?.environnement === "production";
  return {
    relances: connexion && env.ZOHO_SIGN_RELANCES_ACTIVES === "true",
    documents: (Object.entries(DOCUMENTS_ZOHO) as [ModeleSignature, string][]).map(([code, libelle]) => {
      const motif = fermetureModeleSignature(code, env)
        ?? (!connexion ? "Connexion Zoho à configurer" : null)
        ?? (env.ZOHO_SIGN_BAIL_ACTIF !== "true" ? "Envoi des baux désactivé" : null)
        ?? (code !== "bail" && env.ZOHO_SIGN_DOCUMENTS_ACTIF !== "true" ? "Envoi des autres actes désactivé" : null)
        ?? (code === "devis_artisan" && (env.ZOHO_SIGN_DEVIS_ACTIF !== "true" || !budget?.devisActif) ? "Envoi des devis désactivé" : null)
        ?? (!budget ? "Budget non disponible" : budget.plafond <= budget.utilise ? "Plafond mensuel atteint" : null);
      return { code, libelle, ouvert: !motif, motif: motif ?? "Ouvert sous réserve du dossier et du crédit disponible" };
    }),
  };
}
