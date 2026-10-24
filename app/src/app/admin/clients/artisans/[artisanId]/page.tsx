import { ConsoleSection } from "@/components/console-section";
import { LectureIndisponible } from "../../../lecture-indisponible";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { METIERS, PIECES_ARTISAN } from "@/app/artisan/libelles";
import { DecisionArtisan } from "@/app/admin/artisans/decision-artisan";
import { RetourDecisionsArtisan } from "@/app/admin/artisans/retour-decisions";
import { BoutonEntrerSession } from "./bouton-entrer";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import {
  initiales,
  LIBELLES_DECISION_ARTISAN,
  LIBELLES_SIRET,
  LIBELLES_STATUT_ARTISAN,
  LIBELLES_VISIBILITE,
} from "@/lib/clients-supervision";

export const metadata = { title: "Artisan" };

/**
 * LA FICHE D'UN ARTISAN, CÔTÉ SUPERVISION.
 *
 * Tout ce que la plateforme sait de lui sur un écran : identité,
 * vérifications, métiers, zones, justificatifs, décisions passées — et les
 * gestes de décision, pour ne pas avoir à repasser par la file d'attente.
 *
 * ET LE BOUTON « ENTRER DANS SA SESSION » (19/09, deuxième demande : « je veux
 * pas une simple vue »). Il n'ouvre pas une copie en lecture : il pose une
 * traversée de supervision, et le portail de l'artisan répond dès lors comme
 * s'il était lui, écritures comprises. Ce que la fiche doit donc dire avant le
 * clic : ce que ça autorise, combien de temps ça dure, et où ça s'inscrit.
 */

type Piece = {
  id: string;
  type: string;
  expire_le: string | null;
  created_at: string;
};

const ETATS_PUCE: Record<string, string> = {
  valide: "puce-loue",
  en_attente: "puce-prep",
  refuse: "puce-rouge",
};

function Info({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="libelle-champ">{libelle}</dt>
      <dd className="text-sm text-[var(--corps)]">{children}</dd>
    </div>
  );
}

export default async function PageFicheArtisan(
  props: PageProps<"/admin/clients/artisans/[artisanId]">
) {
  const { artisanId } = await props.params;
  const supabase = await createClient();

  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const { data: artisan, error } = await supabase
    .from("artisans")
    .select(
      "id, raison_sociale, siret, siret_etat, statut_plateforme, visibilite, email, telephone, created_at, blacklist_globale_le"
    )
    .eq("id", artisanId)
    .maybeSingle();
  if (error) throw new Error("La fiche de cet artisan n'a pas pu être lue.");
  if (!artisan) notFound();
  // Date de décision, échéance de conservation et motif d'exclusion : fermés à la lecture directe (20261014842000),
  // rendus par la fonction de la supervision.
  const { data: decisionsBrutes, error: erreurDecisions } = await supabase.rpc("decisions_artisan_supervision", {
    p_artisan: artisanId,
  });
  if (erreurDecisions) throw new Error("La fiche de cet artisan n'a pas pu être lue.");
  const decisions = ((decisionsBrutes ?? []) as {
    statut_decide_le: string | null;
    purge_prevue_le: string | null;
    blacklist_globale_motif: string | null;
  }[])[0] ?? { statut_decide_le: null, purge_prevue_le: null, blacklist_globale_motif: null };

  const [metiers, zones, pieces, validations, agences] = await Promise.all([
    supabase.from("artisan_metiers").select("metier").eq("artisan_id", artisanId),
    supabase.from("artisan_zones").select("code_postal").eq("artisan_id", artisanId),
    supabase
      .from("artisan_pieces")
      .select("id, type, expire_le, created_at")
      .eq("artisan_id", artisanId)
      .is("retiree_le", null),
    supabase
      .from("artisan_validations")
      .select("id, decision, motif, created_at")
      .eq("artisan_id", artisanId)
      .order("created_at", { ascending: false }),
    supabase
      .from("artisan_agences")
      .select("organization:organizations(id, name, status)")
      .eq("artisan_id", artisanId),
  ]);

  if ([metiers, zones, pieces, validations, agences].some(lecture => lecture.error)) return <main className="p-4 sm:p-7"><LectureIndisponible sujet="Justificatifs et dossier de l’artisan" retour={`/admin/clients/artisans/${artisanId}`} /></main>;

  const listeMetiers = (metiers.data ?? []).map((m) => METIERS[m.metier] ?? m.metier);
  const listeZones = (zones.data ?? []).map((z) => z.code_postal);
  const listePieces = (pieces.data ?? []) as Piece[];
  // Les DEUX assurances en cours : décennale non échue ET RC pro non échue
  // (décision du porteur du 27/09 ; même règle que la base,
  // `artisan_assurance_deposee`).
  const aujourdhui = aujourdhuiParis();
  const decennaleEnCours = listePieces.some((p) => p.type === "decennale" && p.expire_le !== null && p.expire_le >= aujourdhui);
  const rcProEnCours = listePieces.some((p) => p.type === "rc_pro" && (p.expire_le === null || p.expire_le >= aujourdhui));
  const assuranceEnCours = decennaleEnCours && rcProEnCours;
  const assurancesManquantes = [!decennaleEnCours && "décennale", !rcProEnCours && "RC pro"].filter(Boolean).join(" et ");
  const listeAgences = (agences.data ?? []) as unknown as {
    organization: { id: string; name: string; status: string } | null;
  }[];

  return (
    <RetourDecisionsArtisan>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
        <Link href="/admin/clients" className="lien-discret text-sm">
          ← Tous les clients
        </Link>

        <div className="entete-page mt-2 mb-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="pastille-marque flex size-11 shrink-0 items-center justify-center rounded-full text-[15px]"
            >
              {initiales(artisan.raison_sociale)}
            </span>
            {/* Le nom passe à la ligne au lieu d'être coupé (24/09) : c'est le
                sujet de la page. */}
            <div className="min-w-0">
              <TitreEcran rubrique="personnes">{artisan.raison_sociale}</TitreEcran>
              <p className="mono-discret sans-majuscules">
                Artisan · inscrit le {formaterDate(artisan.created_at)}
              </p>
            </div>
          </div>
          <span className={`puce ${ETATS_PUCE[artisan.statut_plateforme] ?? "puce-grise"}`}>
            {LIBELLES_STATUT_ARTISAN[artisan.statut_plateforme] ?? artisan.statut_plateforme}
          </span>
        </div>

        {/* Une validation sans assurance en cours contredit la règle de l'écran
            (audit 25/09, C13). Depuis l'audit console du 27/09, l'écran offre
            l'issue : suspendre la validation (carte « Statut de l'inscription »). */}
        {artisan.statut_plateforme === "valide" && !pieces.error && !assuranceEnCours && (
          <div role="alert" className="mb-6 border border-[var(--warning)] bg-[var(--warning-soft)] p-3.5 text-[13px] text-[var(--warning-soft-foreground)]">
            <b>Anomalie : validé sans ses deux assurances</b> — {assurancesManquantes} en cours
            manquante{assurancesManquantes.includes(" et ") ? "s" : ""} alors que l&apos;inscription est validée.
            Demandez les pièces à l&apos;artisan, ou suspendez la validation ci-dessous.{" "}
            <a href="#statut-inscription" className="underline">Suspendre la validation</a>
          </div>
        )}
        {artisan.blacklist_globale_le && (
          <div
            role="alert"
            className="mb-6 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
          >
            Écarté de la plateforme le {formaterDate(artisan.blacklist_globale_le)}
            {decisions.blacklist_globale_motif ? ` — ${decisions.blacklist_globale_motif}` : "."}
          </div>
        )}

        <ConsoleSection titre="Entreprise" description="Coordonnées, métiers et zones d’intervention." icone="personnes" ouverte>
          <div className="entete-carte">

          </div>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Info libelle="SIRET">
              {artisan.siret ?? "—"} · {LIBELLES_SIRET[artisan.siret_etat] ?? artisan.siret_etat}
            </Info>
            <Info libelle="Métiers">
              {listeMetiers.length > 0 ? listeMetiers.join(" · ") : "Non renseignés"}
            </Info>
            <Info libelle="Email">{artisan.email || "Non renseigné"}</Info>
            <Info libelle="Téléphone">{artisan.telephone || "Non renseigné"}</Info>
            <Info libelle="Visibilité">
              {LIBELLES_VISIBILITE[artisan.visibilite] ?? artisan.visibilite}
            </Info>
            <Info libelle="Zones d'intervention">
              {listeZones.length > 0 ? listeZones.join(" · ") : "Non renseignées"}
            </Info>
          </dl>
          {/* Le motif de la dernière décision ne se répète plus ici (24/09) :
              l'historique porte déjà le motif et la date. */}
        </ConsoleSection>

        <ConsoleSection titre="Justificatifs" description="Consulter les pièces avant de décider." icone="documents" ton="vert" ouverte>
          <div className="entete-carte">

            <span className="mono-discret">
              {pieces.error ? "indisponibles" : `${listePieces.length}`}
            </span>
          </div>
          {pieces.error ? (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              Les justificatifs sont indisponibles. Ne décidez pas sans les avoir relus.
            </p>
          ) : listePieces.length === 0 ? (
            <p className="text-sm text-[var(--texte-secondaire)]">
              Aucune pièce déposée. Une inscription se valide avec une décennale
              ET une RC pro en cours.
            </p>
          ) : (
            <ul className="space-y-2">
              {listePieces.map((p) => (
                <li key={p.id} className="text-sm">
                  <a
                    href={`/admin/artisans/pieces/${p.id}/fichier`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lien-discret"
                  >
                    Ouvrir {PIECES_ARTISAN[p.type] ?? p.type}
                  </a>
                  <span className="ml-2 text-[var(--texte-secondaire)]">
                    {p.expire_le ? `échéance ${formaterDate(p.expire_le)}` : "sans échéance"}
                    {` · déposée le ${formaterDate(p.created_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ConsoleSection>

        <ConsoleSection titre="Agences clientes" description="Agences qui sollicitent cet artisan." icone="personnes">
          <div className="entete-carte">

            <span className="mono-discret">{agences.error ? "—" : listeAgences.length}</span>
          </div>
          {/* Tout le rang est le lien (24/09) : seul le nom réagissait au clic,
              le reste de la largeur était inerte. La liste commune pose le
              filet entre deux rangs, jamais sous le dernier. */}
          {listeAgences.length === 0 ? (
            <p className="text-sm text-[var(--texte-secondaire)]">
              Aucune agence ne l&apos;a encore sollicité.
            </p>
          ) : (
            <div className="colonne-liste">
              {listeAgences.map(
                (a) =>
                  a.organization && (
                    <Link
                      key={a.organization.id}
                      href={`/admin/organisations/${a.organization.id}`}
                      className="rang"
                    >
                      <span className="min-w-0 flex-1 text-[14px] text-[var(--corps)]">
                        {a.organization.name}
                      </span>
                      <span
                        className={`puce ${
                          a.organization.status === "active"
                            ? "puce-loue"
                            : a.organization.status === "essai"
                              ? "puce-prep"
                              : a.organization.status === "suspendue"
                                ? "puce-rouge"
                                : "puce-grise"
                        }`}
                      >
                        {LIBELLES_STATUT_ORGANISATION[a.organization.status] ?? a.organization.status}
                      </span>
                    </Link>
                  )
              )}
            </div>
          )}
        </ConsoleSection>

        <ConsoleSection id="statut-inscription" titre="Inscription de l’artisan" description="Examiner les justificatifs puis prendre une décision." icone="securite" ton="ambre" ouverte>
          {/* « Décider » seulement quand une décision est possible (24/09) :
              pour un artisan validé, la carte ne propose aucun geste. */}
          <div className="entete-carte">

          </div>
          <p className="mesure-lecture mb-4 text-sm text-[var(--texte-secondaire)]">
            La validation appartient à Gerimmo. Elle ne modifie ni la visibilité
            choisie par l&apos;artisan, ni les contrôles d&apos;assurance
            appliqués à chaque intervention.
          </p>
          {artisan.siret_etat !== "verifie" && (
            <div className="mb-4 border border-[var(--filet)] p-3">
              <DecisionArtisan artisanId={artisan.id} operation="verifier_siret" />
            </div>
          )}
          {artisan.statut_plateforme === "en_attente" ? (
            <>
              <DecisionArtisan
                artisanId={artisan.id}
                operation="validation"
                siretVerifie={artisan.siret_etat === "verifie"}
              />
              <details className="mt-4 border-t border-[var(--filet)] pt-3">
                <summary className="cursor-pointer text-sm">Refuser cette inscription</summary>
                <div className="mt-3">
                  <DecisionArtisan artisanId={artisan.id} operation="refus" />
                </div>
              </details>
            </>
          ) : artisan.statut_plateforme === "refuse" ? (
            <DecisionArtisan artisanId={artisan.id} operation="remise_en_attente" />
          ) : (
            <>
              <p className="text-sm text-[var(--texte-secondaire)]">
                Inscription validée
                {decisions.statut_decide_le ? ` le ${formaterDate(decisions.statut_decide_le)}` : ""}.
              </p>
              {/* Le geste de contrôle (audit console 27/09) : suspendre, motivé, confirmé, journalisé. */}
              <details className="mt-4 border-t border-[var(--filet)] pt-3" open={!assuranceEnCours && !pieces.error}>
                <summary className="cursor-pointer text-sm">Suspendre la validation</summary>
                <div className="mt-3">
                  <DecisionArtisan artisanId={artisan.id} operation="suspension" />
                </div>
              </details>
            </>
          )}
          {decisions.purge_prevue_le && (
            <p className="mt-3 text-xs text-[var(--texte-secondaire)]">
              Sans suite, échéance de conservation prévue le{" "}
              {formaterDate(decisions.purge_prevue_le)}.
            </p>
          )}
        </ConsoleSection>

        {validations.data && validations.data.length > 0 && (
          <ConsoleSection titre="Historique des décisions" description="Validations, refus et leurs motifs." icone="historique">
            <div className="entete-carte">

            </div>
            <ul className="space-y-3">
              {validations.data.map((v) => (
                <li key={v.id} className="border-t border-[var(--filet)] pt-3 text-sm first:border-t-0 first:pt-0">
                  <p>
                    <b>{LIBELLES_DECISION_ARTISAN[v.decision] ?? LIBELLES_STATUT_ARTISAN[v.decision] ?? "Décision enregistrée"}</b>
                    {` · ${formaterDate(v.created_at)}`}
                  </p>
                  {v.motif && (
                    <p className="mt-1 whitespace-pre-wrap text-[var(--texte-secondaire)]">
                      {v.motif}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </ConsoleSection>
        )}

        <ConsoleSection titre="Consulter l’espace artisan" description="Accès de supervision et traçabilité." icone="securite" ton="violet">
          <div className="entete-carte">

            <span className="puce puce-rouge">30 minutes</span>
          </div>
          <p className="mesure-lecture mb-4 text-sm text-[var(--texte-secondaire)]">
            Ouvrez son portail pour comprendre une difficulté, en lecture seule.
            L’accès dure trente minutes ; son motif, son ouverture et sa fermeture
            sont enregistrés avec votre identité.
          </p>
          <BoutonEntrerSession artisanId={artisan.id} nom={artisan.raison_sociale} />
        </ConsoleSection>
      </main>
    </RetourDecisionsArtisan>
  );
}
