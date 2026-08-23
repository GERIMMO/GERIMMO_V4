import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { nomComplet } from "@/lib/roles-personnes";
import {
  COULEURS_ETAT_INCIDENT,
  ETATS_INCIDENT,
  titreIncident,
} from "@/lib/incidents";
import { buttonVariants } from "@/components/ui/button";

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

export default async function PageIncidents(props: PageProps<"/agence/[orgId]/incidents">) {
  const { orgId } = await props.params;
  const { vue: vueBrute } = (await props.searchParams) as { vue?: string };
  const vue = VUES.some((v) => v.cle === vueBrute) ? vueBrute! : "en-cours";
  const { supabase, organisation } = await verifierAccesEspace(orgId);

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
  const emails = new Map(
    ((donneesMembres ?? []) as { account_id: string; email: string }[]).map((m) => [
      m.account_id,
      m.email.split("@")[0],
    ])
  );

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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
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

      <div className="mb-4 flex flex-wrap gap-2">
        {VUES.map((v) => (
          <Link
            key={v.cle}
            href={`/agence/${orgId}/incidents${v.cle === "en-cours" ? "" : `?vue=${v.cle}`}`}
            className={`filtre${vue === v.cle ? " actif" : ""}`}
          >
            {v.libelle} · {filtres[v.cle as keyof typeof filtres].length}
          </Link>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="vide">
          {incidents.length === 0 ? (
            <>
              <p className="font-medium">Aucun incident déclaré.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Vos locataires déclarent depuis leur espace ; vous pouvez aussi
                saisir un incident reçu par téléphone.
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
                href={`/agence/${orgId}/incidents`}
                className="mt-1 inline-block text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
              >
                Revenir aux incidents en cours
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="colonne-liste">
          {visibles.map((i) => {
            const lot = premier(i.lot);
            const declarant = premier(i.declarant);
            return (
              <Link key={i.id} href={`/agence/${orgId}/incidents/${i.id}`} className="rang">
                <span className="min-w-0 flex-1">
                  <b className="flex items-center gap-2">
                    {titreIncident(i.categorie)}
                    {i.urgence === "urgente" && (
                      <span className="puce puce-rouge">Urgent</span>
                    )}
                  </b>
                  <small>
                    {i.numero} · {lot?.nom ?? "—"}
                    {declarant ? ` · ${nomComplet(declarant)}` : ""}
                    {" · "}
                    {formaterDate(i.created_at)}
                  </small>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <span className={COULEURS_ETAT_INCIDENT[i.etat] ?? "puce puce-grise"}>
                    {ETATS_INCIDENT[i.etat] ?? i.etat}
                  </span>
                  <span className="mono-discret hidden sm:inline">
                    {i.responsable_account_id
                      ? (emails.get(i.responsable_account_id) ?? "—")
                      : "non attribué"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
