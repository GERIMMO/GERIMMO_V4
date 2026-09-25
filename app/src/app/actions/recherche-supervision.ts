"use server";

import { createClient } from "@/lib/supabase/server";
import { filtreRecherche, normaliserRecherche } from "@/lib/recherche-espace";
import { familleOrganisation, LIBELLES_STATUT_ARTISAN } from "@/lib/clients-supervision";

export type ResultatRechercheSupervision = {
  id: string;
  type: "Organisation" | "Artisan";
  titre: string;
  detail: string;
  href: string;
};

export type ReponseRechercheSupervision = {
  resultats: ResultatRechercheSupervision[];
  erreur?: string;
};

// Les statuts en français plutôt que leur code (25/09) : « essai » et
// « en_attente » s'affichaient bruts.
const STATUTS_ORGANISATION: Record<string, string> = {
  active: "Active",
  essai: "En essai",
  suspendue: "Suspendue",
  inactive: "Inactive",
};

/** Recherche transversale réservée à la supervision, sans entrer dans un client. */
export async function rechercherDansSupervision(
  saisie: string
): Promise<ReponseRechercheSupervision> {
  const supabase = await createClient();
  const { data: estSuperAdmin, error: erreurDroit } = await supabase.rpc("is_super_admin");
  if (erreurDroit || !estSuperAdmin) throw new Error("Accès réservé à la supervision.");

  const texte = normaliserRecherche(saisie);
  if (texte.length < 2) return { resultats: [] };

  const [organisations, artisans] = await Promise.all([
    supabase
      .from("organizations")
      .select("id,name,type,status,city,email_contact,siret")
      .or(filtreRecherche(["name", "city", "email_contact", "siret"], texte))
      .order("name")
      .limit(8),
    supabase
      .from("artisans")
      .select("id,raison_sociale,statut_plateforme,email,siret")
      .or(filtreRecherche(["raison_sociale", "email", "siret"], texte))
      .order("raison_sociale")
      .limit(8),
  ]);

  const resultats: ResultatRechercheSupervision[] = [];
  for (const o of organisations.data ?? []) {
    resultats.push({
      id: o.id,
      type: "Organisation",
      titre: o.name,
      // Le même classement que la page Clients (25/09) : une organisation sans
      // `type` est une agence, pas un propriétaire direct.
      detail: [familleOrganisation(o.type) === "agence" ? "Agence" : "Propriétaire bailleur", o.city, o.email_contact, STATUTS_ORGANISATION[o.status] ?? null]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/organisations/${o.id}`,
    });
  }
  for (const a of artisans.data ?? []) {
    resultats.push({
      id: a.id,
      type: "Artisan",
      titre: a.raison_sociale,
      detail: [a.email, a.siret ? `SIRET ${a.siret}` : null, LIBELLES_STATUT_ARTISAN[a.statut_plateforme] ?? null]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/clients/artisans/${a.id}`,
    });
  }

  return {
    resultats,
    ...(organisations.error || artisans.error
      ? { erreur: "Certains clients sont momentanément indisponibles. Réessayez." }
      : {}),
  };
}
