"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatEdl = {
  compteur?: { id: string; type: string; numero: string | null; releve: number | null };
  cle?: { id: string; libelle: string; nombre: number; reference: string | null };
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Créer un EDL (entrée ou sortie) pour un bail, puis générer sa grille.
export async function creerEdl(
  orgId: string,
  bailId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const type = String(formData.get("type") ?? "entree");
  // Un EDL de sortie se prépare pendant le préavis (audit vie du bail 09/09) :
  // avant, il figeait un bail encore actif.
  if (type === "sortie") {
    const { data: bail } = await supabase
      .from("baux")
      .select("etat")
      .eq("id", bailId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (bail?.etat !== "preavis") {
      return {
        erreur:
          "Un état des lieux de sortie se prépare pendant le préavis — enregistrez d'abord le congé.",
      };
    }
  }
  const { data, error } = await supabase
    .from("etats_des_lieux")
    .insert({ organization_id: orgId, bail_id: bailId, type })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}` };

  const { error: erreurGrille } = await supabase.rpc("generer_grille_edl", { p_edl: data.id });
  if (erreurGrille) return { erreur: erreurGrille.message };

  redirect(`/agence/${orgId}/baux/${bailId}/edl/${data.id}`);
}

// Régénérer la grille d'un EDL non signé depuis les pièces du lot (recette
// 22/08, scénario 4.5.3 : l'EDL créé avant la déclaration des pièces restait
// sur la grille générique — la RPC savait régénérer, aucun écran ne l'appelait).
export async function regenererGrilleEdl(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  _formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: nombre, error } = await supabase.rpc("generer_grille_edl", { p_edl: edlId });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: `Grille régénérée depuis les pièces du lot (${nombre} lignes).` };
}

// Enregistrer toute la grille (état + commentaire par ligne) tant que non
// signé. Si le formulaire porte `signer`, la signature suit l'enregistrement
// dans la même action (recette 21/08 : il fallait cliquer « Enregistrer »
// puis « Signer » — sinon la signature lisait la base non modifiée et
// refusait, sans que rien ne le dise).
export async function majGrilleEdl(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: lignes, error: erreurLecture } = await supabase
    .from("edl_lignes")
    .select("id")
    .eq("edl_id", edlId)
    .eq("organization_id", orgId);

  // Une lecture manquée ne doit pas être transformée en sauvegarde vide,
  // ni laisser une signature porter sur l'ancienne grille enregistrée.
  if (erreurLecture)
    return { erreur: "Impossible de lire la grille. Votre saisie n’a pas été enregistrée ; réessayez." };
  if (!lignes?.length)
    return { erreur: "Grille vide ou inaccessible : générez-la avant de l’enregistrer." };
  if (lignes.some((l) => !formData.has(`etat_${l.id}`)))
    return { erreur: "La grille a changé depuis l’ouverture. Rechargez la page pour retrouver toutes les lignes avant de l’enregistrer." };

  const p_lignes = lignes.map((l) => {
    const etat = String(formData.get(`etat_${l.id}`) ?? "");
    const commentaire = String(formData.get(`commentaire_${l.id}`) ?? "").trim();
    return { id: l.id, etat: etat || null, commentaire: commentaire || null };
  });
  const signer = Boolean(formData.get("signer"));

  const { error } = await supabase.rpc("enregistrer_grille_edl", {
    p_edl: edlId,
    p_lignes,
    p_signer: signer,
  });
  if (error) return { erreur: sansJargon(error.message) };

  if (signer) {
    revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
    revalidatePath(`/agence/${orgId}/baux/${bailId}`);
    return { succes: "État des lieux signé — il est figé." };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Grille enregistrée." };
}

// Relevés et clés partent ensemble. Une lecture indisponible ne doit jamais
// transformer une partie de la saisie en tableau vide annoncé enregistré.
export async function enregistrerAnnexesEdl(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const [compteurs, cles] = await Promise.all([
    supabase.from("edl_compteurs").select("id").eq("edl_id", edlId).eq("organization_id", orgId),
    supabase.from("edl_cles").select("id").eq("edl_id", edlId).eq("organization_id", orgId),
  ]);
  if (compteurs.error || cles.error) return {
    erreur: "Impossible de lire les relevés et les clés. Votre saisie n’a pas été enregistrée ; réessayez.",
    valeurs,
  };

  // Une ligne absente de ce formulaire a pu être ajoutée depuis son ouverture.
  // On ne la touche pas. Un relevé présent mais vidé conserve le sens NULL.
  const p_compteurs: { id: string; releve: number | null }[] = [];
  for (const l of compteurs.data ?? []) {
    if (!formData.has(`releve_${l.id}`)) continue;
    const brut = String(formData.get(`releve_${l.id}`) ?? "").trim();
    if (brut === "") {
      p_compteurs.push({ id: l.id, releve: null });
      continue;
    }
    const valeur = Number(brut);
    if (!Number.isFinite(valeur)) return { erreur: "Relevé de compteur invalide.", valeurs };
    p_compteurs.push({ id: l.id, releve: valeur });
  }

  // Une clé laissée sans nombre ne signifie pas zéro clé rendue : la ligne
  // reste inchangée. Son retrait demeure un geste distinct.
  const p_cles: { id: string; nombre: number }[] = [];
  for (const l of cles.data ?? []) {
    const brut = String(formData.get(`nombre_${l.id}`) ?? "").trim();
    if (brut === "") continue;
    const valeur = Number(brut);
    if (!Number.isFinite(valeur) || valeur < 0) return { erreur: "Nombre de clés invalide.", valeurs };
    p_cles.push({ id: l.id, nombre: Math.floor(valeur) });
  }

  const { error } = await supabase.rpc("enregistrer_annexes_edl", { p_edl: edlId, p_compteurs, p_cles });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Relevés enregistrés." };
}

// Un EDL signé est figé : compteurs et clés compris (revue 23/08 — seules les
// lignes étaient verrouillées ; un onglet resté ouvert pouvait encore écrire).
// Le trigger en base est la vraie garde, ceci donne un message propre.
async function edlEstSigne(
  supabase: Awaited<ReturnType<typeof verifierGerant>>["supabase"],
  orgId: string,
  edlId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("etats_des_lieux")
    .select("etat")
    .eq("id", edlId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data?.etat === "signe";
}
const MSG_EDL_FIGE = "Cet état des lieux est signé — il est figé, compteurs et clés compris.";

// Relevés de compteurs de l'EDL (eau, gaz, électricité).
export async function ajouterCompteur(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  if (await edlEstSigne(supabase, orgId, edlId)) return { erreur: MSG_EDL_FIGE };
  const valeurs = valeursDuFormulaire(formData);
  const type = String(formData.get("type") ?? "").trim();
  if (!type) return { erreur: "Choisissez le type de compteur.", valeurs };
  const numero = String(formData.get("numero") ?? "").trim() || null;
  const releveStr = String(formData.get("releve") ?? "").trim();
  const compteur = { id: crypto.randomUUID(), type, numero, releve: releveStr ? Number(releveStr) : null };
  const { error } = await supabase.from("edl_compteurs").insert({
    ...compteur, edl_id: edlId, organization_id: orgId,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Relevé de compteur ajouté.", compteur };
}

export async function supprimerCompteur(
  orgId: string,
  bailId: string,
  edlId: string,
  compteurId: string
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  if (await edlEstSigne(supabase, orgId, edlId)) return { erreur: MSG_EDL_FIGE };
  const { error } = await supabase
    .from("edl_compteurs")
    .delete()
    .eq("id", compteurId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Relevé retiré." };
}

// Clés / badges remis (et restitution en sortie).
export async function ajouterCle(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  if (await edlEstSigne(supabase, orgId, edlId)) return { erreur: MSG_EDL_FIGE };
  const valeurs = valeursDuFormulaire(formData);
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (!libelle) return { erreur: "Précisez le type de clé.", valeurs };
  const nombre = Math.max(0, Math.floor(Number(formData.get("nombre") ?? 1)) || 0);
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const cle = { id: crypto.randomUUID(), libelle, nombre, reference };
  const { error } = await supabase.from("edl_cles").insert({
    ...cle, edl_id: edlId, organization_id: orgId,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Clé ajoutée.", cle };
}

export async function supprimerCle(
  orgId: string,
  bailId: string,
  edlId: string,
  cleId: string
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  if (await edlEstSigne(supabase, orgId, edlId)) return { erreur: MSG_EDL_FIGE };
  const { error } = await supabase
    .from("edl_cles")
    .delete()
    .eq("id", cleId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Clé retirée." };
}
