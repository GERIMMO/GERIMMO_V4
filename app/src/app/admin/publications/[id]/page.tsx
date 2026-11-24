import { LectureIndisponible } from "../../lecture-indisponible";
import { formaterDateParis } from "@/lib/heure-paris";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditeurPublication } from "./editeur-publication";
import { sansJargon } from "@/lib/erreurs";
import { libellePeriode } from "@/lib/periode-publication";
import { santeFacebook } from "@/lib/marketing-meta";

// Un article existant se MODIFIE (audit 25/09, C18) ; « Écrire » est la page « nouvelle ».
export const metadata = { title: "Modifier l’article" };

const ETATS: Record<string, string> = {
  proposition: "Proposition",
  brouillon: "Brouillon",
  programmee: "Programmé",
  reportee: "Reporté",
  refusee: "Écarté",
  archivee: "Retiré du journal",
};

export default async function PagePublication({ params }: PageProps<"/admin/publications/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, corps, seo_description, statut, sources, periode, veine, publie_le, facebook_texte, facebook_image_url, facebook_post_id, facebook_publie_le, facebook_erreur, facebook_envoi_demarre_le")
    .eq("id", id)
    .maybeSingle();

  if (error) return <main className="p-4 sm:p-7"><LectureIndisponible sujet="Article" retour={`/admin/publications/${id}`} /></main>;
  if (!p) notFound();
  // Défaut d'écran E198 : l'éditeur affirmait une « Page Facebook connectée » et proposait « Publier sur Facebook »
  // alors que « Marketing et contenus » disait la Page « À relier ». Il lit la connexion de la même façon que cet écran
  // (admin/marketing/page.tsx).
  const facebook = await santeFacebook();
  const etatFacebook = facebook.configure && !facebook.erreur ? "relie" : facebook.configure ? "a_verifier" : "a_relier";
  // L'en-tête dit l'écran et l'état de l'article (24/09) : il répétait le
  // titre, premier champ éditable 60 px plus bas, sans suivre sa saisie, et
  // en 20 px au lieu du h1 commun.
  const periode = libellePeriode(p.periode);
  const etat =
    p.statut === "publiee"
      ? `Paru${p.publie_le ? ` le ${formaterDateParis(p.publie_le)}` : ""}`
      : ETATS[p.statut] ?? "Brouillon";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <Link href="/admin/publications" className="lien-retour">← Articles du site</Link>
      <div className="entete-page">
        <div className="min-w-0">
          <TitreEcran rubrique="journal">Modifier l’article</TitreEcran>
          <p className="mt-2 break-words text-muted-foreground">{p.titre}</p>
        </div>
        <span className="puce puce-grise">
          {etat}
          {periode ? ` · ${periode}` : ""}
        </span>
      </div>
      {p.facebook_erreur && <p role="alert" className="err mb-5">{sansJargon(p.facebook_erreur)}</p>}
      <EditeurPublication
        id={p.id}
        titre={p.titre}
        slug={p.slug}
        chapo={p.chapo}
        corps={p.corps}
        seoDescription={p.seo_description}
        statut={p.statut}
        sources={p.sources ?? []}
        facebookTexte={p.facebook_texte}
        facebookImageUrl={p.facebook_image_url}
        tentativeFacebook={p.facebook_envoi_demarre_le}
        facebookPostId={p.facebook_post_id}
        facebookPublieLe={p.facebook_publie_le}
        facebookErreur={p.facebook_erreur ? sansJargon(p.facebook_erreur) : null}
        facebook={etatFacebook}
      />
    </main>
  );
}
