import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import { formaterDate } from "@/lib/ged";
import {
  familleOrganisation,
  initiales,
  LIBELLES_STATUT_ARTISAN,
  LIBELLES_SIRET,
  trierArtisans,
} from "@/lib/clients-supervision";

// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata = { title: "Agences, bailleurs et artisans — Gerimmo" };

/**
 * LES CLIENTS, EN UN SEUL ÉCRAN (demande du porteur du projet, 19/09).
 *
 * « Lorsque je clique sur clients, je veux avoir une partie avec les artisans
 * (ceux en attente de validation en évidence), une partie agences et une
 * partie propriétaires bailleurs. »
 *
 * Avant : les agences et les propriétaires étaient mêlés en bas de la page de
 * supervision, sans distinction de famille, et les artisans vivaient dans un
 * écran nommé d'après une file d'attente (« Inscriptions artisan »). Rien ne
 * répondait à « qui sont nos clients ». L'entrée de barre s'appelle désormais
 * « Clients » et mène ici ; `/admin/artisans` reste l'écran de DÉCISION, où
 * l'on valide et refuse, et cette page y conduit.
 */

type Organisation = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  city: string | null;
  email_contact: string | null;
  essai_fin: string | null;
  created_at: string;
};

type Artisan = {
  id: string;
  raison_sociale: string;
  siret: string | null;
  siret_etat: string;
  statut_plateforme: string;
  email: string | null;
  telephone: string | null;
  created_at: string;
};

function PuceStatutOrg({ statut }: { statut: string }) {
  return (
    <span
      className={`puce ${
        statut === "active"
          ? "puce-loue"
          : statut === "essai"
            ? "puce-prep"
            : statut === "suspendue"
              ? "puce-rouge"
              : "puce-grise"
      }`}
    >
      {LIBELLES_STATUT_ORGANISATION[statut] ?? statut}
    </span>
  );
}

function LigneClient({
  href,
  nom,
  detail,
  puce,
  enEvidence = false,
}: {
  href: string;
  nom: string;
  detail: string;
  puce: React.ReactNode;
  enEvidence?: boolean;
}) {
  return (
    // Le rang commun de la console (24/09) : même survol, même liseré, même
    // filet que les autres listes. Le liseré or reste pour ce qui attend.
    <Link
      href={href}
      className={`rang ${enEvidence ? "border-l-[var(--or)]" : ""}`}
    >
      <span
        aria-hidden
        className="pastille-marque flex size-9 shrink-0 items-center justify-center rounded-full text-[12px]"
      >
        {initiales(nom)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-[var(--corps)]">{nom}</span>
        <span className="mono-discret sans-majuscules block">{detail}</span>
      </span>
      <span className="shrink-0">{puce}</span>
    </Link>
  );
}

function Section({
  titre,
  compte,
  enTete,
  children,
}: {
  titre: string;
  compte: string;
  enTete?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section-ecran">
      <div className="entete-carte mb-3">
        <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">{titre}</h2>
        <span className="mono-discret">{compte}</span>
      </div>
      {enTete}
      {children}
    </section>
  );
}

function Vide({ titre, explication }: { titre: string; explication: string }) {
  return (
    <div className="vide-guide">
      <p className="titre">{titre}</p>
      <p className="explication">{explication}</p>
    </div>
  );
}

export default async function PageClients() {
  const supabase = await createClient();

  // Le layout /admin a déjà vérifié la supervision ; la RLS reste la garde de
  // fond. On lit `error` : une liste de clients qui affiche zéro parce qu'une
  // requête a échoué ferait croire qu'on n'a plus de clients.
  const [orgs, artisansBruts] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, status, type, city, email_contact, essai_fin, created_at")
      .order("name"),
    supabase
      .from("artisans")
      .select("id, raison_sociale, siret, siret_etat, statut_plateforme, email, telephone, created_at")
      .order("raison_sociale"),
  ]);

  const organisations = (orgs.data ?? []) as Organisation[];
  const agences = organisations.filter((o) => familleOrganisation(o.type) === "agence");
  const proprietaires = organisations.filter(
    (o) => familleOrganisation(o.type) === "proprietaire"
  );
  const artisans = trierArtisans((artisansBruts.data ?? []) as Artisan[]);
  const enAttente = artisans.filter((a) => a.statut_plateforme === "en_attente");

  const enEchec = [orgs.error, artisansBruts.error].filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h1>Agences, bailleurs et artisans</h1>
          <p className="mt-2 text-sm text-[var(--texte-secondaire)]">
            Les agences et les propriétaires bailleurs sont des clients de
            l&apos;abonnement ; les artisans sont des inscrits dont
            l&apos;entreprise se vérifie. Chaque fiche porte ce qu&apos;on sait
            d&apos;eux.
          </p>
        </div>
        <Link href="/admin/organisations/nouvelle" className="btn-or">
          Ouvrir une organisation
        </Link>
      </div>

      {enEchec.length > 0 && (
        <div
          role="alert"
          className="mb-6 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
        >
          {enEchec.length} lecture{enEchec.length > 1 ? "s" : ""} de cette page
          {enEchec.length > 1 ? " ont" : " a"} échoué : la liste est incomplète.
          Rechargez — si elle ne revient pas, c&apos;est la base qui ne répond
          pas.
        </div>
      )}

      {/* LES ARTISANS D'ABORD, ET LES EN-ATTENTE EN TÊTE : c'est la seule
          famille qui porte une file de décisions, et un dossier qui attend
          depuis dix jours est un artisan qui ne travaille pas. */}
      <Section
        titre="Artisans"
        compte={
          artisansBruts.error
            ? "indisponible"
            : `${artisans.length} inscrit${artisans.length > 1 ? "s" : ""}`
        }
        enTete={
          enAttente.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-l-[3px] border-l-[var(--or)] bg-[var(--or-clair)]/30 p-3">
              <p className="text-[13px] text-[var(--corps)]">
                <b>
                  {enAttente.length} inscription{enAttente.length > 1 ? "s" : ""} en
                  attente de validation
                </b>{" "}
                — vérifiez le SIRET et les justificatifs avant de décider.
              </p>
              <Link href="/admin/artisans" className="lien-discret text-[12.5px]">
                Examiner les inscriptions →
              </Link>
            </div>
          ) : null
        }
      >
        {artisansBruts.error ? (
          <p role="alert" className="vide">
            La liste des artisans est indisponible. Rechargez la page.
          </p>
        ) : artisans.length === 0 ? (
          <Vide
            titre="Aucun artisan inscrit"
            explication="Les artisans s'inscrivent eux-mêmes depuis le site ; leur dossier arrive ici pour vérification."
          />
        ) : (
          <div className="colonne-liste">
            {artisans.map((a) => (
              <LigneClient
                key={a.id}
                href={`/admin/clients/artisans/${a.id}`}
                nom={a.raison_sociale}
                detail={`${LIBELLES_SIRET[a.siret_etat] ?? a.siret_etat} · inscrit le ${formaterDate(a.created_at)}`}
                enEvidence={a.statut_plateforme === "en_attente"}
                puce={
                  <span
                    className={`puce ${
                      a.statut_plateforme === "valide"
                        ? "puce-loue"
                        : a.statut_plateforme === "en_attente"
                          ? "puce-prep"
                          : "puce-rouge"
                    }`}
                  >
                    {LIBELLES_STATUT_ARTISAN[a.statut_plateforme] ?? a.statut_plateforme}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        titre="Agences"
        compte={orgs.error ? "indisponible" : `${agences.length} agence${agences.length > 1 ? "s" : ""}`}
      >
        {orgs.error ? (
          <p role="alert" className="vide">
            La liste des agences est indisponible. Rechargez la page.
          </p>
        ) : agences.length === 0 ? (
          <Vide
            titre="Aucune agence"
            explication="Une agence s'ouvre ici après contrat — le bouton « Ouvrir une organisation » en haut de cet écran."
          />
        ) : (
          <div className="colonne-liste">
            {agences.map((o) => (
              <LigneClient
                key={o.id}
                href={`/admin/organisations/${o.id}`}
                nom={o.name}
                detail={[
                  o.city,
                  o.email_contact,
                  o.status === "essai" && o.essai_fin
                    ? `essai jusqu'au ${formaterDate(o.essai_fin)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || `cliente depuis le ${formaterDate(o.created_at)}`}
                puce={<PuceStatutOrg statut={o.status} />}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        titre="Propriétaires bailleurs"
        compte={orgs.error ? "indisponible" : `${proprietaires.length} propriétaire${proprietaires.length > 1 ? "s" : ""}`}
      >
        {orgs.error ? (
          <p role="alert" className="vide">
            La liste des propriétaires est indisponible. Rechargez la page.
          </p>
        ) : proprietaires.length === 0 ? (
          <Vide
            titre="Aucun propriétaire bailleur"
            explication="Un propriétaire ouvre son espace lui-même depuis le site : son organisation naît à sa première connexion."
          />
        ) : (
          <div className="colonne-liste">
            {proprietaires.map((o) => (
              <LigneClient
                key={o.id}
                href={`/admin/organisations/${o.id}`}
                nom={o.name}
                detail={[
                  o.city,
                  o.email_contact,
                  o.status === "essai" && o.essai_fin
                    ? `essai jusqu'au ${formaterDate(o.essai_fin)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || `client depuis le ${formaterDate(o.created_at)}`}
                puce={<PuceStatutOrg statut={o.status} />}
              />
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}
