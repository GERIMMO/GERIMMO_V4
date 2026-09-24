import { clientDeService } from "@/lib/supabase/service";
import { consignerTache, porteurDuSecret } from "@/lib/tache";
import { sujetMarketing } from "@/lib/contenu-marketing";

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
  if (!r.actif || rang < 0) {
    const bilan = { agi: false, raison: !r.actif ? "agent en pause" : "jour sans préparation", date: paris.date };
    await consignerTache(supabase, "marketing", bilan);
    return Response.json(bilan);
  }

  const sujet = sujetMarketing(paris.objet, rang);
  const slug = `${paris.date}-${sujet.cle}`;
  const periode = `marketing-auto-${paris.date}`;
  const { data: existante, error: erreurExistante } = await supabase.from("publications").select("id,slug,facebook_post_id").eq("slug", slug).maybeSingle();
  if (erreurExistante) return Response.json({ erreur: "Les propositions existantes ne peuvent pas être vérifiées." }, { status: 503 });
  if (existante) {
    const bilan = { agi: false, raison: "publication déjà traitée", publication_id: existante.id, facebook: Boolean(existante.facebook_post_id) };
    await consignerTache(supabase, "marketing", bilan);
    return Response.json(bilan);
  }

  const { data: publication, error: erreurCreation } = await supabase.from("publications").insert({
    periode, statut: "brouillon", titre: sujet.titre, slug, chapo: sujet.chapo, corps: sujet.corps,
    sources: [`audience:${sujet.audience}`, "contenu-editorial-gerimmo"], seo_description: sujet.chapo.slice(0, 160),
    facebook_texte: sujet.facebook, facebook_image_url: "https://www.gerimmo.app/marketing/facebook-premier-post.jpg", publie_le: null,
  }).select("id,titre,slug,chapo,facebook_texte,facebook_image_url").single();
  if (erreurCreation || !publication) {
    await consignerTache(supabase, "marketing", { agi: false, erreur: "création article", detail: erreurCreation?.message });
    return Response.json({ erreur: "L’article automatique n’a pas pu être créé." }, { status: 500 });
  }

  const { error: erreurCampagne } = await supabase.from("marketing_campagnes").upsert({
    publication_id: publication.id, nom: publication.titre, description: sujet.facebook,
    canal: "facebook", nature: "organique", objectif: "notoriete", statut: "idee",
    publication_prevue_le: null, budget_cents: 0,
  }, { onConflict: "publication_id" });

  // Une proposition n'autorise ni la parution dans le journal, ni Facebook,
  // ni une dépense. Chaque diffusion passe par le bouton de supervision.
  const bilan = {
    agi: true, preparees: 1, article: publication.id, slug, facebook: false,
    accord_requis: true,
    erreur: erreurCampagne ? "Le brouillon est conservé, mais sa fiche de campagne demande une vérification." : null,
  };
  await consignerTache(supabase, "marketing", bilan);
  return Response.json(bilan, {status: erreurCampagne ? 503 : 200});
}
