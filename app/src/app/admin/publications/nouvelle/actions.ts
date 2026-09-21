"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EtatNouvelArticle = { erreur?: string; valeurs?: Record<string, string> };

function contenuReponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof p.output_text === "string") return p.output_text;
  for (const sortie of p.output ?? []) {
    for (const contenu of sortie.content ?? []) if (typeof contenu.text === "string") return contenu.text;
  }
  return null;
}

export async function creerArticleIA(
  _etat: EtatNouvelArticle,
  formData: FormData
): Promise<EtatNouvelArticle> {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) return { erreur: "Accès réservé à la supervision." };

  const sujet = String(formData.get("sujet") ?? "").trim();
  const publicVise = String(formData.get("public") ?? "").trim();
  const faits = String(formData.get("faits") ?? "").trim();
  const valeurs = { sujet, public: publicVise, faits };
  if (sujet.length < 10) return { erreur: "Décrivez le sujet en une phrase complète.", valeurs };
  if (faits.length < 30) return { erreur: "Ajoutez les faits que Gerimmo peut affirmer sans les inventer.", valeurs };

  const cle = process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_AI_KEY?.trim();
  if (!cle) return { erreur: "La rédaction assistée attend la clé OpenAI configurée dans Vercel.", valeurs };

  let document: { titre: string; chapo: string; corps: string; seo_description: string; facebook_texte: string };
  try {
    const reponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_PUBLICATION_MODEL?.trim() || "gpt-5.6-luna",
        store: false,
        max_output_tokens: 1800,
        instructions: "Tu rédiges au nom de Gerimmo, logiciel français de gestion locative. Produis un article clair, utile et sobre en français. N'invente aucun chiffre, témoignage, client, résultat, règle juridique, intégration ou fonctionnalité. Utilise uniquement les faits fournis. Le corps est en Markdown avec des titres ##. Le texte Facebook est autonome, professionnel, sans parler d'IA, sans promesse absolue et sans URL. Réponds uniquement en JSON valide.",
        input: JSON.stringify({ sujet, public_vise: publicVise || "professionnels de la gestion locative", faits_valides: faits }),
        text: {
          format: {
            type: "json_schema",
            name: "article_gerimmo",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["titre", "chapo", "corps", "seo_description", "facebook_texte"],
              properties: {
                titre: { type: "string" }, chapo: { type: "string" }, corps: { type: "string" },
                seo_description: { type: "string" }, facebook_texte: { type: "string" },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!reponse.ok) return { erreur: reponse.status === 401 ? "La clé OpenAI a été refusée." : "La rédaction Gerimmo est momentanément indisponible.", valeurs };
    const brut = contenuReponse(await reponse.json());
    if (!brut) return { erreur: "La rédaction n’a renvoyé aucun article exploitable.", valeurs };
    document = JSON.parse(brut);
  } catch {
    return { erreur: "La rédaction n’a pas abouti. Aucun brouillon n’a été créé.", valeurs };
  }

  const { data, error } = await supabase.from("publications").insert({
    periode: new Date().toISOString().slice(0, 10), statut: "brouillon",
    titre: document.titre.trim().slice(0, 180), chapo: document.chapo.trim(), corps: document.corps.trim(),
    seo_description: document.seo_description.trim().slice(0, 160),
    facebook_texte: document.facebook_texte.trim().slice(0, 4500),
  }).select("id").single();
  if (error || !data) return { erreur: "Le brouillon n’a pas pu être enregistré.", valeurs };
  redirect(`/admin/publications/${data.id}`);
}

