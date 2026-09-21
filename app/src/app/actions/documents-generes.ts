"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { rendrePdf, copieDeTravail } from "@/lib/documents/rendu";
import { MODELES, type CodeModele, type Modele } from "@/lib/documents/modeles";
import { refusDocumentIncomplet } from "@/lib/documents/completude";

export type EtatGeneration = {
  erreur?: string;
  succes?: string;
  documentId?: string;
  // La liste honnête de ce qui est resté en libellé dans le PDF
  manquants?: string[];
  // Les rattachements du document — le résolveur « où renseigner » s'en sert
  liens?: { entite: "bail" | "personne" | "lot" | "mandat"; entiteId: string }[];
};

// Générer un document PDF (sprint « Documents-0 ») : assembler le HTML depuis
// la base, contrôler que chaque champ obligatoire est alimenté, puis seulement
// rendre le PDF et le ranger en GED. Un document incomplet ne doit jamais
// devenir une pièce partageable ou signable.
// `options` : les choix du geste qui ne sont pas des données de fiche —
// le motif d'un congé, l'objet d'un avenant, le garant d'un cautionnement.
export async function genererDocument(
  orgId: string,
  code: CodeModele,
  cibleId: string,
  cheminRetour: string,
  options?: Record<string, string>
): Promise<EtatGeneration> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  // Typé Modele : un assembleur peut déclarer moins de paramètres (les
  // options sont facultatives), l'appel à 4 arguments reste valide
  if (!Object.hasOwn(MODELES, code)) return { erreur: "Modèle de document inconnu." };
  if (["cloture_mensuelle", "recap_fiscal_agence", "rapport_gestion", "bordereau_versement", "facture_honoraires"].includes(code) && role !== "admin_agence" && role !== "proprietaire_direct") return { erreur: "Ce document global est réservé au responsable de l’organisation." };
  const modele: Modele = MODELES[code];
  if (!modele) return { erreur: "Modèle de document inconnu." };

  try {
    const assemblage = await modele.assembler(supabase, orgId, cibleId, options);
    if ("erreur" in assemblage) return { erreur: assemblage.erreur };

    const refus = refusDocumentIncomplet(assemblage.document);
    if (refus) {
      return {
        ...refus,
        liens: assemblage.liens,
      };
    }

    const octets = await rendrePdf(assemblage.document);
    copieDeTravail(`${code}-${cibleId.slice(0, 8)}.pdf`, octets);

    const fichier = new File([octets as BlobPart], `${assemblage.nomFichier}.pdf`, {
      type: "application/pdf",
    });
    const depot = await deposerFichierGed(
      supabase,
      user,
      orgId,
      fichier,
      modele.typeGed,
      assemblage.titreGed
    );
    if (depot.erreur || !depot.documentId) {
      return { erreur: depot.erreur ?? "Échec du rangement en GED." };
    }

    // Rattachements : le dépôt GED lie déjà à l'organisation ; on ajoute les
    // objets métier (bail, personne, lot) pour la navigation documentaire.
    if (assemblage.liens.length > 0) {
      const { error: erreurLiens } = await supabase.from("document_liens").insert(
        assemblage.liens.map((l) => ({
          document_id: depot.documentId,
          organization_id: orgId,
          entite: l.entite,
          entite_id: l.entiteId,
        }))
      );
      if (erreurLiens) {
        revalidatePath(`/agence/${orgId}/documents`);
        return { documentId: depot.documentId, erreur: "Le PDF a été enregistré dans Documents, mais son rattachement au dossier a échoué. Ouvrez le document pour corriger ses liens avant de le partager." };
      }
    }

    revalidatePath(cheminRetour.startsWith(`/agence/${orgId}/`) ? cheminRetour : `/agence/${orgId}/documents`);
    revalidatePath(`/agence/${orgId}/documents`);
    return {
      documentId: depot.documentId,
      manquants: [],
      liens: assemblage.liens,
      succes: `${assemblage.titreGed} généré — tous les champs sont renseignés et le PDF est rangé dans Documents.`,
    };
  } catch (e) {
    // Les refus métier sont retournés avant ce catch ; ce qui l'atteint est
    // technique (moteur PDF, stockage, réseau). Audit 09/09 : l'écran ne doit
    // jamais montrer un chemin serveur ni un message de dépendance — on
    // journalise tout sous une référence et on parle métier.
    const ref = `DOC-${Date.now().toString(36).toUpperCase()}`;
    console.error(`[documents] génération ${code} en échec (${ref})`, e);
    return {
      erreur: `La génération du document a échoué (réf. ${ref}). Réessayez dans un instant ; si cela persiste, transmettez la référence au support.`,
    };
  }
}
