import { lireEntitesPatrimoine } from "@/lib/entites-patrimoine";
import { estUuid } from "@/lib/identifiants";
import { lireAnneeExercice } from "@/lib/annee-exercice";
import { verifierAccesEspace } from "@/lib/espace";
import { aujourdhuiParis } from "@/lib/ged";
import { lireToutesLesPages } from "@/lib/lecture-complete";
import { lireCadreFiscal } from "@/lib/lecture-profils-fiscaux";
import { csvPreparationFiscale } from "@/lib/profil-fiscal";

const entetes = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) return new Response("Accès refusé.", { status: 403, headers: entetes });
  const annee = lireAnneeExercice(new URL(req.url).searchParams.get("annee"));
  const courante = Number(aujourdhuiParis().slice(0, 4));
  if (annee === null || annee < 1970 || annee > courante + 1) return new Response("Année invalide.", { status: 400, headers: entetes });
  const bien = new URL(req.url).searchParams.get("bien");
  if (bien && !estUuid(bien)) return new Response("Bien invalide.", {status:400,headers:entetes});
  let perimetre: Set<string> | undefined;
  if (bien) {
    const b = await supabase.from("biens").select("id").eq("organization_id",orgId).eq("id",bien).maybeSingle();
    if(b.error)return new Response("Le bien n’a pas pu être vérifié.",{status:503,headers:entetes});
    if(!b.data)return new Response("Bien inaccessible.",{status:404,headers:entetes});
    const lots=await lireToutesLesPages<{id:string}>((debut,fin)=>supabase.from("lots").select("id",{count:"exact"}).eq("organization_id",orgId).eq("bien_id",bien).order("id").range(debut,fin),l=>l.id);
    if(lots.echec)return new Response("Les logements n’ont pas pu être vérifiés.",{status:503,headers:entetes});
    perimetre=new Set(lots.lignes.map(l=>l.id));
  }
  const entite=new URL(req.url).searchParams.get("entite");
  if(entite){if(!estUuid(entite))return new Response("Propriétaire invalide.",{status:400,headers:entetes});const patrimoine=await lireEntitesPatrimoine(supabase,orgId,annee);const e=patrimoine.entites.find(e=>e.id===entite);if(patrimoine.erreur||!e)return new Response("Propriétaire inaccessible.",{status:404,headers:entetes});perimetre=new Set(e.lots.filter(id=>!perimetre||perimetre.has(id)));}
  const cadre = await lireCadreFiscal(supabase, orgId, annee, perimetre);
  if (cadre.erreur) return new Response(cadre.erreur, { status: 503, headers: entetes });
  type Ecriture = Parameters<typeof csvPreparationFiscale>[3][number];
  const lecture = await lireToutesLesPages<Ecriture>((debut, fin) => supabase.from("ecritures")
    .select("id,date_piece,lot_id,categorie,sens,montant,libelle,contre_ecriture_de", { count: "exact" })
    .eq("organization_id", orgId).gte("date_piece", `${annee}-01-01`).lte("date_piece", `${annee}-12-31`)
    .order("date_piece").order("id").range(debut, fin), e => e.id);
  if (lecture.echec) return new Response("Le journal complet n’a pas pu être lu. Aucun fichier partiel n’est produit ; réessayez.", { status: 503, headers: entetes });
  return new Response(csvPreparationFiscale(annee, cadre.detenteurs, cadre.profils, lecture.lignes.filter(e=>!perimetre||!!e.lot_id&&perimetre.has(e.lot_id))), { headers: {
    ...entetes, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="preparation-fiscale-${annee}.csv"`,
  } });
}
