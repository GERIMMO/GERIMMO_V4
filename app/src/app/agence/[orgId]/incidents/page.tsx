import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import {
  COULEURS_ETAT_INCIDENT,
  ETATS_INCIDENT,
  titreIncident,
} from "@/lib/incidents";
import { buttonVariants } from "@/components/ui/button";
import { PaneIncident, type MembreGerant } from "./pane-incident";

export const metadata = { title: "Incidents — Gerimmo" };

type Rang = {
  id: string;
  numero: string;
  categorie: string;
  urgence: string;
  etat: string;
  created_at: string;
  responsable_account_id: string | null;
  lot: UnOuPlusieurs<{ nom: string }>;
  declarant: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
};

// Les états qui attendent une action de l'agence — la file de travail
const ETATS_A_TRAITER = ["declare", "rouvert", "termine"];
// Ordre de tri : ce qui attend l'agence d'abord, le clos en dernier
const ORDRE_ETAT: Record<string, number> = {
  declare: 0,
  rouvert: 0,
  termine: 1,
  qualifie: 2,
  affecte: 3,
  en_cours: 3,
  clos: 9,
};

const VUES: { cle: string; libelle: string }[] = [
  { cle: "en-cours", libelle: "En cours" },
  { cle: "a-traiter", libelle: "À traiter" },
  { cle: "clos", libelle: "Clos" },
  { cle: "tous", libelle: "Tous" },
];

// Légende de la colonne : la grammaire des puces (maquette pageIncidents)
const LEGENDE: { couleur: string; libelle: string }[] = [
  { couleur: "var(--destructive)", libelle: "à traiter" },
  { couleur: "var(--encre)", libelle: "en cours" },
  { couleur: "var(--success)", libelle: "clos" },
];

export default async function PageIncidents(props: PageProps<"/agence/[orgId]/incidents">) {
  const { orgId } = await props.params;
  const { vue: vueBrute, sel: selBrut } = (await props.searchParams) as {
    vue?: string;
    sel?: string;
  };
  const vue = VUES.some((v) => v.cle === vueBrute) ? vueBrute! : "en-cours";
  const sel = typeof selBrut === "string" && selBrut ? selBrut : null;
  const { supabase, user, role, organisation } = await verifierAccesEspace(orgId);

  // Revue 23/08 : un plafond global faisait sortir les plus VIEUX dossiers —
  // précisément ceux que la file « À traiter » ne doit jamais perdre. Les
  // dossiers vivants sont lus sans plafond ; seuls les clos sont bornés.
  const colonnes =
    "id, numero, categorie, urgence, etat, created_at, responsable_account_id, lot:lots(nom), declarant:persons(nom, prenom)";
  const [{ data: vivantsBruts }, { data: closBruts }, { data: donneesMembres }] =
    await Promise.all([
      supabase
        .from("incidents")
        .select(colonnes)
        .eq("organization_id", orgId)
        .neq("etat", "clos")
        .order("created_at", { ascending: false }),
      supabase
        .from("incidents")
        .select(colonnes)
        .eq("organization_id", orgId)
        .eq("etat", "clos")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.rpc("org_membres_gerants", { org: orgId }),
    ]);

  const incidents = [
    ...((vivantsBruts ?? []) as unknown as Rang[]),
    ...((closBruts ?? []) as unknown as Rang[]),
  ];
  const membres = (donneesMembres ?? []) as MembreGerant[];
  const emails = new Map(membres.map((m) => [m.account_id, m.email.split("@")[0]]));

  const enCours = incidents.filter((i) => i.etat !== "clos");
  const aTraiter = enCours.filter((i) => ETATS_A_TRAITER.includes(i.etat));
  const filtres = {
    "en-cours": enCours,
    "a-traiter": aTraiter,
    clos: incidents.filter((i) => i.etat === "clos"),
    tous: incidents,
  } as const;
  const visibles = [...filtres[vue as keyof typeof filtres]].sort(
    (a, b) =>
      (ORDRE_ETAT[a.etat] ?? 5) - (ORDRE_ETAT[b.etat] ?? 5) ||
      b.created_at.localeCompare(a.created_at)
  );

  // Les liens de la vue scindée préservent l'autre paramètre : changer de
  // vue garde le dossier ouvert, ouvrir un dossier garde la vue courante.
  const lien = (vueCible: string, selCible: string | null) => {
    const params = new URLSearchParams();
    if (vueCible !== "en-cours") params.set("vue", vueCible);
    if (selCible) params.set("sel", selCible);
    const q = params.toString();
    return `/agence/${orgId}/incidents${q ? `?${q}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/agence/${orgId}`} className="hover:underline">
              {organisation.name}
            </Link>{" "}
            / Incidents
          </p>
          <h1>Incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Déclarés par le locataire ou saisis par l&apos;agence — qualifiez
            l&apos;imputation, elle décide de qui paie.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono-discret">
            {enCours.length} en cours · {aTraiter.length} à traiter
          </span>
          <Link href={`/agence/${orgId}/incidents/nouveau`} className="btn-or">
            Ouvrir un incident
          </Link>
        </div>
      </div>

      {/* Vue scindée maquette : la liste à gauche, le dossier sélectionné à
          droite (?sel=…) — les alertes « Traiter » pointent déjà ici. */}
      <div className="split">
        <div className="colonne-liste-split">
          <div className="tete-liste">
            <span className="mono-discret">{enCours.length} EN COURS</span>
            {sel && (
              <Link href={lien(vue, null)} className="text-xs text-[var(--bleu)] hover:underline">
                Fermer
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
            {VUES.map((v) => (
              <Link
                key={v.cle}
                href={lien(v.cle, sel)}
                className={`filtre${vue === v.cle ? " actif" : ""}`}
              >
                {v.libelle} · {filtres[v.cle as keyof typeof filtres].length}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            {LEGENDE.map((l) => (
              <span key={l.libelle} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-[9px]"
                  style={{ background: l.couleur }}
                />
                {l.libelle}
              </span>
            ))}
          </div>

          {visibles.length === 0 ? (
            <div className="vide">
              {incidents.length === 0 ? (
                <>
                  <p className="font-medium">Aucun incident déclaré.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vos locataires déclarent depuis leur espace ; vous pouvez
                    aussi saisir un incident reçu par téléphone.
                  </p>
                  <Link
                    href={`/agence/${orgId}/incidents/nouveau`}
                    className={`mt-3 inline-flex ${buttonVariants({ variant: "outline", size: "sm" })}`}
                  >
                    Ouvrir un incident
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium">Rien dans cette vue.</p>
                  <Link
                    href={lien("en-cours", sel)}
                    className="mt-1 inline-block text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
                  >
                    Revenir aux incidents en cours
                  </Link>
                </>
              )}
            </div>
          ) : (
            visibles.map((i) => {
              const lot = premier(i.lot);
              const actif = i.id === sel;
              return (
                <Link
                  key={i.id}
                  href={lien(vue, i.id)}
                  className="rang"
                  aria-current={actif ? "true" : undefined}
                  style={
                    actif
                      ? { background: "var(--ardoise)", borderLeftColor: "var(--encre)" }
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{titreIncident(i.categorie)}</b>
                    <small className="block truncate">
                      {i.numero} · {lot?.nom ?? "—"}
                    </small>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1.5">
                      {i.urgence === "urgente" && (
                        <span className="puce puce-rouge">Urgent</span>
                      )}
                      <span className={COULEURS_ETAT_INCIDENT[i.etat] ?? "puce puce-grise"}>
                        {ETATS_INCIDENT[i.etat] ?? i.etat}
                      </span>
                    </span>
                    <span className="mono-discret" style={{ fontSize: "10px" }}>
                      {i.responsable_account_id
                        ? (emails.get(i.responsable_account_id) ?? "—").toUpperCase()
                        : "NON ATTRIBUÉ"}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>

        {sel ? (
          <PaneIncident
            orgId={orgId}
            incidentId={sel}
            monCompte={user.id}
            estResponsable={ROLES_RESPONSABLES.includes(role)}
            membres={membres}
          />
        ) : (
          <div className="flex min-h-[340px] flex-col items-center justify-center text-center text-muted-foreground">
            <svg
              width="52"
              height="52"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              aria-hidden
              className="mb-3.5 opacity-50"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <p className="text-[15px]">Sélectionnez un incident dans la liste</p>
            <p className="mt-1.5 max-w-[24em] text-[13px]">
              Son suivi complet — qualification, photos, clôture, chronologie —
              s&apos;affichera ici.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
