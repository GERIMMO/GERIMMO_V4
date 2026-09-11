import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";
import { titreIncident } from "@/lib/incidents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EchecLecture } from "../documents/echec-lecture";
import {
  BoutonLeverBlacklist,
  BoutonStatutLocal,
  FormulaireBlacklistLocale,
  FormulaireMetiersZones,
} from "./formulaires-artisan";
import {
  COULEURS_INTERVENTION,
  COULEURS_PLATEFORME,
  COULEURS_SIRET,
  ETATS_SIRET,
  STATUTS_INTERVENTION,
  STATUTS_PLATEFORME,
  VISIBILITES_ARTISAN,
} from "./referentiel";

// La fiche d'un artisan VUE PAR SON AGENCE. Deux moitiés, et la frontière
// entre elles est la chose importante à ne pas brouiller :
//   · le PROFIL GLOBAL (raison sociale, SIRET, métiers, zone, visibilité,
//     validation plateforme) circule entre agences — l'agence pose métiers et
//     zone, mais ni les pièces (RM-8.2.1 : l'artisan les dépose) ni la
//     visibilité (RM-8.4.2 : il en décide seul) ;
//   · la RELATION D'AGENCE (rattachement, désactivation, liste noire locale,
//     historique d'interventions) n'engage qu'elle (RM-A1.8).
// Les pièces justificatives ne sont volontairement PAS affichées : depuis le
// pivot du 2026-09-04 la conformité sort de l'agence, et la politique RLS de
// artisan_pieces ne les ouvre qu'à l'artisan et au super admin.

type Relation = {
  id: string;
  artisan_id: string;
  statut: string;
  blacklist_le: string | null;
  blacklist_motif: string | null;
  created_at: string;
};

export async function PaneArtisan({
  orgId,
  artisanId,
  estResponsable,
  relation,
}: {
  orgId: string;
  artisanId: string;
  estResponsable: boolean;
  relation: Relation | null;
}) {
  const supabase = await createClient();

  const [
    { data: profil, error: erreurProfil },
    { data: metiersBruts, error: erreurMetiers },
    { data: zonesBrutes, error: erreurZones },
    { data: missionsBrutes, error: erreurMissions },
  ] = await Promise.all([
    supabase
      .from("artisans")
      .select(
        "id, raison_sociale, siret, siret_etat, telephone, email, visibilite, statut_plateforme, statut_motif, blacklist_globale_le, blacklist_globale_motif, created_at"
      )
      .eq("id", artisanId)
      .maybeSingle(),
    supabase.from("artisan_metiers").select("metier").eq("artisan_id", artisanId),
    supabase.from("artisan_zones").select("code_postal").eq("artisan_id", artisanId).order("code_postal"),
    supabase
      .from("incident_interventions")
      .select("id, incident_id, statut, confiee_le, terminee_le")
      .eq("organization_id", orgId)
      .eq("artisan_id", artisanId)
      .order("confiee_le", { ascending: false })
      .limit(20),
  ]);

  if (erreurProfil) return <EchecLecture quoi={["la fiche de cet artisan"]} />;
  if (!profil) {
    return (
      <div className="vide-guide">
        <p className="titre">Fiche non consultable</p>
        <p className="explication">
          Ce profil n&apos;est plus lisible depuis votre agence : l&apos;artisan
          s&apos;est remis en privé, ou son profil a été retiré par Gerimmo. Votre
          historique d&apos;interventions, lui, reste dans vos incidents.
        </p>
      </div>
    );
  }

  const missions = (missionsBrutes ?? []) as {
    id: string;
    incident_id: string;
    statut: string;
    confiee_le: string;
    terminee_le: string | null;
  }[];
  const { data: incidentsBruts, error: erreurIncidents } = missions.length
    ? await supabase
        .from("incidents")
        .select("id, numero, categorie, etat")
        .eq("organization_id", orgId)
        .in("id", missions.map((m) => m.incident_id))
    : { data: [], error: null };
  const incidents = new Map(
    ((incidentsBruts ?? []) as { id: string; numero: string; categorie: string; etat: string }[]).map(
      (i) => [i.id, i]
    )
  );

  const metiers = ((metiersBruts ?? []) as { metier: string }[]).map((m) => m.metier);
  const codes = ((zonesBrutes ?? []) as { code_postal: string }[]).map((z) => z.code_postal);

  const lecturesManquees = [
    erreurMetiers && "ses métiers",
    erreurZones && "sa zone d'intervention",
    erreurMissions && "son historique d'interventions",
    erreurIncidents && "les incidents de son historique",
  ].filter((q): q is string => Boolean(q));

  const enBlacklist = Boolean(relation?.blacklist_le);
  const desactive = relation?.statut === "desactive";

  return (
    <div className="min-w-0 space-y-4">
      <EchecLecture quoi={lecturesManquees} />

      <div className="entete-page">
        <div className="min-w-0">
          <p className="eyebrow">SIRET {profil.siret}</p>
          <h2 className="mt-0.5 font-heading text-xl font-semibold text-[var(--encre)]">
            {profil.raison_sociale}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {/* Saisie libre : les espaces cassent `tel:` sur certains combinés —
                même nettoyage que les autres liens d'appel du produit. */}
            <a href={`tel:${profil.telephone.replace(/\s/g, "")}`} className="hover:underline">
              {profil.telephone}
            </a>
            {profil.email && (
              <>
                {" · "}
                <a href={`mailto:${profil.email}`} className="hover:underline">
                  {profil.email}
                </a>
              </>
            )}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {enBlacklist && <span className="puce puce-rouge">Votre liste noire</span>}
          {desactive && !enBlacklist && <span className="puce puce-grise">Désactivé</span>}
          <span className={COULEURS_PLATEFORME[profil.statut_plateforme] ?? "puce puce-grise"}>
            {STATUTS_PLATEFORME[profil.statut_plateforme] ?? profil.statut_plateforme}
          </span>
          <span className={COULEURS_SIRET[profil.siret_etat] ?? "puce puce-grise"}>
            {ETATS_SIRET[profil.siret_etat] ?? profil.siret_etat}
          </span>
        </span>
      </div>

      {profil.blacklist_globale_le && (
        <div className="err" role="alert">
          <p className="font-medium">
            Artisan retiré par Gerimmo le {formaterDate(profil.blacklist_globale_le)}.
          </p>
          <p className="mt-1">
            {profil.blacklist_globale_motif
              ? `« ${profil.blacklist_globale_motif} » — `
              : ""}
            Cette mesure vaut pour toutes les agences et ne se lève que par Gerimmo.
            Il ne vous sera plus proposé.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métiers et zone</CardTitle>
              <CardDescription>
                Ce que vous posez ici décide de ce qui vous est proposé : il ne
                remontera que dans ses métiers, et sur les codes postaux listés.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Métiers et zone sont du PROFIL GLOBAL (RM-A1.8), pas de la
                  relation d'agence : sur un profil public, ce que vous posez
                  ici est ce que les autres agences verront. Le dire, plutôt
                  que de laisser l'agent croire qu'il règle son carnet à lui. */}
              {profil.visibilite === "publique" && (
                <p className="border-l-2 border-l-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-soft-foreground)]">
                  Ce profil est public : métiers et zone appartiennent à
                  l&apos;artisan et valent pour toutes les agences avec
                  lesquelles il travaille. Une correction ici les concerne aussi.
                </p>
              )}
              <FormulaireMetiersZones
                orgId={orgId}
                artisanId={artisanId}
                metiers={metiers}
                codes={codes}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interventions dans votre agence</CardTitle>
              <CardDescription>
                {missions.length === 0
                  ? "Aucune mission ne lui a encore été confiée."
                  : `${missions.length} mission${missions.length > 1 ? "s" : ""} — les plus récentes d'abord.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {missions.map((m) => {
                const inc = incidents.get(m.incident_id);
                return (
                  <div key={m.id} className="ligne-info">
                    <span className="min-w-0 truncate">
                      {inc ? (
                        <Link
                          href={`/agence/${orgId}/incidents?sel=${inc.id}`}
                          className="hover:underline"
                        >
                          {inc.numero} · {titreIncident(inc.categorie)}
                        </Link>
                      ) : (
                        "Incident hors de votre portefeuille"
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="mono-discret">
                        {formaterDate(m.terminee_le ?? m.confiee_le)}
                      </span>
                      <span className={COULEURS_INTERVENTION[m.statut] ?? "puce puce-grise"}>
                        {STATUTS_INTERVENTION[m.statut] ?? m.statut}
                      </span>
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sa relation avec votre agence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="ligne-info">
                  <span>Rattaché depuis</span>
                  <span>{relation ? formaterDate(relation.created_at) : "—"}</span>
                </div>
                <div className="ligne-info">
                  <span>Visibilité</span>
                  <span>
                    {VISIBILITES_ARTISAN[profil.visibilite] ?? profil.visibilite}
                  </span>
                </div>
                <div className="ligne-info">
                  <span>Fiche créée le</span>
                  <span>{formaterDate(profil.created_at)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La visibilité appartient à l&apos;artisan seul : il choisit de
                rester privé ou de se rendre visible aux autres agences. De même,
                ses attestations sont à lui — vous ne les collectez pas et ne les
                consultez pas.
              </p>

              {!estResponsable ? (
                <p className="text-sm text-muted-foreground">
                  Désactivation et liste noire sont réservées au responsable de
                  l&apos;agence.
                </p>
              ) : enBlacklist ? (
                <div className="space-y-3">
                  <div className="border-l-2 border-l-[var(--destructive)] pl-3">
                    <p className="libelle-champ">
                      Liste noire posée le {formaterDate(relation!.blacklist_le)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {relation!.blacklist_motif
                        ? `« ${relation!.blacklist_motif} »`
                        : "Motif purgé — la mesure n'est plus opposable."}
                    </p>
                  </div>
                  <BoutonLeverBlacklist orgId={orgId} artisanId={artisanId} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="libelle-champ">Désactiver — geste neutre</p>
                    <p className="text-xs text-muted-foreground">
                      Il sort de vos listes sans qu&apos;aucun motif soit consigné :
                      vous ne travaillez plus ensemble, rien de plus.
                    </p>
                    <BoutonStatutLocal
                      orgId={orgId}
                      artisanId={artisanId}
                      actif={!desactive}
                    />
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="libelle-champ mb-1.5">Liste noire — geste motivé</p>
                    <FormulaireBlacklistLocale orgId={orgId} artisanId={artisanId} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {profil.statut_plateforme !== "valide" && (
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  {profil.statut_plateforme === "en_attente"
                    ? "Gerimmo n'a pas encore validé ce profil : il ne vous sera pas proposé à l'affectation tant que la validation n'est pas faite."
                    : `Profil refusé par Gerimmo${profil.statut_motif ? ` : « ${profil.statut_motif} »` : ""}. Il ne vous sera pas proposé.`}
                </p>
                <p className="mt-1">
                  Cette décision est celle de la plateforme, pas de votre agence — à
                  ne pas confondre avec le choix d&apos;un devis, qui, lui, vous
                  appartient.
                </p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
