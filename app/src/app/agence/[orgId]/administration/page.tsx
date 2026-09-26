import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { nomComplet } from "@/lib/roles-personnes";
import {
  EncadreLectureImpossible,
  EnteteReglages,
  statutAbonnement,
} from "../profil/famille-reglages";

export const metadata = { title: "Administration — Gerimmo" };

// Administration (maquette v6, admin d'agence) : les membres de l'agence et
// leurs portefeuilles (mandats confiés), l'abonnement — honnête : la
// facturation Stripe arrive au S11, l'invitation d'agents et la délégation de
// portefeuille au chantier rôles (S9b). Le journal d'audit complet reste au
// super admin (RLS) — chaque geste sensible y est déjà tracé.
//
// Audit 09/09 : les portefeuilles se comptent avec la MÊME règle que
// lib/portefeuille.ts (mandats brouillon/à signer/actif/préavis, lignes en
// cours) — l'admin lit le même chiffre que l'agent ; l'abonnement ne compte
// que les lots sous mandat ACTIF, comme sa légende l'affirme.
//
// Relevé 11/09 : l'écran sous-comptait les lots « à confier ». Il ne signalait
// que les mandats SANS titulaire ; ceux confiés à un agent dont l'adhésion
// n'est plus active (agent parti) disparaissaient des deux côtés — aucun
// portefeuille affiché ne les portait, et la phrase « pensez à les confier »
// ne les comptait pas. Un lot est désormais à confier dès qu'aucun membre
// AFFICHÉ ne le tient.
const ETATS_PORTEFEUILLE = ["brouillon", "a_signer", "actif", "preavis"];

export default async function PageAdministration(
  props: PageProps<"/agence/[orgId]/administration">
) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire } = await verifierAccesEspace(orgId);
  if (estProprietaire || role !== "admin_agence") notFound();

  const [
    { data: membres, error: erreurMembres },
    { data: mandats, error: erreurMandats },
    { data: lignes, error: erreurLignes },
    { data: abonnement, error: erreurAbonnement },
    { data: paiementBrut, error: erreurPaiement },
  ] = await Promise.all([
    supabase.rpc("org_membres_gerants", { org: orgId }),
    // Le mandant est lu avec le mandat (24/09) : l'encadré « à confier » nomme
    // les propriétaires concernés et mène à leur fiche, là où se trouve le
    // champ « Confié à ».
    supabase
      .from("mandats")
      .select("id, agent_account_id, etat, person_id, mandant:persons(nom, prenom)")
      .eq("organization_id", orgId)
      .in("etat", ETATS_PORTEFEUILLE),
    supabase
      .from("mandat_lignes")
      .select("mandat_id, lot_id")
      .eq("organization_id", orgId)
      .is("date_fin", null),
    supabase.rpc("etat_abonnement", { p_org: orgId }),
    // L'état du paiement, pour que la puce de la carte « Abonnement » dise où
    // en est l'abonnement et non le statut de l'organisation (24/09).
    supabase.rpc("mon_abonnement", { p_org: orgId }),
  ]);
  // Un échec de lecture ne doit pas se déguiser en agence vide (audit 09/09).
  // Chaque carte le dit pour ce qui la concerne : l'équipe reste lisible même
  // quand les mandats ne le sont pas, et l'inverse.
  const equipeLue = !erreurMembres;
  const portefeuillesLus = !erreurMandats && !erreurLignes;

  type Mandant = { nom: string; prenom: string | null };
  const parMandat = new Map<
    string,
    { agent: string | null; actif: boolean; personId: string; mandant: Mandant | null }
  >();
  for (const m of (mandats ?? []) as unknown as {
    id: string;
    agent_account_id: string | null;
    etat: string;
    person_id: string;
    mandant: Mandant | Mandant[] | null;
  }[]) {
    // Jointure to-one : PostgREST rend un objet, le typage un tableau — on
    // accepte les deux (même lecture que la comptabilité).
    const mandant = Array.isArray(m.mandant) ? (m.mandant[0] ?? null) : m.mandant;
    parMandat.set(m.id, {
      agent: m.agent_account_id,
      actif: m.etat === "actif",
      personId: m.person_id,
      mandant,
    });
  }
  const lotsParAgent = new Map<string, Set<string>>();
  const lotsSousMandat = new Set<string>();
  const lotsSousMandatActif = new Set<string>();
  for (const l of (lignes ?? []) as { mandat_id: string; lot_id: string }[]) {
    const m = parMandat.get(l.mandat_id);
    if (!m) continue;
    lotsSousMandat.add(l.lot_id);
    if (m.actif) lotsSousMandatActif.add(l.lot_id);
    if (m.agent) {
      if (!lotsParAgent.has(m.agent)) lotsParAgent.set(m.agent, new Set());
      lotsParAgent.get(m.agent)!.add(l.lot_id);
    }
  }
  const etatAbonnement = (
    (abonnement ?? []) as {
      statut: string;
      ecriture_ouverte: boolean;
      unites_total: number;
      unites_facturees: number;
    }[]
  )[0];
  const nbLotsFactures = etatAbonnement?.unites_total;
  const paiement = (
    (paiementBrut ?? []) as { paye: boolean; paiement_en_retard: boolean }[]
  )[0];
  const equipe = ((membres ?? []) as { account_id: string; email: string; role: string }[])
    .filter((m) => m.role === "agent" || m.role === "admin_agence")
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
  // Tenu = dans le portefeuille d'un membre effectivement affiché ci-dessous
  const lotsTenus = new Set<string>();
  for (const m of equipe) {
    for (const id of lotsParAgent.get(m.account_id) ?? []) lotsTenus.add(id);
  }
  const lotsAConfier = new Set([...lotsSousMandat].filter((id) => !lotsTenus.has(id)));
  const nbAConfier = lotsAConfier.size;
  // Les propriétaires dont un lot n'est tenu par personne (24/09) : l'encadré
  // disait quoi faire sans dire où — l'admin ouvrait chaque fiche une à une
  // pour trouver le champ « Confié à ». Chaque mandant devient un rang qui
  // mène droit à ce champ, sur sa fiche.
  const aConfierParMandant = new Map<
    string,
    { nom: string; lots: Set<string>; mandatId: string }
  >();
  for (const l of (lignes ?? []) as { mandat_id: string; lot_id: string }[]) {
    if (!lotsAConfier.has(l.lot_id)) continue;
    const m = parMandat.get(l.mandat_id);
    if (!m) continue;
    const entree = aConfierParMandant.get(m.personId) ?? {
      nom: m.mandant ? nomComplet(m.mandant) : "Propriétaire sans nom",
      lots: new Set<string>(),
      mandatId: l.mandat_id,
    };
    entree.lots.add(l.lot_id);
    aConfierParMandant.set(m.personId, entree);
  }
  const mandantsAConfier = [...aConfierParMandant.entries()].sort((a, b) =>
    a[1].nom.localeCompare(b[1].nom, "fr")
  );
  // La puce dit l'état de l'ABONNEMENT (24/09) — elle affichait « active »,
  // le statut de l'organisation, au-dessus d'une agence qui n'avait jamais
  // payé. Sur une lecture en échec, elle se tait.
  const statut =
    erreurAbonnement || erreurPaiement || !etatAbonnement
      ? null
      : statutAbonnement({
          paye: paiement?.paye ?? false,
          essai: etatAbonnement.statut === "essai",
          ferme: !etatAbonnement.ecriture_ouverte,
          enRetard: paiement?.paiement_en_retard ?? false,
          rienAPayer: (etatAbonnement.unites_facturees ?? 0) < 1,
        });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      {/* Sans mention (24/09) : écran propre à l'agence, dont la barre
          latérale et la barre haute portent déjà le nom. */}
      <EnteteReglages titre="Administration">
        Réservé à l&apos;admin d&apos;agence : qui travaille dans
        l&apos;agence et sur quels lots, ce que compte l&apos;abonnement, et
        ce qui est tracé.
      </EnteteReglages>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Équipe &amp; portefeuilles</h3>
          {equipeLue && (
            <span className="mono-discret">
              {equipe.length} membre{equipe.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {!equipeLue ? (
          <EncadreLectureImpossible>
            La liste des membres n&apos;a pas pu être lue — ce n&apos;est pas
            une agence sans personne : rechargez la page dans un instant.
          </EncadreLectureImpossible>
        ) : equipe.length === 0 ? (
          <p className="vide">
            Aucun membre actif dans cette agence. L&apos;invitation d&apos;un agent
            depuis cet écran n&apos;existe pas encore :{" "}
            <Link href="/assistance" className="lien-texte">demandez-la au support</Link>{" "}
            avec son adresse e-mail.
          </p>
        ) : (
          <ul>
            {equipe.map((m) => {
              const nbLots = lotsParAgent.get(m.account_id)?.size ?? 0;
              return (
                <li
                  key={m.account_id}
                  className="ligne-info flex-wrap max-sm:gap-y-1.5"
                >
                  {/* .ligne-info grise son premier enfant : ici c'est le nom
                      du membre, pas un libellé — il reprend la couleur du
                      corps, le rôle reste en appui.
                      24/09 : sur téléphone, l'adresse prend toute la ligne et
                      la puce passe dessous — l'adresse n'est plus coupée au
                      milieu (« …@gerimmo- / demo.fr »). */}
                  <span className="min-w-0 flex-1 break-words !text-foreground max-sm:basis-full">
                    {m.email}
                    <small className="block text-muted-foreground">
                      {m.role === "admin_agence"
                        ? "Admin d'agence — voit tout"
                        : "Agent"}
                    </small>
                  </span>
                  {portefeuillesLus && (m.role === "agent" || nbLots > 0) && (
                    <span className="puce puce-encre shrink-0">
                      {nbLots} lot{nbLots > 1 ? "s" : ""} en portefeuille
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {equipeLue && !portefeuillesLus && (
          <div className="mt-3">
            <EncadreLectureImpossible>
              Les mandats n&apos;ont pas pu être lus : les portefeuilles ne
              sont pas affichés. Personne n&apos;a perdu le sien —
              c&apos;est la lecture qui a échoué.
            </EncadreLectureImpossible>
          </div>
        )}
        {/* Un lot sous mandat que personne ne tient est une action à mener,
            pas une note de bas de page : il sort du gris 12 px. Il exige les
            DEUX lectures : sans la liste des membres, tout lot paraîtrait
            orphelin — l'alerte serait celle d'un écran en panne. */}
        {equipeLue && portefeuillesLus && nbAConfier > 0 && (
          <div className="mt-3 border-l-[3px] border-l-warning bg-warning-soft p-3">
            {/* 24/09 : le vocabulaire du formulaire où se fait le geste
                (« Confié à », fiche du propriétaire dans Personnes), et non
                plus « titulaire » / « fiche du mandant », introuvables. */}
            <p className="text-sm text-warning-soft-foreground">
              {nbAConfier} lot{nbAConfier > 1 ? "s" : ""} sous mandat
              {nbAConfier > 1 ? " ne figurent" : " ne figure"} dans le
              portefeuille d&apos;aucun membre ci-dessus — mandat laissé à
              «&nbsp;Toute l&apos;agence&nbsp;», ou confié à un agent parti. Un
              mandat se confie à un agent depuis la fiche du propriétaire
              (Personnes), champ «&nbsp;Confié à&nbsp;».
            </p>
            {mandantsAConfier.length > 0 && (
              <ul className="mt-2">
                {mandantsAConfier.map(([personId, p]) => (
                  <li key={personId}>
                    {/* Tout le rang mène au champ « Confié à » du mandat,
                        sur la fiche du propriétaire (24/09). */}
                    <Link
                      href={`/agence/${orgId}/personnes/${personId}#m-titulaire-${p.mandatId}`}
                      className="ligne-info -mx-2 items-center rounded-md px-2 hover:bg-[var(--survol)]"
                    >
                      <span className="min-w-0 !text-foreground">{p.nom}</span>
                      <span className="shrink-0 text-sm text-[var(--bleu)]">
                        {p.lots.size} lot{p.lots.size > 1 ? "s" : ""} · Confier{" "}
                        <span aria-hidden>→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mesure-lecture mt-4 text-sm text-muted-foreground">
          Le portefeuille d&apos;un agent = les mandats qui lui sont confiés.
        </p>
        {/* 25/09 : « écrivez au support » en pied de carte passait pour une
            consigne alors que c'est un manque du produit. Dit tel quel, avec
            le geste qui marche aujourd'hui (une demande, l'adresse de l'agent)
            et une cible de 44 px. L'invitation sur place viendra avec le
            chantier rôles (S9b). */}
        {equipeLue && equipe.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Ajouter un agent ne se fait pas encore ici : envoyez-nous son
              adresse e-mail, l&apos;équipe Gerimmo crée son accès.
            </p>
            <Link href="/assistance" className="btn-secondaire shrink-0">
              Demander l&apos;ajout d&apos;un agent
            </Link>
          </div>
        )}
      </div>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Abonnement de l&apos;agence</h3>
          {statut && (
            <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
          )}
        </div>
        {!erreurAbonnement && nbLotsFactures != null ? (
          <>
            <div className="ligne-info">
              <span>Lots sous mandat actif</span>
              <span className="montant">{nbLotsFactures}</span>
            </div>
            {/* Tout le rang mène à l'abonnement (24/09) — seul le petit lien
                de droite l'était — et il porte le nom de l'écran visé. */}
            <Link
              href={`/agence/${orgId}/abonnement`}
              className="ligne-info items-center hover:bg-[var(--survol)]"
            >
              <span>Abonnement</span>
              <span className="lien-discret">
                Voir la formule et le tarif <span aria-hidden>→</span>
              </span>
            </Link>
          </>
        ) : (
          <EncadreLectureImpossible>
            Les mandats n&apos;ont pas pu être lus : le nombre de lots facturés
            reste inconnu — mieux vaut le taire que l&apos;annoncer à zéro.
          </EncadreLectureImpossible>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Les mandats en préavis restent comptés tant qu’ils courent.
        </p>
      </div>

      {/* 25/09 : plus de carte « Journal d'audit » — une carte sans bouton ni
          lien, trois lignes pour dire qu'on ne peut rien y faire. L'information
          reste, en note de page, tant que le journal de l'organisation n'est
          pas consultable ici. */}
      <p className="mesure-lecture text-sm text-muted-foreground">
        Chaque geste sensible (versement, clôture comptable, mandat confié à un
        autre agent, validation de pièce…) est horodaté et tracé — qui, quoi,
        sur quel objet. La consultation de ce journal est aujourd&apos;hui
        réservée à l&apos;équipe Gerimmo ; demandez-la depuis{" "}
        <Link href="/assistance" className="lien-texte">Aide et retours</Link>.
      </p>
    </main>
  );
}
