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
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { EchecLecture } from "../documents/echec-lecture";
import { PaneIncident, type MembreGerant } from "./pane-incident";

export const metadata = { title: "Incidents — Gerimmo" };

// Les dossiers clos sont bornés — ils ne sont là que pour la consultation.
// Le plafond est NOMMÉ, et l'écran dit combien de dossiers il tait.
const PLAFOND_CLOS = 200;

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
  const [
    { data: vivantsBruts, error: erreurVivants },
    { data: closBruts, error: erreurClos, count: totalClosBrut },
    { data: donneesMembres, error: erreurMembres },
    { data: aEvaluerBrut },
  ] = await Promise.all([
      supabase
        .from("incidents")
        .select(colonnes)
        .eq("organization_id", orgId)
        .neq("etat", "clos")
        .order("created_at", { ascending: false }),
      // `count: exact` : les onglets annoncent le VRAI nombre de dossiers
      // clos, pas la taille de la fenêtre qu'on en montre.
      supabase
        .from("incidents")
        .select(colonnes, { count: "exact" })
        .eq("organization_id", orgId)
        .eq("etat", "clos")
        .order("created_at", { ascending: false })
        .limit(PLAFOND_CLOS),
      supabase.rpc("org_membres_gerants", { org: orgId }),
      // RM-7.6.2 : « la clôture déclenche la notation ». Il n'y a pas d'alerte
      // pour cela — cloturer_incident solde toutes les alertes du dossier et
      // refermerait la sienne aussitôt. Le déclenchement est donc un ÉTAT
      // interrogeable : la file des interventions terminées que l'agence n'a
      // pas encore notées. Sans cet appel, la fonction n'aurait aucun écran.
      supabase.rpc("interventions_a_evaluer", { p_org: orgId }),
    ]);

  const incidents = [
    ...((vivantsBruts ?? []) as unknown as Rang[]),
    ...((closBruts ?? []) as unknown as Rang[]),
  ];
  const membres = (donneesMembres ?? []) as MembreGerant[];
  const aEvaluer = (aEvaluerBrut ?? []) as {
    intervention_id: string;
    incident_id: string;
    incident_numero: string;
    raison_sociale: string;
  }[];
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

  // Ce que les onglets ont le droit d'annoncer : le nombre RÉEL de dossiers de
  // chaque vue, pas la longueur de la fenêtre lue. Sous le plafond, les deux
  // coïncident ; au-dessus, l'onglet « Clos » disait 200 pour 1 400.
  const totalClos = totalClosBrut ?? filtres.clos.length;
  const comptes: Record<string, number> = {
    "en-cours": enCours.length,
    "a-traiter": aTraiter.length,
    clos: totalClos,
    tous: enCours.length + totalClos,
  };
  const libelleVue = VUES.find((v) => v.cle === vue)!.libelle;
  const tronque = !erreurClos && visibles.length < comptes[vue];

  // Un onglet ne chiffre que ce qu'il a pu lire : « Clos · 0 » sur une lecture
  // refusée serait le même mensonge, en plus petit.
  const vueIllisible = (cle: string) =>
    cle === "clos"
      ? Boolean(erreurClos)
      : cle === "tous"
        ? Boolean(erreurVivants || erreurClos)
        : Boolean(erreurVivants);
  const compteVue = (cle: string) => (vueIllisible(cle) ? "—" : String(comptes[cle]));

  const lecturesManquees = [
    erreurVivants && "les incidents en cours",
    erreurClos && "les incidents clos",
    erreurMembres && "les gestionnaires de l'agence",
  ].filter((q): q is string => Boolean(q));

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
            Déclarés par le locataire ou saisis par le gestionnaire — qualifiez
            l&apos;imputation, elle décide de qui paie.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono-discret">
            {erreurVivants
              ? "file de travail indisponible"
              : `${enCours.length} en cours · ${aTraiter.length} à traiter`}
          </span>
          {/* Seule porte d'entrée du carnet d'artisans tant que la barre de
              navigation (src/components/nav-agence-premium.tsx) n'a pas son
              entrée — ce fichier appartient à un autre lot. Signalé au rapport. */}
          <Link href={`/agence/${orgId}/artisans`} className="lien-discret">
            Carnet d&apos;artisans
          </Link>
          <Link href={`/agence/${orgId}/incidents/nouveau`} className="btn-or">
            Ouvrir un incident
          </Link>
        </div>
      </div>

      <EchecLecture quoi={lecturesManquees} />

      {/* La file de notation. Discrète — le module 11 insiste : la note ne
          bloque rien, elle se propose. Un lien par dossier, pas une modale :
          on note en rouvrant l'intervention, avec le chantier sous les yeux. */}
      {aEvaluer.length > 0 && (
        <div className="mb-4 border-l-2 border-l-[var(--or)] bg-[var(--survol)] px-3.5 py-2.5 text-sm">
          <p className="font-medium">
            {aEvaluer.length} intervention{aEvaluer.length > 1 ? "s" : ""} terminée
            {aEvaluer.length > 1 ? "s" : ""} attend{aEvaluer.length > 1 ? "ent" : ""} votre
            note.
          </p>
          <p className="mt-1 text-muted-foreground">
            {aEvaluer.slice(0, 4).map((i, n) => (
              <span key={i.intervention_id}>
                {n > 0 && " · "}
                <Link href={lien(vue, i.incident_id)} className="hover:underline">
                  {i.raison_sociale} — {i.incident_numero}
                </Link>
              </span>
            ))}
            {aEvaluer.length > 4 && ` · et ${aEvaluer.length - 4} autre${aEvaluer.length - 4 > 1 ? "s" : ""}`}
          </p>
        </div>
      )}

      {/* Vue scindée maquette : la liste à gauche, le dossier sélectionné à
          droite (?sel=…) — les alertes « Traiter » pointent déjà ici.
          Vue scindée mobile (socle 10/09) : `detail-actif` masque la liste
          sous 900px quand un dossier est ouvert — le dossier remplace la
          liste au lieu d'être rendu dessous, avec un lien retour en tête. */}
      <div className={`split${sel ? " detail-actif" : ""}`}>
        <div className="colonne-liste-split volet-liste">
          <div className="tete-liste">
            {/* La tête suit l'onglet actif : « 12 EN COURS » au-dessus de la
                vue « Clos » annonçait une liste qui n'était pas celle-là. */}
            <span className="mono-discret">
              {compteVue(vue)} {libelleVue}
            </span>
            {sel && (
              <Link
                href={lien(vue, null)}
                className="lien-discret inline-flex items-center gap-1.5"
              >
                Fermer
                <IndicateurLien />
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
            {VUES.map((v) => (
              <Link
                key={v.cle}
                href={lien(v.cle, sel)}
                className={`filtre inline-flex items-center gap-1.5${vue === v.cle ? " actif" : ""}`}
              >
                {v.libelle} · {compteVue(v.cle)}
                {/* Changer de vue ne recharge que le contenu : l'anneau dit
                    que le clic est pris (recette 24/08, fluidité) */}
                <IndicateurLien />
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

          {visibles.length === 0 && vueIllisible(vue) ? (
            /* Ni liste ni état vide : « aucun incident déclaré » serait faux —
               c'est la lecture qui a échoué, pas l'agence qui n'a rien. */
            <div className="p-3.5">
              <EchecLecture quoi={[`les incidents de la vue « ${libelleVue} »`]} />
            </div>
          ) : visibles.length === 0 ? (
            <div className="vide-guide">
              {incidents.length === 0 ? (
                <>
                  <p className="titre">Aucun incident déclaré</p>
                  <p className="explication">
                    Vos locataires déclarent depuis leur espace et le dossier
                    arrive ici « à qualifier ». Vous pouvez aussi saisir un
                    incident reçu par téléphone.
                  </p>
                  <span className="geste">
                    <Link
                      href={`/agence/${orgId}/incidents/nouveau`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Ouvrir un incident
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <p className="titre">Rien dans cette vue</p>
                  <p className="explication">
                    {/* comptes.tous, pas incidents.length : le second ne
                        compte que la fenêtre lue. */}
                    Les {comptes.tous} dossiers de l&apos;agence sont dans les
                    autres onglets.
                  </p>
                  <span className="geste">
                    <Link href={lien("en-cours", sel)} className="lien-discret">
                      Revenir aux incidents en cours
                    </Link>
                  </span>
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
                  className={`rang${actif ? " actif" : ""}`}
                  aria-current={actif ? "true" : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{titreIncident(i.categorie)}</b>
                    <small className="block truncate">
                      {i.numero} · {lot?.nom ?? "—"}
                    </small>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1.5">
                      {/* Ouvrir un dossier ne recharge pas la liste : l'anneau
                          sur la ligne cliquée confirme le geste */}
                      <IndicateurLien />
                      {i.urgence === "urgente" && (
                        <span className="puce puce-rouge">Urgent</span>
                      )}
                      <span className={COULEURS_ETAT_INCIDENT[i.etat] ?? "puce puce-grise"}>
                        {ETATS_INCIDENT[i.etat] ?? i.etat}
                      </span>
                    </span>
                    <span className="mono-discret">
                      {i.responsable_account_id
                        ? (emails.get(i.responsable_account_id) ?? "—").toUpperCase()
                        : "NON ATTRIBUÉ"}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
          {/* La colonne dit ce qu'elle ne montre pas : l'onglet annonce le vrai
              total, la fenêtre lue s'arrête au plafond. */}
          {tronque && (
            <p className="border-t border-border px-3.5 py-2.5 text-[length:var(--pas-appui)] text-[var(--texte-secondaire)]">
              Les {visibles.length} dossiers les plus récents, sur{" "}
              {comptes[vue]}. Les dossiers clos plus anciens restent
              accessibles par leur lien ou depuis la fiche du lot.
            </p>
          )}
        </div>

        {sel ? (
          <div className="min-w-0">
            {/* Visible sous 900px seulement (.retour-liste) : la liste est masquée */}
            <Link href={lien(vue, null)} className="retour-liste mb-2">
              ← Tous les incidents
            </Link>
            <PaneIncident
              orgId={orgId}
              incidentId={sel}
              monCompte={user.id}
              estResponsable={ROLES_RESPONSABLES.includes(role)}
              membres={membres}
            />
          </div>
        ) : (
          /* Sous 900px l'invite n'a pas de sens : la liste occupe tout l'écran */
          <div className="flex min-h-[340px] flex-col items-center justify-center text-center text-muted-foreground max-[900px]:hidden">
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
            <p className="text-[length:var(--pas-corps)]">
              Sélectionnez un incident dans la liste
            </p>
            <p className="mt-1.5 max-w-[24em] text-[length:var(--pas-appui)]">
              Son suivi complet — qualification, photos, clôture, chronologie —
              s&apos;affichera ici.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
