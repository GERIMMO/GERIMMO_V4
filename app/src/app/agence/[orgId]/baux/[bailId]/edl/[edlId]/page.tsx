import Link from "next/link";
import { revalidatePath } from "next/cache";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { formaterDate } from "@/lib/ged";
import { COULEURS_ETAT_EDL } from "@/lib/baux";
import type { EtatEdl } from "@/app/actions/edl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GrilleEdl } from "./grille-edl";
import { BoutonRegenererGrille } from "./bouton-regenerer-grille";
import { EdlAnnexes, type AnnexesEntree, type Compteur, type Cle } from "./edl-annexes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { EchecLecture, PageEchecLecture } from "../../../../parc/echec-lecture";

export const metadata = { title: "État des lieux — Gerimmo" };

export default async function PageEdl(
  props: PageProps<"/agence/[orgId]/baux/[bailId]/edl/[edlId]">
) {
  const { orgId, bailId, edlId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: edl, error: erreurEdl } = await supabase
    .from("etats_des_lieux")
    .select("id, type, etat, date_edl")
    .eq("id", edlId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Lecture refusée : ce n'est pas un état des lieux supprimé.
  if (erreurEdl)
    return (
      <PageEchecLecture
        titre="État des lieux"
        quoi={["l’état des lieux"]}
        retour={{ href: `/agence/${orgId}/baux/${bailId}`, libelle: "Bail" }}
      />
    );
  if (!edl) notFound();

  // Saisie comparative (maquette v3) : sur un EDL de sortie en cours, chaque
  // ligne rappelle l'état et l'observation d'entrée — la sortie se juge par
  // rapport à eux. On prend l'entrée signée du même bail. (L'entrée signée
  // sert aussi à expliquer d'où vient la grille de sortie — RM-1.13.1.)
  // Ses compteurs et ses clés viennent dans la même lecture : la sortie les
  // affiche EN REGARD des siens (RM-1.13.1, « à la sortie, l'état d'entrée est
  // affiché en regard ») — la carte le promettait sans le faire (relevé 11/09).
  const { data: entree, error: erreurEntree } =
    edl.type === "sortie"
      ? await supabase
          .from("etats_des_lieux")
          .select(
            "id, date_edl, edl_lignes(piece, categorie, libelle, etat, commentaire), edl_compteurs(type, numero, releve), edl_cles(libelle, nombre, reference)"
          )
          .eq("bail_id", bailId)
          .eq("type", "entree")
          .eq("etat", "signe")
          .order("date_edl", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

  const [
    { data: lignes, error: erreurLignes },
    { data: compteurs, error: erreurCompteurs },
    { data: cles, error: erreurCles },
  ] = await Promise.all([
    supabase
      .from("edl_lignes")
      .select("id, categorie, piece, libelle, etat, commentaire")
      .eq("edl_id", edlId)
      .eq("organization_id", orgId)
      .order("ordre"),
    // Les lignes reprises de l'entrée naissent dans la MÊME transaction, donc
    // au même created_at : sans second critère, leur ordre d'affichage variait
    // d'un rendu à l'autre.
    supabase
      .from("edl_compteurs")
      .select("id, type, numero, releve")
      .eq("edl_id", edlId)
      .order("created_at")
      .order("type"),
    supabase
      .from("edl_cles")
      .select("id, libelle, nombre, reference")
      .eq("edl_id", edlId)
      .order("created_at")
      .order("libelle"),
  ]);

  // Repli générique : aucune ligne rattachée à une pièce — y compris la
  // grille VIDE (création dont la génération a échoué, revue 23/08 : l'écran
  // proposait alors de signer une grille sans lignes, sans issue).
  const toutesLignes = (lignes ?? []) as {
    categorie: string;
    piece: string | null;
    etat: string | null;
  }[];
  // Une grille ILLISIBLE (lecture refusée) n'est pas une grille absente : sans
  // cette garde, l'écran annonçait « sa génération n'a pas abouti » et
  // proposait de REMPLACER une grille peut-être pleine (relevé du 11/09).
  const grilleGenerique =
    !erreurLignes && !toutesLignes.some((l) => l.categorie === "piece");
  const lignesRemplies = toutesLignes.filter((l) => l.etat).length;
  const signe = edl.etat === "signe";
  // Sortie dont l'entrée est signée : la grille est la copie conforme de
  // l'entrée (RM-1.13.1) — le bandeau « grille générique » et la régénération
  // depuis les pièces du lot n'ont pas de sens ici (audit vie du bail 09/09).
  const sortieDepuisEntree = edl.type === "sortie" && Boolean(entree) && toutesLignes.length > 0;

  const { data: bail, error: erreurBailLot } = grilleGenerique
    ? await supabase
        .from("baux")
        .select("lot:lots(id, bien_id)")
        .eq("id", bailId)
        .maybeSingle()
    : { data: null, error: null };
  const lotDuBail = premier(
    (bail as { lot: UnOuPlusieurs<{ id: string; bien_id: string }> } | null)?.lot
  );
  const lotId = lotDuBail?.id ?? null;
  const bienId = lotDuBail?.bien_id ?? null;

  // Le lot a-t-il des pièces déclarées depuis la création de cet EDL ? Si oui,
  // la grille se régénère sur place (recette 22/08 : déclarer les pièces après
  // coup laissait l'EDL sur la grille générique, sans issue depuis cet écran).
  let lotAPieces = false;
  if (grilleGenerique && !signe && lotId) {
    const { count } = await supabase
      .from("lot_pieces")
      .select("*", { count: "exact", head: true })
      .eq("lot_id", lotId)
      .eq("organization_id", orgId);
    lotAPieces = (count ?? 0) > 0;
  }

  // Ce que la base n'a pas rendu : une grille vide parce qu'illisible ne doit
  // pas se lire comme une grille jamais générée.
  const echecs: string[] = [];
  const noter = (libelle: string, erreur: unknown) => {
    if (erreur) echecs.push(libelle);
  };
  noter("la grille pièce par pièce", erreurLignes);
  noter("les relevés de compteurs", erreurCompteurs);
  noter("les clés remises", erreurCles);
  noter("l’état des lieux d’entrée de référence", erreurEntree);
  noter("le lot rattaché au bail", erreurBailLot);

  // Les annexes se renseignent en UN envoi. La structure arrive déjà remplie
  // (generer_grille_edl recopie les compteurs et les clés de l'entrée signée
  // depuis la migration 20260911141500) ; ne restent que les chiffres relevés
  // sur place, et les envoyer un par un coûtait huit allers-retours sur un
  // logement ordinaire (relevé de parcours du 11/09).
  // Fonction serveur en ligne, au plus près de l'écran qu'elle sert : elle ne
  // fait que router le formulaire vers `enregistrer_annexes_edl`, qui porte
  // seule la règle (accès, EDL figé, périmètre des colonnes écrites).
  async function enregistrerAnnexes(_etat: EtatEdl, formData: FormData): Promise<EtatEdl> {
    "use server";
    const { supabase: db, user } = await verifierGerant(orgId);
    if (!user) return { erreur: "Accès refusé." };

    // Le client dit QUELLE valeur, jamais QUELLES lignes : les identifiants
    // sont relus côté serveur, comme dans majGrilleEdl.
    const [{ data: lignesC }, { data: lignesK }] = await Promise.all([
      db.from("edl_compteurs").select("id").eq("edl_id", edlId).eq("organization_id", orgId),
      db.from("edl_cles").select("id").eq("edl_id", edlId).eq("organization_id", orgId),
    ]);

    // Une ligne absente du formulaire envoyé n'est pas une ligne vidée : elle
    // n'était pas à l'écran (ajout concurrent, page périmée). On n'y touche pas
    // — sinon un relevé déjà saisi serait effacé par une soumission qui ne le
    // connaissait pas.
    const p_compteurs: { id: string; releve: number | null }[] = [];
    for (const l of lignesC ?? []) {
      if (!formData.has(`releve_${l.id}`)) continue;
      const brut = String(formData.get(`releve_${l.id}`) ?? "").trim();
      if (brut === "") {
        p_compteurs.push({ id: l.id, releve: null });
        continue;
      }
      const valeur = Number(brut);
      if (!Number.isFinite(valeur)) return { erreur: "Relevé de compteur invalide." };
      p_compteurs.push({ id: l.id, releve: valeur });
    }

    // Un champ vidé par mégarde ne doit pas écrire « aucune clé rendue » : sans
    // valeur, la ligne n'est pas touchée. Le retrait de la ligne reste le geste
    // pour dire qu'une clé n'existe plus.
    const p_cles: { id: string; nombre: number }[] = [];
    for (const l of lignesK ?? []) {
      const brut = String(formData.get(`nombre_${l.id}`) ?? "").trim();
      if (brut === "") continue;
      const valeur = Number(brut);
      if (!Number.isFinite(valeur) || valeur < 0) return { erreur: "Nombre de clés invalide." };
      p_cles.push({ id: l.id, nombre: Math.floor(valeur) });
    }

    const { error } = await db.rpc("enregistrer_annexes_edl", {
      p_edl: edlId,
      p_compteurs,
      p_cles,
    });
    if (error) return { erreur: sansJargon(error.message) };
    revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
    return { succes: "Relevés enregistrés." };
  }

  // Un EDL de sortie SIGNÉ ouvre la restitution du dépôt : la modale de
  // signature l'annonce (« ils alimenteront le décompte de restitution ») sans
  // l'avoir jamais offerte — l'agent repassait par « ← Bail » puis défilait
  // jusqu'à la carte (relevé du 11/09).
  // Aucune lecture de l'état du bail n'est nécessaire : un EDL de sortie ne se
  // crée QUE pendant le préavis (actions/edl.ts) et la carte restitution vit
  // sur préavis comme sur terminé. Seul un congé annulé ramène le bail à
  // « actif » : le lien retombe alors en haut de la fiche du bail, ce qui est
  // exactement l'endroit où l'on constate que la sortie n'a plus lieu.
  const suiteRestitution = edl.type === "sortie" && signe;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <Link
          href={`/agence/${orgId}/baux/${bailId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Bail
        </Link>
        <p className="eyebrow mt-1">
          {edl.type === "entree" ? "Entrée" : "Sortie"}
          {edl.date_edl ? ` · ${formaterDate(edl.date_edl)}` : ""}
        </p>
        <div className="entete-page">
          <h1>
            État des lieux d&apos;{edl.type === "entree" ? "entrée" : "sortie"}
          </h1>
          <span className="flex items-center gap-3">
            <span className={COULEURS_ETAT_EDL[edl.etat] ?? "puce puce-grise"}>
              {signe ? "Signé — figé" : "En cours de saisie"}
            </span>
            {/* Documents-0 : le PDF (14/15) depuis la grille réelle */}
            <BoutonGenererDocument
              orgId={orgId}
              code="edl"
              cibleId={edlId}
              cheminRetour={`/agence/${orgId}/baux/${bailId}/edl/${edlId}`}
              libelle="Générer le PDF"
            />
          </span>
        </div>
        {suiteRestitution && (
          <Link
            href={`/agence/${orgId}/baux/${bailId}#restitution`}
            className="mt-2 inline-block text-sm underline underline-offset-2"
          >
            Démarrer la restitution du dépôt de garantie →
          </Link>
        )}
      </div>

      <EchecLecture quoi={echecs} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pièce par pièce</CardTitle>
          <CardDescription>
            Une ligne par élément et équipement du lot. Aucune ligne ne peut rester
            sans état pour signer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* La grille retombe sur « Général » quand le lot n'a pas de pièces
              déclarées. Rien ne le signalait : l'agent signait un document qui
              ne distingue pas la cuisine de la chambre, et découvrait le
              problème à la sortie, au moment de justifier une retenue. */}
          {sortieDepuisEntree && (
            <p className="mb-4 text-sm text-muted-foreground">
              La grille de sortie reprend exactement celle de l&apos;état des lieux
              d&apos;entrée signé — élément par élément (RM-1.13.1).
            </p>
          )}
          {grilleGenerique && !sortieDepuisEntree && (
            <div className="mb-4 border-l-[3px] border-l-warning bg-warning-soft p-3 text-sm">
              <p className="font-medium">
                {toutesLignes.length === 0
                  ? "Cet état des lieux n'a pas de grille."
                  : "Cet état des lieux ne détaille aucune pièce."}
              </p>
              <p className="mt-1 text-muted-foreground">
                {toutesLignes.length === 0
                  ? "Sa génération n'a pas abouti — régénérez-la avant toute saisie."
                  : lotAPieces
                    ? "La grille a été générée avant la déclaration des pièces du lot : elle se limite aux éléments généraux. Régénérez-la pour détailler chaque pièce — sinon, à la sortie, il sera difficile de rattacher une dégradation à un endroit précis."
                    : "Le lot n'a pas de pièces déclarées : la grille se limite aux éléments généraux. À la sortie, il sera difficile de rattacher une dégradation à un endroit précis — et donc de justifier une retenue sur le dépôt de garantie."}
              </p>
              {/* Revue 23/08 : régénérer remplace la grille — le dire quand
                  des états ont déjà été saisis, plutôt que les perdre muet. */}
              {!signe && lignesRemplies > 0 && (
                <p className="mt-1 font-medium text-warning-soft-foreground">
                  Attention : régénérer remplace la grille — les {lignesRemplies} état
                  {lignesRemplies > 1 ? "s" : ""} déjà saisi{lignesRemplies > 1 ? "s" : ""} seront
                  perdus.
                </p>
              )}
              {!signe && (lotAPieces || toutesLignes.length === 0) && (
                <BoutonRegenererGrille
                  orgId={orgId}
                  bailId={bailId}
                  edlId={edlId}
                  libelle={lotAPieces ? "Régénérer la grille depuis les pièces du lot" : "Générer la grille"}
                />
              )}
              {!signe && !lotAPieces && lotId && (
                <Link
                  href={`/agence/${orgId}/parc/${bienId}/lots/${lotId}#pieces`}
                  className="mt-2 inline-block underline underline-offset-2"
                >
                  Déclarer les pièces du lot, puis revenir régénérer la grille ici
                </Link>
              )}
            </div>
          )}
          <GrilleEdl
            orgId={orgId}
            bailId={bailId}
            edlId={edlId}
            signe={signe}
            lignes={lignes ?? []}
            reference={
              !signe && entree
                ? {
                    date: entree.date_edl,
                    lignes: (entree.edl_lignes ?? []) as {
                      piece: string | null;
                      categorie: string;
                      libelle: string;
                      etat: string | null;
                      commentaire: string | null;
                    }[],
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compteurs & clés</CardTitle>
          <CardDescription>
            {edl.type === "sortie"
              ? "Les compteurs et les clés de l’entrée sont repris ici : relevez l’index de sortie et comptez ce qui est rendu — l’entrée s’affiche en regard."
              : "Relevés de compteurs et clés/badges remis — repris à l’état des lieux de sortie pour comparaison."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EdlAnnexes
            orgId={orgId}
            bailId={bailId}
            edlId={edlId}
            signe={signe}
            compteurs={(compteurs ?? []) as Compteur[]}
            cles={(cles ?? []) as Cle[]}
            entree={
              entree
                ? ({
                    compteurs: (entree.edl_compteurs ?? []) as AnnexesEntree["compteurs"],
                    cles: (entree.edl_cles ?? []) as AnnexesEntree["cles"],
                  } satisfies AnnexesEntree)
                : null
            }
            enregistrer={enregistrerAnnexes}
          />
        </CardContent>
      </Card>
    </main>
  );
}
