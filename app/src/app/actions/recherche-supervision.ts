"use server";

import { createClient } from "@/lib/supabase/server";
import { filtreRecherche, normaliserRecherche } from "@/lib/recherche-espace";
import { familleOrganisation, LIBELLES_STATUT_ARTISAN } from "@/lib/clients-supervision";
import { libelleRole } from "@/lib/libelles";

export type ResultatRechercheSupervision = {
  id: string;
  type: "Organisation" | "Artisan" | "Compte" | "Bien" | "Lot" | "Incident";
  titre: string;
  detail: string;
  href: string;
};

export type ReponseRechercheSupervision = {
  resultats: ResultatRechercheSupervision[];
  erreur?: string;
  /** Une information sur les résultats (trop nombreux), sans être une erreur. */
  remarque?: string;
};

// X18 (fiche SA-09), décision du 14/10/2026 : un bien, un lot ou un incident se retrouve par sa référence EXACTE
// (identifiant, numéro d'incident, nom complet). La base (`rechercher_reference_supervision`) ne rend que le type d'objet
// et l'organisation, et trace la recherche au journal. Le lien ouvre la FICHE DE L'ORGANISATION, jamais la donnée :
// entrer dans l'espace client reste la traversée tracée (D08).
const TYPES_REFERENCE = { bien: "Bien", lot: "Lot", incident: "Incident" } as const;
const MAX_REFERENCES = 8;
const IDENTIFIANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LigneReference = { type_objet: string; organisation_id: string; organisation_nom: string; nombre: number; groupes: number };

function ligneReferenceValide(l: unknown): l is LigneReference {
  if (!l || typeof l !== "object") return false;
  const r = l as Record<string, unknown>;
  return typeof r.type_objet === "string" && Object.hasOwn(TYPES_REFERENCE, r.type_objet)
    && typeof r.organisation_id === "string" && IDENTIFIANT.test(r.organisation_id)
    && typeof r.organisation_nom === "string"
    && Number.isInteger(r.nombre) && (r.nombre as number) >= 1
    && Number.isInteger(r.groupes) && (r.groupes as number) >= 1;
}

/** « Un incident de cette organisation porte cette référence », « 2 lots … portent … ». */
function detailReference(type: keyof typeof TYPES_REFERENCE, nombre: number): string {
  const objet = nombre > 1 ? `${nombre} ${type}s` : `Un ${type}`;
  return `${objet} de cette organisation ${nombre > 1 ? "portent" : "porte"} cette référence · ouvrir la fiche de l’organisation`;
}

// Les statuts en français plutôt que leur code (25/09) : « essai » et
// « en_attente » s'affichaient bruts.
const STATUTS_ORGANISATION: Record<string, string> = {
  active: "Active",
  essai: "En essai",
  suspendue: "Suspendue",
  inactive: "Inactive",
  archivee: "Archivée",
};

/** « admin_agence, agent » → « Administrateur d’agence · Agent » (audit console 27/09). */
function rolesLisibles(roles: string | null): string {
  if (!roles) return "aucun rôle";
  return roles.split(/\s*,\s*/).filter(Boolean).map(libelleRole).join(", ");
}

/** Recherche transversale réservée à la supervision, sans entrer dans un client. */
export async function rechercherDansSupervision(
  saisie: string
): Promise<ReponseRechercheSupervision> {
  const supabase = await createClient();
  const { data: estSuperAdmin, error: erreurDroit } = await supabase.rpc("is_super_admin");
  if (erreurDroit || !estSuperAdmin) throw new Error("Accès réservé à la supervision.");

  const texte = normaliserRecherche(saisie);
  if (texte.length < 2) return { resultats: [] };

  const [references, organisations, artisans, comptes] = await Promise.all([
    // X18 : la recherche par référence est tracée par la base, dans la même transaction que sa lecture.
    supabase.rpc("rechercher_reference_supervision", { p_reference: texte }),
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
    // Les comptes, par adresse (25/09) : la fiche de débogage s'ouvre depuis ⌘K.
    supabase.rpc("rechercher_comptes_supervision", { p_texte: saisie.trim() }),
  ]);

  const resultats: ResultatRechercheSupervision[] = [];
  // Une référence exacte est la réponse la plus précise : elle passe en tête.
  const lignesBrutes: unknown[] = Array.isArray(references.data) ? references.data : references.data == null ? [] : [references.data];
  const lignesValides = lignesBrutes.filter(ligneReferenceValide);
  // Relecture du 15/10 : une ligne qu'on ne sait pas lire (colonne renommée d'un seul côté, type d'objet inconnu) est
  // écartée ET signalée ; sans cela, la fenêtre répondait « Aucun résultat » alors que la base avait trouvé quelque chose.
  const referencesIllisibles = lignesBrutes.length - lignesValides.length;
  if (referencesIllisibles > 0) {
    console.error(`[recherche-supervision] ${referencesIllisibles} ligne(s) de rechercher_reference_supervision écartée(s) : forme inattendue.`);
  }
  const lignesReference = lignesValides.slice(0, MAX_REFERENCES);
  for (const r of lignesReference) {
    const type = r.type_objet as keyof typeof TYPES_REFERENCE;
    resultats.push({
      id: r.organisation_id,
      type: TYPES_REFERENCE[type],
      titre: r.organisation_nom,
      detail: detailReference(type, r.nombre),
      href: `/admin/organisations/${r.organisation_id}`,
    });
  }
  const totalReferences = lignesReference[0]?.groupes ?? 0;
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

  for (const c of ((Array.isArray(comptes.data) ? comptes.data : []) as { account_id: string; email: string; roles: string | null; derniere_connexion: string | null }[])) {
    resultats.push({
      id: c.account_id,
      type: "Compte",
      titre: c.email,
      detail: [rolesLisibles(c.roles), c.derniere_connexion ? `dernière connexion ${new Date(c.derniere_connexion).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : "jamais connecté"].join(" · "),
      href: `/admin/comptes/${c.account_id}`,
    });
  }

  return {
    resultats,
    // La recherche des comptes se signale aussi quand elle échoue (audit console 27/09).
    ...(references.error || referencesIllisibles > 0 || organisations.error || artisans.error || comptes.error
      ? { erreur: "Certains résultats sont momentanément indisponibles. Réessayez." }
      : {}),
    ...(referencesIllisibles === 0 && totalReferences > lignesReference.length
      ? { remarque: `${totalReferences} résultats en tout, ${lignesReference.length} affichés : saisissez l’identifiant complet du bien, du lot ou de l’incident pour n’en garder qu’un.` }
      : {}),
  };
}
