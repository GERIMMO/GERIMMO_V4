import "server-only";
import { prixPropose, REFERENCES_TRAVAUX, type RepereHistorique } from "./references-prix-travaux";

export type LigneProposee = { code?: string; libelle: string; quantite: number; prix_unitaire_ht_cents: number | null; tva_bps: number | null };
export type PropositionDevis = {
  moteur: "ia" | "references"; diagnostic: string; lignes: LigneProposee[];
  a_verifier: string[]; sources: NonNullable<ReturnType<typeof prixPropose>>[]; genere_le: string;
};

/** L'API ne reçoit ni description brute, ni identité, ni adresse : seulement
 * la catégorie, la nature des travaux et des termes techniques autorisés. */
export function contexteTechnique(categorie: string, description: string | null) {
  const lexique = ["fuite", "robinet", "mitigeur", "joint", "canalisation", "bouché", "évier", "chasse", "wc", "prise", "disjoncteur", "interrupteur", "peinture", "mur", "plafond", "humidité", "chauffage", "chaudière", "radiateur", "serrure", "porte", "fenêtre", "volet", "vitrage", "infiltration", "toiture", "rats", "cafards", "punaises", "ventilation"];
  const texte = (description ?? "").toLowerCase();
  return { categorie, symptomes: lexique.filter(mot => new RegExp(`(^|[^a-zà-ÿ])${mot}([^a-zà-ÿ]|$)`, "i").test(texte)) };
}

export async function proposerDevis(categorie: string, description: string | null, historique: RepereHistorique[]): Promise<PropositionDevis> {
  const contexte = contexteTechnique(categorie, description);
  const metier = categorie.startsWith("plomberie") ? "plomberie" : categorie.startsWith("electricite") ? "electricite" : categorie.includes("peinture") ? "peinture" : "";
  const catalogue = REFERENCES_TRAVAUX.filter(r => r.metier === metier);
  const codes: string[] = [...catalogue.map(r => r.code), "a_chiffrer"];
  let selections: { code: string; libelle?: string; quantite: number }[] = catalogue.length ? [{ code: catalogue[0].code, quantite: 1 }] : [];
  let diagnostic = contexte.symptomes.length ? `Constat signalé : ${contexte.symptomes.join(", ")}. Cause et réparation à confirmer sur place.` : "Diagnostic à préciser après examen de la demande.";
  let aVerifier = ["Confirmez les quantités et la solution technique.", "Ajoutez les fournitures, déplacements et autres prestations nécessaires.", "Choisissez la TVA selon votre situation et les travaux.", "Précisez votre disponibilité et la durée de l’intervention."];
  let moteur: PropositionDevis["moteur"] = "references";
  const cle = process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim();
  if (cle) {
    try {
      const reponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_DEVIS_MODEL?.trim() || process.env.OPENAI_BRIEF_MODEL?.trim() || "gpt-5.6-luna",
          store: false, max_output_tokens: 1800,
          instructions: "Prépare une proposition de devis français à relire par un artisan. Les seules données sont des symptômes signalés, pas un diagnostic vérifié. Sélectionne uniquement des codes du catalogue, ou a_chiffrer pour une prestation sans référence. Pour a_chiffrer, décris la prestation dans libelle (240 caractères maximum) ; son prix sera demandé à l’artisan. N'invente aucun prix, taux de TVA, mesure, disponibilité ou réparation certaine. Une quantité de 1 est une hypothèse à faire confirmer, pas une mesure. Si la prestation n'est pas adaptée, laisse les lignes vides et explique ce qui manque. Le diagnostic doit distinguer constat et hypothèse. Aucune action d'envoi ou de validation. Réponds en JSON.",
          input: JSON.stringify({ contexte, catalogue: catalogue.map(r => ({ code: r.code, libelle: r.libelle, unite: r.unite })) }),
          text: { format: { type: "json_schema", name: "proposition_devis", strict: true, schema: {
            type: "object", additionalProperties: false, required: ["diagnostic", "lignes", "a_verifier"],
            properties: { diagnostic: { type: "string" }, a_verifier: { type: "array", items: { type: "string" } },
              lignes: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "libelle", "quantite"], properties: { libelle: { type: "string" }, code: { type: "string", enum: codes }, quantite: { type: "number" } } } },
          } } } },
        }),
      });
      if (!reponse.ok) throw new Error("IA indisponible");
      const body = await reponse.json();
      const texte = body.output?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).find((c: { type: string }) => c.type === "output_text")?.text;
      const resultat = JSON.parse(texte ?? "{}");
      if (typeof resultat.diagnostic !== "string" || !resultat.diagnostic.trim() || resultat.diagnostic.length > 4000 || !Array.isArray(resultat.lignes) || resultat.lignes.length > 8 ||
          !Array.isArray(resultat.a_verifier) || resultat.a_verifier.some((v: unknown) => typeof v !== "string" || v.length > 500) ||
          resultat.lignes.some((l: { code: string; libelle?: string; quantite: number }) => !l || !codes.includes(l.code) || (l.code === "a_chiffrer" && (typeof l.libelle !== "string" || !l.libelle.trim() || l.libelle.length > 240)) || !Number.isFinite(l.quantite) || l.quantite <= 0 || l.quantite > 1000 || !/^\d+(\.\d{1,3})?$/.test(String(l.quantite)))) throw new Error("Proposition invalide");
      selections = resultat.lignes; diagnostic = resultat.diagnostic; aVerifier = [...resultat.a_verifier.slice(0, 8), ...aVerifier]; moteur = "ia";
    } catch { aVerifier.unshift("L’IA est momentanément indisponible. Les repères sourcés restent utilisables."); }
  } else if (!cle) aVerifier.unshift("L’analyse IA n’est pas connectée dans cet environnement. Proposition issue du catalogue de références.");
  const sources = selections.map(l => prixPropose(l.code, historique)).filter((s): s is NonNullable<typeof s> => s !== null);
  const lignes: LigneProposee[] = selections.flatMap<LigneProposee>(l => {
    if (l.code === "a_chiffrer") return [{ code:"", libelle:l.libelle!.trim(), quantite:l.quantite, prix_unitaire_ht_cents:null, tva_bps:null }];
    const prix = prixPropose(l.code, historique);
    return prix ? [{ code: l.code, libelle: `${prix.libelle} (${prix.unite})`, quantite: l.quantite, prix_unitaire_ht_cents: prix.prix_unitaire_ht_cents, tva_bps: null }] : [];
  });
  if (!lignes.length) {
    lignes.push({ code: "", libelle: "Prestation à préciser", quantite: 1, prix_unitaire_ht_cents: null, tva_bps: null });
    aVerifier.unshift("Aucune référence suffisamment précise pour ces travaux : le prix reste à compléter par l’artisan.");
  }
  return { moteur, diagnostic, lignes, a_verifier: [...new Set(aVerifier)], sources, genere_le: new Date().toISOString() };
}
