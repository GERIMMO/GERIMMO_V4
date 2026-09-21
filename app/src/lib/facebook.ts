import { adresseDuSite } from "@/lib/site";

export type PublicationFacebook = {
  id?: string;
  post_id?: string;
};

export type ArticleFacebook = {
  titre: string;
  chapo: string | null;
  slug: string;
  facebookTexte: string | null;
  facebookImageUrl: string | null;
};

export function texteFacebook(article: ArticleFacebook): string {
  const site = adresseDuSite() ?? "https://www.gerimmo.app";
  const url = `${site}/journal/${article.slug}`;
  const introduction = article.facebookTexte?.trim() ||
    `${article.titre}\n\n${article.chapo?.trim() || "Un nouvel article du Journal Gerimmo."}`;
  return `${introduction}\n\nLire l’article : ${url}`.slice(0, 5000);
}

function baseGraph(): string {
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  return version
    ? `https://graph.facebook.com/${version.replace(/^\/+/, "")}`
    : "https://graph.facebook.com";
}

function messageMeta(erreur: unknown): string {
  if (!erreur || typeof erreur !== "object") return "Meta n’a pas accepté la publication.";
  const valeur = erreur as { error?: { message?: string; code?: number } };
  const code = valeur.error?.code ? ` (code ${valeur.error.code})` : "";
  return `${valeur.error?.message?.trim() || "Meta n’a pas accepté la publication."}${code}`;
}

export async function envoyerSurFacebook(article: ArticleFacebook): Promise<PublicationFacebook> {
  const pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
  const jeton = process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !jeton) {
    throw new Error("La connexion Facebook de Gerimmo n’est pas encore configurée.");
  }

  const message = texteFacebook(article);
  const image = article.facebookImageUrl?.trim();
  const chemin = image ? "photos" : "feed";
  const donnees = new URLSearchParams({ access_token: jeton });
  if (image) {
    if (!/^https:\/\//i.test(image)) throw new Error("Le visuel Facebook doit utiliser une adresse HTTPS publique.");
    donnees.set("url", image);
    donnees.set("caption", message);
  } else {
    donnees.set("message", message);
    const site = adresseDuSite() ?? "https://www.gerimmo.app";
    donnees.set("link", `${site}/journal/${article.slug}`);
  }

  const reponse = await fetch(`${baseGraph()}/${encodeURIComponent(pageId)}/${chemin}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: donnees,
    signal: AbortSignal.timeout(30_000),
  });
  const resultat = (await reponse.json().catch(() => null)) as PublicationFacebook | null;
  if (!reponse.ok || !resultat) throw new Error(messageMeta(resultat));
  const identifiant = resultat.post_id || resultat.id;
  if (!identifiant) throw new Error("Meta a répondu sans identifiant de publication.");
  return { ...resultat, post_id: identifiant };
}

