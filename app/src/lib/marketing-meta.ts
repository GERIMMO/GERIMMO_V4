import "server-only";
import { messageMetaLisible } from "@/lib/facebook";

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
    return { configure: true, erreur: messageMetaLisible(erreur, "Connexion Facebook momentanément indisponible.") };
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
    return { configure: true, campagnes: [], erreur: messageMetaLisible(erreur, "Résultats Meta momentanément indisponibles.") };
  }
}

/** Total du compte sur le mois du compte Meta : les relevés historiques ne sont pas additionnés. */
export async function depenseFacebookDuMois(): Promise<{ cents: number | null; debut?: string; fin?: string; erreur?: string }> {
  const compte = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!compte || !process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim()) return { cents: null, erreur: 'La lecture des dépenses Meta reste à connecter.' };
  try {
    const resultat = await lireMeta<{ data?: Array<{ spend?: string; account_currency?: string; date_start?: string; date_stop?: string }>; paging?: { next?: string } }>(`${compte}/insights`, {
      fields: 'spend,account_currency,date_start,date_stop', date_preset: 'this_month', level: 'account', limit: '1',
    });
    if (!Array.isArray(resultat.data) || resultat.paging?.next || resultat.data.length > 1) return { cents: null, erreur: 'Le total mensuel Meta ne peut pas encore être confirmé.' };
    // Une réponse vide ne prouve pas une dépense nulle : accès restreint et absence de données sont possibles.
    const mesure = resultat.data[0];
    if (!mesure) return { cents: null, erreur: 'Meta n’a pas encore fourni de relevé pour ce mois.' };
    if (mesure.account_currency !== 'EUR') return { cents: null, erreur: 'Le compte publicitaire doit fournir ses dépenses en euros pour être comparé au budget.' };
    if (typeof mesure.spend !== 'string' || !/^\d+(\.\d{1,2})?$/.test(mesure.spend)) return { cents: null, erreur: 'Le montant transmis par Meta doit être vérifié.' };
    const cents = Math.round(Number(mesure.spend) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) return { cents: null, erreur: 'Le montant transmis par Meta doit être vérifié.' };
    return { cents, debut: mesure.date_start, fin: mesure.date_stop };
  } catch (erreur) {
    return { cents: null, erreur: messageMetaLisible(erreur, 'Le total mensuel Meta est momentanément indisponible.') };
  }
}
