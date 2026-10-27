import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, Inbox, Plus, TriangleAlert, Wrench } from "lucide-react";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import "./incidents.css";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import {
  COULEURS_ETAT_INCIDENT,
  ETATS_INCIDENT,
  incidentsATraiter,
  titreIncident,
} from "@/lib/incidents";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { EchecLecture } from "../documents/echec-lecture";
import { PaneIncident, type MembreGerant } from "./pane-incident";
import { baseEspace } from "@/lib/racine-espace";

export const metadata = { title: "Incidents — Gerimmo" };

// Les dossiers clos sont bornés — ils ne sont là que pour la consultation.
// Le plafond est NOMMÉ, et l'écran dit combien de dossiers il tait.
const PLAFOND_CLOS = 200;

type Rang = {
  id: string;
  lot_id: string;
  numero: string;
  categorie: string;
  urgence: string;
  etat: string;
  created_at: string;
  responsable_account_id: string | null;
  lot: UnOuPlusieurs<{ nom: string }>;
  declarant: UnOuPlusieurs<{ nom: string; prenom: string | null }>;
};

// La file « À traiter » (états qui attendent l'agence, et devis reçus à décider)
// se calcule par incidentsATraiter (lib/incidents.ts).
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
  const { vue: vueBrute, sel: selBrut } = (await props.searchParams) as {
    vue?: string;
    sel?: string;
  };
  const vue = VUES.some((v) => v.cle === vueBrute) ? vueBrute! : "en-cours";
  const sel = typeof selBrut === "string" && selBrut ? selBrut : null;
  // estProprietaire : en gestion directe, le « gestionnaire » c'est lui —
  // la page lui parle à la deuxième personne (tour du 24/09).
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);

  // Revue 23/08 : un plafond global faisait sortir les plus VIEUX dossiers —
  // précisément ceux que la file « À traiter » ne doit jamais perdre. Les
  // dossiers vivants sont lus sans plafond ; seuls les clos sont bornés.
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  if (portefeuille instanceof PortefeuilleIndisponible) {
    // Même enveloppe que l'écran nominal : sans <main> ni marges, l'échec
    // collait au bord et sortait du repère de navigation.
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:p-7">
        <TitreEcran rubrique="incidents">Incidents</TitreEcran>
        <EchecLecture quoi={["votre portefeuille"]} />
        <p>Votre portefeuille n’a pas pu être chargé. Réessayez pour consulter vos dossiers.</p>
      </main>
    );
  }
  const colonnes =
    "id, lot_id, numero, categorie, urgence, etat, created_at, responsable_account_id, lot:lots(nom), declarant:persons(nom, prenom)";
  let vivantsQuery = supabase.from("incidents").select(colonnes)
    .eq("organization_id", orgId).neq("etat", "clos")
    .order("created_at", { ascending: false });
  let closQuery = supabase.from("incidents").select(colonnes, { count: "exact" })
    .eq("organization_id", orgId).eq("etat", "clos")
    .order("created_at", { ascending: false }).limit(PLAFOND_CLOS);
  // Le périmètre précède le comptage et le plafond : les dossiers des
  // collègues ne doivent ni gonfler les onglets, ni consommer la fenêtre.
  if (portefeuille) {
    vivantsQuery = vivantsQuery.in("lot_id", [...portefeuille]);
    closQuery = closQuery.in("lot_id", [...portefeuille]);
  }
  const [
    { data: vivantsBruts, error: erreurVivants },
    { data: closBruts, error: erreurClos, count: totalClosBrut },
    { data: donneesMembres, error: erreurMembres },
    { data: aEvaluerBrut },
    { data: devisADeciderBruts, error: erreurDevisADecider },
  ] = await Promise.all([
      vivantsQuery,
      closQuery,
      supabase.rpc("org_membres_gerants", { org: orgId }),
      // RM-7.6.2 : « la clôture déclenche la notation ». Il n'y a pas d'alerte
      // pour cela — cloturer_incident solde toutes les alertes du dossier et
      // refermerait la sienne aussitôt. Le déclenchement est donc un ÉTAT
      // interrogeable : la file des interventions terminées que l'agence n'a
      // pas encore notées. Sans cet appel, la fonction n'aurait aucun écran.
      supabase.rpc("interventions_a_evaluer", { p_org: orgId }),
      // D19 (PRO2-13) : un devis reçu, encore valable et pas encore retenu, met
      // l'incident dans « À traiter » — l'e-mail seul ne suffisait pas.
      supabase.from("incident_devis").select("incident_id")
        .eq("organization_id", orgId).eq("statut", "depose")
        .gte("valide_jusqu_au", aujourdhuiParis()),
    ]);

  const incidents = [
    ...((vivantsBruts ?? []) as unknown as Rang[]),
    ...((closBruts ?? []) as unknown as Rang[]),
  ].filter(i => !portefeuille || portefeuille.has(i.lot_id));
  const membres = (donneesMembres ?? []) as MembreGerant[];
  const aEvaluer = ((aEvaluerBrut ?? []) as {
    intervention_id: string;
    incident_id: string;
    incident_numero: string;
    raison_sociale: string;
  }[]).filter(e => !portefeuille || incidents.some(i => i.id === e.incident_id));
  const emails = new Map(membres.map((m) => [m.account_id, m.email.split("@")[0]]));

  const enCours = incidents.filter((i) => i.etat !== "clos");
  const idsAvecDevisADecider = new Set(
    ((devisADeciderBruts ?? []) as { incident_id: string }[]).map((d) => d.incident_id)
  );
  const aTraiter = incidentsATraiter(enCours, idsAvecDevisADecider);
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
        : cle === "a-traiter"
          ? Boolean(erreurVivants || erreurDevisADecider)
          : Boolean(erreurVivants);
  const compteVue = (cle: string) => (vueIllisible(cle) ? "—" : String(comptes[cle]));

  const lecturesManquees = [
    erreurVivants && "les incidents en cours",
    erreurClos && "les incidents clos",
    erreurDevisADecider && "les devis reçus à décider",
    erreurMembres &&
      (estProprietaire ? "les membres de l'espace" : "les gestionnaires de l'agence"),
  ].filter((q): q is string => Boolean(q));

  // Ouvrir un dossier conserve la vue courante. Un changement de filtre ne
  // garde la sélection que si le dossier appartient encore à la vue cible.
  const lien = (vueCible: string, selCible: string | null) => {
    const params = new URLSearchParams();
    if (vueCible !== "en-cours") params.set("vue", vueCible);
    if (selCible) params.set("sel", selCible);
    const q = params.toString();
    return `${base}/incidents${q ? `?${q}` : ""}`;
  };

  // Le dossier affiché à droite (24/09) : celui qu'on a choisi, sinon le
  // premier de la vue — le plus urgent, d'après le tri. Le volet ouvrait sur
  // « Sélectionnez un incident » et une coche « tout est fait » : un clic de
  // plus à chaque visite. `sel` seul garde le sens « dossier ouvert » (Fermer,
  // retour, liste masquée sous 1100 px) ; sans lui, la liste reste seule sur
  // téléphone.
  const ouvert = sel ?? visibles[0]?.id ?? null;

  return (
    <main className="incidents-page mx-auto w-full max-w-7xl flex-1 p-4 sm:p-7" data-proprietaire={estProprietaire || undefined} data-selection={sel ? "active" : undefined}>
      <header className="incidents-entete">
        <div>
          <TitreEcran rubrique="incidents">Incidents</TitreEcran>
          {!estProprietaire && <p>Du signalement à la résolution, gardez le fil de chaque intervention.</p>}
        </div>
        <div className={`incidents-entete-actions${sel ? " max-[1100px]:hidden" : ""}`}>
          <Link href={`${base}/artisans`} className="btn-secondaire">
            <Wrench size={16} aria-hidden="true" /> Carnet d&apos;artisans
          </Link>
          <Link href={`${base}/incidents/nouveau`} className="btn-or">
            <Plus size={17} aria-hidden="true" /> Déclarer un incident
          </Link>
        </div>
      </header>
      <nav aria-label="Filtrer les incidents" className={`incidents-filtres${sel ? " max-[1100px]:hidden" : ""}`}>
        {VUES.map((v) => {
          const Icone = v.cle === "a-traiter" ? TriangleAlert : v.cle === "clos" ? CircleCheck : v.cle === "tous" ? Inbox : Clock3;
          return (
            <Link key={v.cle} href={lien(v.cle, sel && filtres[v.cle as keyof typeof filtres].some((i) => i.id === sel) ? sel : null)} aria-current={vue === v.cle ? "page" : undefined} className="incidents-filtre" data-vue={v.cle}>
              {!estProprietaire && <span className="incidents-filtre-icone"><Icone size={19} aria-hidden="true" /></span>}
              <span className="incidents-filtre-libelle">{v.libelle}<strong>{compteVue(v.cle)}</strong></span>
              <IndicateurLien />
            </Link>
          );
        })}
      </nav>

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
          sous 1100px quand un dossier est ouvert — le dossier remplace la
          liste au lieu d'être rendu dessous, avec un lien retour en tête. */}
      <div className={`split${sel ? " detail-actif" : ""}${!ouvert ? " split-sans-detail" : ""}`}>
        <div className="colonne-liste-split volet-liste">
          {!estProprietaire && <div className="incidents-liste-entete">
            <h2>Les signalements</h2>
            <span>{libelleVue}</span>
          </div>}
          {visibles.length === 0 && vueIllisible(vue) ? (
            /* Ni liste ni état vide : « aucun incident déclaré » serait faux —
               c'est la lecture qui a échoué, pas l'agence qui n'a rien. */
            <div className="p-3.5">
              <EchecLecture quoi={[`les incidents de la vue « ${libelleVue} »`]} />
            </div>
          ) : visibles.length === 0 ? (
            /* Même marge que l'échec de lecture ci-dessus : collé au cadre de
               la colonne, le pointillé doublait son trait plein (24/09). */
            <div className="p-3.5">
              <div className="vide-guide" data-ton="or">
                {incidents.length === 0 ? (
                  <>
                    <p className="titre">Aucun incident déclaré</p>
                    {/* « À traiter », le mot du filtre et de la mention — pas
                        « à qualifier », un troisième nom pour le même état. */}
                    <p className="explication">
                      {estProprietaire ? "Déclarez un problème dans l’un de vos logements. Les signalements de vos locataires apparaissent aussi ici." : "Vos locataires déclarent depuis leur espace et le dossier arrive dans la file « À traiter ». Vous pouvez aussi saisir un incident reçu par téléphone."}
                    </p>
                    <span className="geste">
                      <Link
                        href={`${base}/incidents/nouveau`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Déclarer un incident
                      </Link>
                    </span>
                  </>
                ) : (
                  <>
                    <p className="titre">Rien dans cette vue</p>
                    <p className="explication">
                      {/* comptes.tous, pas incidents.length : le second ne
                          compte que la fenêtre lue. */}
                      {comptes.tous === 1
                        ? "Le dossier est disponible dans un autre filtre."
                        : estProprietaire
                          ? `Vos ${comptes.tous} dossiers sont dans les autres filtres.`
                          : `Les ${comptes.tous} dossiers de l’agence sont dans les autres filtres.`}
                    </p>
                    <span className="geste">
                      <Link href={lien("en-cours", sel)} className="lien-discret">
                        Revenir aux incidents en cours
                      </Link>
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            visibles.map((i) => {
              const lot = premier(i.lot);
              const actif = i.id === ouvert;
              // Ouvert d'office (sans `sel`) : le dossier n'est affiché que sur
              // bureau — sous 1100 px, le rang ne se marque pas comme ouvert.
              const actifBureauSeul = actif && !sel;
              return (
                <Link
                  key={i.id}
                  href={lien(vue, i.id)}
                  className={`rang${actif ? " actif" : ""}${
                    actifBureauSeul
                      ? " max-[1100px]:border-l-transparent max-[1100px]:bg-transparent"
                      : ""
                  }`}
                  aria-current={actif ? "true" : undefined}
                >
                  <span className="incident-rang-reperes">
                    <span>{i.numero}</span>
                    <time dateTime={i.created_at}>{formaterDate(i.created_at)}</time>
                  </span>
                  <b className="incident-rang-titre">{estProprietaire ? lot?.nom ?? "Lot non disponible" : titreIncident(i.categorie)}</b>
                  <span className="incident-rang-lot">{estProprietaire ? titreIncident(i.categorie) : lot?.nom ?? "Lot non disponible"}</span>
                  <span className="incident-rang-etats">
                    {i.urgence === "urgente" && <span className="puce puce-rouge">Urgent</span>}
                    {i.etat !== "clos" && idsAvecDevisADecider.has(i.id) && (
                      <span className={`puce ${estProprietaire ? "puce-ambre" : "puce-rouge"}`}>Devis à décider</span>
                    )}
                    <span className={`incident-statut ${COULEURS_ETAT_INCIDENT[i.etat] ?? "puce puce-grise"}`}>
                      {ETATS_INCIDENT[i.etat] ?? "État à vérifier"}
                    </span>
                    <IndicateurLien />
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                  {!estProprietaire && <span className="incident-rang-suivi">
                    {i.responsable_account_id
                      ? `Suivi par ${emails.get(i.responsable_account_id) ?? "un gestionnaire"}`
                      : "À attribuer"}
                  </span>}
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

        {/* Vue vide : rien à droite — l'invite « Sélectionnez un incident »
            n'avait rien à faire sélectionner. */}
        {ouvert && (
          <div className={`min-w-0${sel ? "" : " max-[1100px]:hidden"}`}>
            {/* Visible sous 1100px seulement (.retour-liste) : la liste est masquée */}
            {sel && (
              <Link href={lien(vue, null)} className="retour-liste mb-2">
                ← Tous les incidents
              </Link>
            )}
            <PaneIncident
              key={ouvert}
              orgId={orgId}
              incidentId={ouvert}
              monCompte={user.id}
              estResponsable={ROLES_RESPONSABLES.includes(role)}
              membres={membres}
            />
          </div>
        )}
      </div>
    </main>
  );
}
