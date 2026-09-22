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

export function messageMetaLisible(erreur: unknown, defaut = "Meta n’a pas accepté la demande."): string {
  const brut = erreur instanceof Error
    ? erreur.message
    : erreur && typeof erreur === "object"
      ? (erreur as { error?: { message?: string } }).error?.message
      : typeof erreur === "string" ? erreur : "";
  const message = brut?.trim() ?? "";
  if (/ads_management|ads_read|ad account owner/i.test(message)) {
    return "Le compte est relié, mais les autorisations Meta Ads restent à accorder à Gerimmo dans Meta Business.";
  }
  if (/access token|oauth|session has expired|invalid token/i.test(message)) {
    return "L’autorisation Meta a expiré ou n’est plus valide. Renouvelez la connexion de Gerimmo dans Meta Business.";
  }
  if (/permission|permissions error/i.test(message)) {
    return "Meta refuse encore cette action : vérifiez les autorisations accordées à Gerimmo dans Meta Business.";
  }
  return message && !/^\(#?\d+\)/.test(message) ? message : defaut;
}

function messageMeta(erreur: unknown): string {
  return messageMetaLisible(erreur, "Meta n’a pas accepté la publication.");
}

async function jetonPourLaPage(pageId: string, jeton: string): Promise<string> {
  // Un jeton d'utilisateur système Meta lit correctement la Page mais doit être
  // échangé contre son jeton de Page avant d'écrire. Si l'environnement porte
  // déjà un jeton de Page, l'appel peut ne rien retourner : on le conserve.
  try {
    const url = new URL(`${baseGraph()}/me/accounts`);
    url.searchParams.set("fields", "id,access_token");
    url.searchParams.set("access_token", jeton);
    const reponse = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!reponse.ok) return jeton;
    const resultat = await reponse.json() as { data?: Array<{ id?: string; access_token?: string }> };
    return resultat.data?.find((p) => p.id === pageId)?.access_token?.trim() || jeton;
  } catch {
    return jeton;
  }
}

export async function envoyerSurFacebook(article: ArticleFacebook): Promise<PublicationFacebook> {
  const pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
  const jeton = process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !jeton) {
    throw new Error("La connexion Facebook de Gerimmo n’est pas encore configurée.");
  }

  const jetonPage = await jetonPourLaPage(pageId, jeton);
  const message = texteFacebook(article);
  const image = article.facebookImageUrl?.trim();
  const chemin = image ? "photos" : "feed";
  const donnees = new URLSearchParams({ access_token: jetonPage });
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
