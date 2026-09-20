import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";
import { METIERS, PIECES_ARTISAN } from "@/app/artisan/libelles";
import { DecisionArtisan } from "@/app/admin/artisans/decision-artisan";
import { RetourDecisionsArtisan } from "@/app/admin/artisans/retour-decisions";
import { BoutonEntrerSession } from "./bouton-entrer";
import {
  initiales,
  LIBELLES_SIRET,
  LIBELLES_STATUT_ARTISAN,
  LIBELLES_VISIBILITE,
} from "@/lib/clients-supervision";

export const metadata = { title: "Artisan — Console Gerimmo" };

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
      "id, raison_sociale, siret, siret_etat, statut_plateforme, statut_motif, statut_decide_le, visibilite, email, telephone, created_at, purge_prevue_le, blacklist_globale_le, blacklist_globale_motif"
    )
    .eq("id", artisanId)
    .maybeSingle();
  if (error) throw new Error("La fiche de cet artisan n'a pas pu être lue.");
  if (!artisan) notFound();

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
      .select("organization:organizations(id, name)")
      .eq("artisan_id", artisanId),
  ]);

  const listeMetiers = (metiers.data ?? []).map((m) => METIERS[m.metier] ?? m.metier);
  const listeZones = (zones.data ?? []).map((z) => z.code_postal);
  const listePieces = (pieces.data ?? []) as Piece[];
  const listeAgences = (agences.data ?? []) as unknown as {
    organization: { id: string; name: string } | null;
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
            <div className="min-w-0">
              <h1 className="truncate">{artisan.raison_sociale}</h1>
              <p className="mono-discret sans-majuscules !text-[10px]">
                Artisan · inscrit le {formaterDate(artisan.created_at)}
              </p>
            </div>
          </div>
          <span className={`puce ${ETATS_PUCE[artisan.statut_plateforme] ?? "puce-grise"}`}>
            {LIBELLES_STATUT_ARTISAN[artisan.statut_plateforme] ?? artisan.statut_plateforme}
          </span>
        </div>

        {artisan.blacklist_globale_le && (
          <div
            role="alert"
            className="mb-6 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
          >
            Écarté de la plateforme le {formaterDate(artisan.blacklist_globale_le)}
            {artisan.blacklist_globale_motif ? ` — ${artisan.blacklist_globale_motif}` : "."}
          </div>
        )}

        <section className="loc-carte">
          <div className="entete-carte">
            <h3>Identité de l&apos;entreprise</h3>
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
          {artisan.statut_motif && (
            <p className="mesure-lecture mt-4 border-l-[3px] border-l-[var(--filet)] pl-3 text-sm text-[var(--texte-secondaire)]">
              Motif de la dernière décision
              {artisan.statut_decide_le ? ` (${formaterDate(artisan.statut_decide_le)})` : ""} :{" "}
              {artisan.statut_motif}
            </p>
          )}
        </section>

        <section className="loc-carte mt-4">
          <div className="entete-carte">
            <h3>Justificatifs</h3>
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
              Aucune pièce déposée. Une inscription sans décennale ni RC pro ne
              peut pas être validée.
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
        </section>

        <section className="loc-carte mt-4">
          <div className="entete-carte">
            <h3>Agences qui le sollicitent</h3>
            <span className="mono-discret">{agences.error ? "—" : listeAgences.length}</span>
          </div>
          {listeAgences.length === 0 ? (
            <p className="text-sm text-[var(--texte-secondaire)]">
              Aucune agence ne l&apos;a encore sollicité.
            </p>
          ) : (
            <ul className="space-y-1">
              {listeAgences.map(
                (a) =>
                  a.organization && (
                    <li key={a.organization.id} className="ligne-info">
                      <Link
                        href={`/admin/organisations/${a.organization.id}`}
                        className="lien-discret"
                      >
                        {a.organization.name}
                      </Link>
                    </li>
                  )
              )}
            </ul>
          )}
        </section>

        <section className="loc-carte mt-4">
          <div className="entete-carte">
            <h3>Décider</h3>
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
            <p className="text-sm text-[var(--texte-secondaire)]">
              Inscription validée
              {artisan.statut_decide_le ? ` le ${formaterDate(artisan.statut_decide_le)}` : ""}.
            </p>
          )}
          {artisan.purge_prevue_le && (
            <p className="mt-3 text-xs text-[var(--texte-secondaire)]">
              Sans suite, échéance de conservation prévue le{" "}
              {formaterDate(artisan.purge_prevue_le)}.
            </p>
          )}
        </section>

        {validations.data && validations.data.length > 0 && (
          <section className="loc-carte mt-4">
            <div className="entete-carte">
              <h3>Historique des décisions</h3>
            </div>
            <ul className="space-y-3">
              {validations.data.map((v) => (
                <li key={v.id} className="border-t border-[var(--filet)] pt-3 text-sm first:border-t-0 first:pt-0">
                  <p>
                    <b>{LIBELLES_STATUT_ARTISAN[v.decision] ?? v.decision}</b>
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
          </section>
        )}

        <section className="loc-carte mt-4">
          <div className="entete-carte">
            <h3>Entrer dans sa session</h3>
            <span className="puce puce-rouge">30 minutes</span>
          </div>
          <p className="mesure-lecture mb-3 text-sm text-[var(--texte-secondaire)]">
            Vous ouvrez son portail tel qu&apos;il le voit, et vous pouvez y{" "}
            <b>agir comme lui</b> : accepter une sollicitation, déposer un
            devis, rendre un compte d&apos;intervention. Ce sont des engagements
            pris dans l&apos;espace d&apos;un tiers.
          </p>
          <p className="mesure-lecture mb-4 text-sm text-[var(--texte-secondaire)]">
            La traversée est <b>bornée à trente minutes</b>, affichée en rouge
            en haut de chaque écran du portail, et inscrite au journal
            d&apos;audit à l&apos;ouverture comme à la fermeture. Votre compte
            reste l&apos;auteur de tout ce qui est écrit : aucune session
            n&apos;est émise au nom de l&apos;artisan, rien n&apos;est
            indiscernable de ses propres gestes.
          </p>
          <BoutonEntrerSession artisanId={artisan.id} nom={artisan.raison_sociale} />
        </section>
      </main>
    </RetourDecisionsArtisan>
  );
}
