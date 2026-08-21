import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate, formaterDateHeure, ROLES_RESPONSABLES } from "@/lib/ged";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { nomComplet } from "@/lib/roles-personnes";
import {
  CANAUX_INCIDENT,
  COULEURS_ETAT_INCIDENT,
  COULEURS_IMPUTATION,
  ETATS_INCIDENT,
  IMPUTATIONS_INCIDENT,
  MOTIFS_CLOTURE,
  MOTIFS_CLOTURE_PAR_ETAT,
  TYPES_EVENEMENT_INCIDENT,
  type EtatIncident,
  categorieIncident,
  titreIncident,
  transitionIncidentPossible,
} from "@/lib/incidents";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormulaireAttribution,
  FormulaireCloture,
  FormulairePhotoIncident,
  FormulaireQualification,
  FormulaireReouverture,
} from "./actions-incident";

export const metadata = { title: "Incident — Gerimmo" };

type Evenement = {
  id: string;
  type: string;
  acteur_account_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export default async function PageIncident(
  props: PageProps<"/agence/[orgId]/incidents/[incidentId]">
) {
  const { orgId, incidentId } = await props.params;
  const { supabase, user, role, organisation } = await verifierAccesEspace(orgId);

  const [{ data: incident }, { data: evenements }, { data: liens }, { data: donneesMembres }] =
    await Promise.all([
      supabase
        .from("incidents")
        .select(
          "*, lot:lots(id, nom, bien_id), declarant:persons(id, nom, prenom)"
        )
        .eq("id", incidentId)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("incident_evenements")
        .select("id, type, acteur_account_id, details, created_at")
        .eq("incident_id", incidentId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("document_liens")
        .select("document:documents(id, titre, purged_at)")
        .eq("organization_id", orgId)
        .eq("entite", "incident")
        .eq("entite_id", incidentId),
      supabase.rpc("org_membres_gerants", { org: orgId }),
    ]);
  if (!incident) notFound();

  const lot = premier(incident.lot as UnOuPlusieurs<{ id: string; nom: string; bien_id: string }>);
  const declarant = premier(
    incident.declarant as UnOuPlusieurs<{ id: string; nom: string; prenom: string | null }>
  );
  const membres = (donneesMembres ?? []) as { account_id: string; email: string; role: string }[];
  const emails = new Map(membres.map((m) => [m.account_id, m.email]));
  const photos = ((liens ?? []) as unknown as {
    document: UnOuPlusieurs<{ id: string; titre: string | null; purged_at: string | null }>;
  }[])
    .map((l) => premier(l.document))
    .filter((d): d is { id: string; titre: string | null; purged_at: string | null } =>
      Boolean(d && !d.purged_at)
    );

  const categorie = categorieIncident(incident.categorie);
  // L'UI dérive tout du référentiel (lib/incidents.ts), miroir de la machine
  // défendue en base — pas de règle recopiée en dur dans la page.
  const etatIncident = incident.etat as EtatIncident;
  const aQualifier = transitionIncidentPossible(etatIncident, "qualifie");
  const motifsCloture = transitionIncidentPossible(etatIncident, "clos")
    ? (MOTIFS_CLOTURE_PAR_ETAT[etatIncident] ?? [])
    : [];

  // Chronologie : le détail utile de chaque événement, dans les mots du métier
  const detailEvenement = (e: Evenement): string | null => {
    const d = e.details ?? {};
    switch (e.type) {
      case "declaration":
        return `${CANAUX_INCIDENT[String(d.canal)] ?? d.canal}${d.doublon_possible ? " · doublon possible signalé" : ""}`;
      case "qualification":
        return `${IMPUTATIONS_INCIDENT[String(d.imputation)] ?? d.imputation} — « ${d.justification} »`;
      case "contestation":
        return `« ${d.message} »`;
      case "cloture":
        return `${MOTIFS_CLOTURE[String(d.motif)] ?? d.motif}${d.commentaire ? ` — « ${d.commentaire} »` : ""}`;
      case "reouverture":
        return `« ${d.motif} »`;
      case "attribution":
        return d.responsable
          ? `à ${emails.get(String(d.responsable)) ?? "un gestionnaire"}`
          : "remis au pot commun";
      default:
        return null;
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href={`/agence/${orgId}`} className="hover:underline">
            {organisation.name}
          </Link>{" "}
          /{" "}
          <Link href={`/agence/${orgId}/incidents`} className="hover:underline">
            Incidents
          </Link>{" "}
          / {incident.numero}
        </p>
        <div className="entete-page">
          <h1>{titreIncident(incident.categorie)}</h1>
          <span className="mono-discret">
            {incident.numero} · {CANAUX_INCIDENT[incident.canal] ?? incident.canal} ·{" "}
            {formaterDateHeure(incident.created_at)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={COULEURS_ETAT_INCIDENT[incident.etat] ?? "puce puce-grise"}>
            {ETATS_INCIDENT[incident.etat] ?? incident.etat}
          </span>
          {incident.urgence === "urgente" && <span className="puce puce-rouge">Urgent</span>}
          {incident.imputation && (
            <span className={COULEURS_IMPUTATION[incident.imputation] ?? "puce puce-grise"}>
              {IMPUTATIONS_INCIDENT[incident.imputation]}
            </span>
          )}
          {incident.imputation_contestee_le && (
            <span className="puce puce-prep">Contestée par le locataire</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {incident.canal === "espace_locataire"
                  ? "Ce qu'a dit le locataire"
                  : "Le signalement"}
              </CardTitle>
              {categorie && <CardDescription>{categorie.libelle}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">« {incident.description} »</p>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((p) => (
                    // La route documents journalise chaque consultation
                    // (RM-A4 : pas de trace, pas d'accès)
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={p.id}
                      src={`/agence/${orgId}/documents/${p.id}/fichier`}
                      alt={p.titre ?? "Photo de l'incident"}
                      className="h-24 w-24 rounded-[3px] border border-border object-cover"
                    />
                  ))}
                </div>
              )}
              <dl className="divide-y divide-border text-sm">
                {[
                  {
                    libelle: "Lot",
                    valeur: lot ? (
                      <Link
                        href={`/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}`}
                        className="hover:underline"
                      >
                        {lot.nom}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  { libelle: "Pièce", valeur: incident.piece ?? "—" },
                  { libelle: "Depuis quand", valeur: incident.anciennete ?? "—" },
                  {
                    libelle: "Déclaré par",
                    valeur: declarant
                      ? nomComplet(declarant)
                      : "— (aucun bail actif sur le lot)",
                  },
                ].map((l) => (
                  <div key={l.libelle} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="libelle-champ shrink-0">{l.libelle}</dt>
                    <dd className="text-right">{l.valeur}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card className={aQualifier ? "border-[var(--or)]" : undefined}>
            <CardHeader>
              <CardTitle className="text-base">Qualification — qui paie</CardTitle>
              <CardDescription>
                {aQualifier
                  ? "Rien ne part tant que vous n'avez pas tranché : aucune affectation sans imputation."
                  : "Décidée par l'agence, opposable au locataire."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aQualifier ? (
                <FormulaireQualification
                  orgId={orgId}
                  incidentId={incidentId}
                  categorie={incident.categorie}
                />
              ) : incident.imputation ? (
                <div className="space-y-3 text-sm">
                  <p>
                    <span
                      className={COULEURS_IMPUTATION[incident.imputation] ?? "puce puce-grise"}
                    >
                      {IMPUTATIONS_INCIDENT[incident.imputation]}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    « {incident.imputation_justification} »
                  </p>
                  {incident.imputation_contestee_le && (
                    <div className="border-l-2 border-l-[var(--warning)] pl-3">
                      <p className="libelle-champ">
                        Contestée le {formaterDate(incident.imputation_contestee_le)}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        « {incident.imputation_contestation} » — la contestation est
                        tracée, elle ne suspend pas la réparation.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Clos sans qualification ({MOTIFS_CLOTURE[incident.cloture_motif ?? ""] ?? "—"}).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {incident.etat === "clos" ? "Incident clos" : "Clôture"}
              </CardTitle>
              <CardDescription>
                {incident.etat === "clos"
                  ? `${MOTIFS_CLOTURE[incident.cloture_motif ?? ""] ?? "—"} · le ${formaterDateHeure(incident.clos_le)}`
                  : "Un incident peut se clore sans artisan — un conseil au téléphone suffit parfois."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incident.etat === "clos" ? (
                <div className="space-y-4">
                  {incident.cloture_commentaire && (
                    <p className="text-sm text-muted-foreground">
                      « {incident.cloture_commentaire} »
                    </p>
                  )}
                  <FormulaireReouverture orgId={orgId} incidentId={incidentId} />
                </div>
              ) : motifsCloture.length > 0 ? (
                <FormulaireCloture
                  orgId={orgId}
                  incidentId={incidentId}
                  motifs={motifsCloture}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {incident.etat === "en_cours"
                    ? "Une intervention est en cours : la clôture attend le compte rendu de l'artisan."
                    : incident.etat === "rouvert"
                      ? "Un incident rouvert repasse d'abord par la qualification."
                      : "La clôture viendra après l'intervention."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suivi du dossier</CardTitle>
              <CardDescription>
                {incident.responsable_account_id
                  ? `Suivi par ${emails.get(incident.responsable_account_id) ?? "un gestionnaire"}`
                  : "Sans responsable : personne ne le suit."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incident.etat === "clos" ? (
                <p className="text-sm text-muted-foreground">Dossier clos.</p>
              ) : (
                <FormulaireAttribution
                  orgId={orgId}
                  incidentId={incidentId}
                  responsable={incident.responsable_account_id}
                  membres={membres}
                  monCompte={user.id}
                  estResponsable={ROLES_RESPONSABLES.includes(role)}
                />
              )}
            </CardContent>
          </Card>

          {incident.etat !== "clos" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ajouter une photo</CardTitle>
                <CardDescription>
                  Constat sur place, avant/après — elles suivent le dossier.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormulairePhotoIncident orgId={orgId} incidentId={incidentId} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chronologie</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-0">
                {((evenements ?? []) as Evenement[]).map((e) => {
                  const detail = detailEvenement(e);
                  return (
                    <li
                      key={e.id}
                      className="relative border-l-2 border-l-border pb-4 pl-4 last:pb-0"
                    >
                      <span
                        aria-hidden
                        className="absolute top-1 -left-[5px] size-2 rounded-full bg-[var(--or)]"
                      />
                      <p className="libelle-champ">{formaterDateHeure(e.created_at)}</p>
                      <p className="text-sm font-medium">
                        {TYPES_EVENEMENT_INCIDENT[e.type] ?? e.type}
                      </p>
                      {detail && (
                        <p className="text-[0.8125rem] text-muted-foreground">{detail}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
