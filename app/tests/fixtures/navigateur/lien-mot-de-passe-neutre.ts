// `@/lib/lien-mot-de-passe` dans le banc navigateur de l'inscription (banc-inscription.tsx) : la fabrique de liens (clé de
// service, courriel) n'a rien à faire dans un navigateur. `inscrireEtEnvoyerConfirmation` note ce qu'elle aurait enregistré
// (les métadonnées du compte) et rend le refus préparé par le test : aucun compte n'est créé, aucun courriel ne part.
import type { ResultatInscription } from "@/lib/lien-mot-de-passe";

export async function envoyerLienMotDePasse(): Promise<never> {
  throw new Error("Envoi de lien inattendu dans le banc");
}

export async function inscrireEtEnvoyerConfirmation(params: {
  email: string;
  metadonnees: Record<string, unknown>;
  next: string;
}): Promise<ResultatInscription> {
  const banc = window.__bancInscription;
  banc.inscriptions.push({ email: params.email, metadonnees: params.metadonnees, next: params.next });
  return banc.refus.shift() ?? { erreur: "Refus du banc" };
}
