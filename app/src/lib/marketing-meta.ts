import "server-only";

type ErreurMeta = { error?: { message?: string } };

export type SanteFacebook = {
  configure: boolean;
  nom?: string;
  abonnes?: number;
  lien?: string;
  erreur?: string;
};

export type CampagneMeta = {
  id: string;
  nom: string;
  statut: string;
  debut: string | null;
  fin: string | null;
  portee: number;
  impressions: number;
  clics: number;
  depense: number;
};

function baseGraph() {
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  return version ? `https://graph.facebook.com/${version.replace(/^\/+/, "")}` : "https://graph.facebook.com";
}

async function lireMeta<T>(chemin: string, parametres: Record<string, string>): Promise<T> {
  const jeton = process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!jeton) throw new Error("Jeton Facebook absent");
  const url = new URL(`${baseGraph()}/${chemin.replace(/^\/+/, "")}`);
  Object.entries(parametres).forEach(([cle, valeur]) => url.searchParams.set(cle, valeur));
  url.searchParams.set("access_token", jeton);
  const reponse = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(15_000) });
  const resultat = (await reponse.json().catch(() => ({}))) as T & ErreurMeta;
  if (!reponse.ok) throw new Error(resultat.error?.message || "Meta ne répond pas.");
  return resultat;
}

export async function santeFacebook(): Promise<SanteFacebook> {
  const pageId = process.env.META_FACEBOOK_PAGE_ID?.trim();
  const jeton = process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !jeton) return { configure: false };
  try {
    const page = await lireMeta<{ name: string; followers_count?: number; link?: string }>(pageId, {
      fields: "name,followers_count,link",
    });
    return { configure: true, nom: page.name, abonnes: page.followers_count, lien: page.link };
  } catch (erreur) {
    return { configure: true, erreur: erreur instanceof Error ? erreur.message : "Connexion Facebook indisponible" };
  }
}

export async function campagnesFacebook(): Promise<{ configure: boolean; campagnes: CampagneMeta[]; erreur?: string }> {
  const compte = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!compte || !process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim()) return { configure: false, campagnes: [] };
  try {
    const resultat = await lireMeta<{ data?: Array<{
      id: string; name: string; effective_status: string; start_time?: string; stop_time?: string;
      insights?: { data?: Array<{ reach?: string; impressions?: string; clicks?: string; spend?: string }> };
    }> }>(`${compte}/campaigns`, {
      fields: "id,name,effective_status,start_time,stop_time,insights.date_preset(maximum){reach,impressions,clicks,spend}",
      limit: "50",
    });
    return {
      configure: true,
      campagnes: (resultat.data ?? []).map((campagne) => {
        const mesure = campagne.insights?.data?.[0];
        return {
          id: campagne.id,
          nom: campagne.name,
          statut: campagne.effective_status,
          debut: campagne.start_time ?? null,
          fin: campagne.stop_time ?? null,
          portee: Number(mesure?.reach ?? 0),
          impressions: Number(mesure?.impressions ?? 0),
          clics: Number(mesure?.clicks ?? 0),
          depense: Number(mesure?.spend ?? 0),
        };
      }),
    };
  } catch (erreur) {
    return { configure: true, campagnes: [], erreur: erreur instanceof Error ? erreur.message : "Résultats Meta indisponibles" };
  }
}
