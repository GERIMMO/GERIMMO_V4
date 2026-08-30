"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { rendrePdf, copieDeTravail } from "@/lib/documents/rendu";
import { MODELES, type CodeModele } from "@/lib/documents/modeles";

export type EtatGeneration = {
  erreur?: string;
  succes?: string;
  documentId?: string;
  // La liste honnête de ce qui est resté en libellé dans le PDF
  manquants?: string[];
};

// Générer un document PDF (sprint « Documents-0 ») : assembler le HTML depuis
// la base, le rendre en PDF, le ranger en GED (empreinte, liens) — il devient
// visible dans l'onglet Documents. Une donnée absente ne bloque jamais : elle
// reste en libellé dans le PDF et remonte dans `manquants`.
export async function genererDocument(
  orgId: string,
  code: CodeModele,
  cibleId: string,
  cheminRetour: string
): Promise<EtatGeneration> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const modele = MODELES[code];
  if (!modele) return { erreur: "Modèle de document inconnu." };

  try {
    const assemblage = await modele.assembler(supabase, orgId, cibleId);
    if ("erreur" in assemblage) return { erreur: assemblage.erreur };

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
      await supabase.from("document_liens").insert(
        assemblage.liens.map((l) => ({
          document_id: depot.documentId,
          organization_id: orgId,
          entite: l.entite,
          entite_id: l.entiteId,
        }))
      );
    }

    revalidatePath(cheminRetour);
    revalidatePath(`/agence/${orgId}/documents`);
    const manquants = assemblage.document.manquants;
    return {
      documentId: depot.documentId,
      manquants,
      succes:
        manquants.length === 0
          ? `${assemblage.titreGed} généré — rangé dans Documents.`
          : `${assemblage.titreGed} généré (${manquants.length} champ${manquants.length > 1 ? "s" : ""} resté${manquants.length > 1 ? "s" : ""} en libellé) — rangé dans Documents.`,
    };
  } catch (e) {
    return { erreur: sansJargon(e instanceof Error ? e.message : "Génération impossible.") };
  }
}
