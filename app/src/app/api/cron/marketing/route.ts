import { clientDeService } from "@/lib/supabase/service";
import { consignerTache, porteurDuSecret } from "@/lib/tache";
import { sujetMarketing } from "@/lib/contenu-marketing";
import { envoyerSurFacebook } from "@/lib/facebook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Reglages = { actif: boolean; publication_automatique: boolean; publicite_active: boolean; publications_semaine: number; jours_semaine: number[]; heure_paris: number; budget_mensuel_cents: number };

function maintenantParis() {
  const parties = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const p = Object.fromEntries(parties.map((x) => [x.type, x.value]));
  const jours: Record<string, number> = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 7 };
  return { date: `${p.year}-${p.month}-${p.day}`, jour: jours[p.weekday.replace(".", "")] ?? 0, heure: Number(p.hour), objet: new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`) };
}

export async function GET(request: Request) {
  if (!porteurDuSecret(request, process.env.CRON_SECRET)) return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Configuration serveur incomplète." }, { status: 503 });
  const { data: reglages, error: erreurReglages } = await supabase.from("marketing_reglages").select("actif,publication_automatique,publicite_active,publications_semaine,jours_semaine,heure_paris,budget_mensuel_cents").eq("singleton", true).single();
  if (erreurReglages || !reglages) return Response.json({ erreur: "Réglages marketing indisponibles." }, { status: 500 });
  const r = reglages as Reglages;
  const paris = maintenantParis();
  const rang = r.jours_semaine.indexOf(paris.jour);
  if (!r.actif || !r.publication_automatique || rang < 0) {
    const bilan = { agi: false, raison: !r.actif ? "agent en pause" : !r.publication_automatique ? "publication automatique désactivée" : "jour sans publication", date: paris.date };
    await consignerTache(supabase, "marketing", bilan);
    return Response.json(bilan);
  }

  const sujet = sujetMarketing(paris.objet, rang);
  const slug = `${paris.date}-${sujet.cle}`;
  const periode = `marketing-auto-${paris.date}`;
  const { data: existante } = await supabase.from("publications").select("id,slug,facebook_post_id").eq("slug", slug).maybeSingle();
  if (existante) {
    const bilan = { agi: false, raison: "publication déjà traitée", publication_id: existante.id, facebook: Boolean(existante.facebook_post_id) };
    await consignerTache(supabase, "marketing", bilan);
    return Response.json(bilan);
  }

  const { data: publication, error: erreurCreation } = await supabase.from("publications").insert({
    periode, statut: "publiee", titre: sujet.titre, slug, chapo: sujet.chapo, corps: sujet.corps,
    sources: [`audience:${sujet.audience}`, "contenu-editorial-gerimmo"], seo_description: sujet.chapo.slice(0, 160),
    facebook_texte: sujet.facebook, facebook_image_url: "https://www.gerimmo.app/marketing/facebook-premier-post.jpg", publie_le: new Date().toISOString(),
  }).select("id,titre,slug,chapo,facebook_texte,facebook_image_url").single();
  if (erreurCreation || !publication) {
    await consignerTache(supabase, "marketing", { agi: false, erreur: "création article", detail: erreurCreation?.message });
    return Response.json({ erreur: "L’article automatique n’a pas pu être créé." }, { status: 500 });
  }

  await supabase.from("marketing_campagnes").upsert({
    publication_id: publication.id, nom: publication.titre, description: sujet.facebook, canal: "facebook", nature: "organique", objectif: "notoriete", statut: "active", publication_prevue_le: new Date().toISOString(), budget_cents: 0,
  }, { onConflict: "publication_id" });

  let facebook = false;
  let erreurFacebook: string | null = null;
  try {
    const resultat = await envoyerSurFacebook({ titre: publication.titre, slug: publication.slug, chapo: publication.chapo, facebookTexte: publication.facebook_texte, facebookImageUrl: publication.facebook_image_url });
    await supabase.from("publications").update({ facebook_post_id: resultat.post_id, facebook_publie_le: new Date().toISOString(), facebook_erreur: null }).eq("id", publication.id);
    await supabase.from("marketing_campagnes").update({ statut: "terminee", meta_ad_id: resultat.post_id }).eq("publication_id", publication.id);
    facebook = true;
  } catch (erreur) {
    erreurFacebook = erreur instanceof Error ? erreur.message : "Publication Facebook refusée";
    await supabase.from("publications").update({ facebook_erreur: erreurFacebook }).eq("id", publication.id);
  }

  const bilan = { agi: true, article: publication.id, slug, facebook, erreurFacebook, budgetMensuelCents: r.budget_mensuel_cents, publiciteActive: r.publicite_active };
  await consignerTache(supabase, "marketing", bilan);
  return Response.json(bilan);
}
