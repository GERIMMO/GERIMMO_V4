import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterDate, formaterDateHeure } from "@/lib/ged";
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
} from "./[incidentId]/actions-incident";

type Evenement = {
  id: string;
  type: string;
  acteur_account_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type MembreGerant = { account_id: string; email: string; role: string };

// Le dossier d'un incident, affiché dans la vue scindée de la liste (maquette
// pageIncident). Composant serveur : il fait ses propres requêtes — la page
// liste ne lui passe que le contexte déjà en main (accès vérifié en amont,
// membres déjà chargés pour la colonne).
export async function PaneIncident({
  orgId,
  incidentId,
  monCompte,
  estResponsable,
  membres,
}: {
  orgId: string;
  incidentId: string;
  monCompte: string;
  estResponsable: boolean;
  membres: MembreGerant[];
}) {
  const supabase = await createClient();

  const [{ data: incident }, { data: evenements }, { data: liens }] =
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
    ]);
  if (!incident) {
    return <div className="vide">Dossier introuvable.</div>;
  }

  const lot = premier(incident.lot as UnOuPlusieurs<{ id: string; nom: string; bien_id: string }>);
  const declarant = premier(
    incident.declarant as UnOuPlusieurs<{ id: string; nom: string; prenom: string | null }>
  );
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
  // défendue en base — pas de règle recopiée en dur dans le pane. Depuis le
  // 23/08 la base accepte la requalification : la carte « qui paie » reste
  // donc ouverte à l'état qualifié (réponse à une contestation).
  const etatIncident = incident.etat as EtatIncident;
  const aQualifier = transitionIncidentPossible(etatIncident, "qualifie");
  const motifsCloture = transitionIncidentPossible(etatIncident, "clos")
    ? (MOTIFS_CLOTURE_PAR_ETAT[etatIncident] ?? [])
    : [];

  // Barre d'étapes du flux (maquette) : déclaré → qualifié → clos ; un
  // incident rouvert repart de « rouvert » à la place de « déclaré ».
  const etapesFlux: EtatIncident[] = [
    etatIncident === "rouvert" ? "rouvert" : "declare",
    "qualifie",
    "clos",
  ];
  const positionFlux =
    etatIncident === "declare" || etatIncident === "rouvert"
      ? 0
      : etatIncident === "clos"
        ? 2
        : 1;

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
    <div className="min-w-0 space-y-4">
      {/* En-tête du dossier (maquette pageIncident) : eyebrow mono, titre
          court, sous-ligne lot · pièce · déclarant ; les puces à droite. */}
      <div className="entete-page">
        <div className="min-w-0">
          <p className="eyebrow">
            {incident.numero} · {CANAUX_INCIDENT[incident.canal] ?? incident.canal} ·{" "}
            {formaterDateHeure(incident.created_at)}
          </p>
          <h2 className="mt-0.5 font-heading text-xl font-semibold text-[var(--encre)]">
            {titreIncident(incident.categorie)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lot ? (
              <Link
                href={`/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}`}
                className="hover:underline"
              >
                {lot.nom}
              </Link>
            ) : (
              "—"
            )}
            {incident.piece ? ` · ${incident.piece}` : ""}
            {" · déclaré par "}
            {declarant ? nomComplet(declarant) : "— (aucun bail actif sur le lot)"}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {incident.urgence === "urgente" && <span className="puce puce-rouge">Urgent</span>}
          <span className={COULEURS_ETAT_INCIDENT[incident.etat] ?? "puce puce-grise"}>
            {ETATS_INCIDENT[incident.etat] ?? incident.etat}
          </span>
        </span>
      </div>

      {/* Carte d'attribution en bandeau (maquette « VOTRE DOSSIER ») */}
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="eyebrow shrink-0">Votre dossier</span>
          {incident.etat === "clos" ? (
            <span className="text-muted-foreground">Dossier clos.</span>
          ) : (
            <>
              <span className="text-muted-foreground">
                {incident.responsable_account_id
                  ? `Suivi par ${emails.get(incident.responsable_account_id) ?? "un gestionnaire"}`
                  : "Sans responsable : personne ne le suit."}
              </span>
              <div className="max-w-sm min-w-[240px] flex-1">
                <FormulaireAttribution
                  orgId={orgId}
                  incidentId={incidentId}
                  responsable={incident.responsable_account_id}
                  membres={membres}
                  monCompte={monCompte}
                  estResponsable={estResponsable}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Barre d'étapes du flux : segment courant laiton, faits verts, à
          venir filet (maquette pageIncident). */}
      <Card size="sm">
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {etapesFlux.map((f, n) => {
              const fait = n < positionFlux;
              const courant = n === positionFlux;
              return (
                <span key={f} className="min-w-[70px] flex-1">
                  <span
                    className="block h-1"
                    style={{
                      background: courant
                        ? "var(--or)"
                        : fait
                          ? "var(--success)"
                          : "var(--filet)",
                    }}
                  />
                  <span
                    className="mono-discret block"
                    style={{
                      fontSize: "8.5px",
                      marginTop: "5px",
                      color: courant ? "var(--encre)" : undefined,
                    }}
                  >
                    {(ETATS_INCIDENT[f] ?? f).toUpperCase()}
                  </span>
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-4">
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
                      className="h-20 w-20 rounded-[3px] border border-border object-cover"
                    />
                  ))}
                </div>
              )}
              <div>
                <div className="ligne-info">
                  <span>Pièce</span>
                  <span>{incident.piece ?? "—"}</span>
                </div>
                <div className="ligne-info">
                  <span>Ancienneté</span>
                  <span>{incident.anciennete ?? "—"}</span>
                </div>
                <div className="ligne-info">
                  <span>Canal</span>
                  <span>{CANAUX_INCIDENT[incident.canal] ?? incident.canal}</span>
                </div>
                <div className="ligne-info">
                  <span>Déclaré le</span>
                  <span>{formaterDateHeure(incident.created_at)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {aQualifier ? (
            <Card className="border-l-[3px] border-l-[var(--or)]">
              <CardHeader>
                <p className="eyebrow" style={{ color: "var(--or-texte)" }}>
                  Qui paie — votre décision est requise
                </p>
                <CardDescription>
                  {etatIncident === "qualifie"
                    ? "Déjà qualifié — requalifier répond à une contestation ou corrige la décision."
                    : "Rien ne part tant que vous n'avez pas tranché : aucune affectation sans imputation."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {incident.imputation_contestation && (
                  <div className="border-l-2 border-l-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm text-[var(--warning-soft-foreground)]">
                    {`Le locataire conteste l'imputation : « ${incident.imputation_contestation} » — requalifiez pour répondre, maintenir l'imputation vaut réponse.`}
                  </div>
                )}
                {incident.imputation && (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span
                        className={COULEURS_IMPUTATION[incident.imputation] ?? "puce puce-grise"}
                      >
                        {IMPUTATIONS_INCIDENT[incident.imputation]}
                      </span>
                    </p>
                    {incident.imputation_justification && (
                      <p className="text-muted-foreground">
                        « {incident.imputation_justification} »
                      </p>
                    )}
                  </div>
                )}
                <FormulaireQualification
                  orgId={orgId}
                  incidentId={incidentId}
                  categorie={incident.categorie}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Qualification — qui paie</CardTitle>
                <CardDescription>Décidée par l&apos;agence, opposable au locataire.</CardDescription>
              </CardHeader>
              <CardContent>
                {incident.imputation ? (
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
          )}

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

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chronologie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="chrono">
                {((evenements ?? []) as Evenement[]).map((e) => {
                  const detail = detailEvenement(e);
                  return (
                    <div key={e.id}>
                      <p className="libelle-champ">{formaterDateHeure(e.created_at)}</p>
                      <p className="text-sm font-medium">
                        {TYPES_EVENEMENT_INCIDENT[e.type] ?? e.type}
                      </p>
                      {detail && (
                        <p className="text-[0.8125rem] text-muted-foreground">{detail}</p>
                      )}
                    </div>
                  );
                })}
              </div>
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
        </div>
      </div>
    </div>
  );
}
