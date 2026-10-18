import type { DocumentAssemble } from "@/lib/documents/gabarit";

/** Liste serveur explicite, sans joker ; une configuration invalide refuse tout essai. */
export function signatureEnEssai(org: string, env: Record<string, string | undefined> = process.env): boolean {
  const ids = (env.SIGNATURE_BAIL_ORGS_ESSAI ?? "").split(",").map(v => v.trim()).filter(Boolean);
  return ids.length > 0 && ids.every(v => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)) && ids.includes(org);
}

export function marquerDocumentEssai(document: DocumentAssemble): DocumentAssemble {
  const avertissement = '<aside style="border:3px solid #b45309;padding:16px;margin-bottom:24px;color:#78350f;background:#fff7ed"><h1>ESSAI TECHNIQUE — SANS ENGAGEMENT</h1><p>Document fictif destiné exclusivement à vérifier la signature électronique Gerimmo. Il ne constitue pas un contrat de location, ne donne aucun droit sur un logement et ne crée aucune obligation de paiement.</p><p>Les noms, le logement et les montants qui suivent sont des données de démonstration.</p></aside>';
  return { ...document, html: document.html.replace(/<body(?:\s[^>]*)?>/i, balise => `${balise}${avertissement}`) };
}
