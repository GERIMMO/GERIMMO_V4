import Link from "next/link";
import { TitreEcran } from "@/components/titre-ecran";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { identifiantsOpposes, libelleTranche, STATUTS_LISTE_ATTENTE, type StatutListeAttente } from "@/lib/liste-attente-agences";
import { createClient } from "@/lib/supabase/server";
import { BoutonsStatutAgence } from "./boutons-statut";

export const metadata = { title: "Liste d’attente des agences" };

type Inscription = {
  id: string;
  agence: string;
  contact: string;
  email: string;
  telephone: string | null;
  code_postal: string;
  nb_lots: string;
  message: string | null;
  source: string | null;
  statut: string;
  contactee_le: string | null;
  created_at: string;
};

const PUCES: Record<StatutListeAttente, string> = {
  en_attente: "puce-prep",
  contactee: "puce-loue",
  convertie: "puce-encre",
  retiree: "puce-grise",
};
// Un statut que la base connaîtrait avant l'écran se traite comme une attente : il garde ses gestes.
const statutConnu = (s: string): StatutListeAttente =>
  Object.hasOwn(STATUTS_LISTE_ATTENTE, s) ? (s as StatutListeAttente) : "en_attente";
/** Au-delà, ou sur plusieurs lignes, le message se replie : la liste reste balayable. */
const MESSAGE_REPLIE = 240;

// Les agences inscrites sur la liste d'attente depuis la page /agences du site vitrine (20/10/2026). Rien ne leur
// est envoyé automatiquement : le dirigeant les recontacte lui-même à l'ouverture de l'offre, puis note ici où il
// en est. Modèle : admin/devis/page.tsx.
export default async function PageListeAttenteAgences() {
  const supabase = await createClient();
  // Le proxy et le layout /admin ont déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  const { data, error } = await supabase
    .from("liste_attente_agences")
    .select("id, agence, contact, email, telephone, code_postal, nb_lots, message, source, statut, contactee_le, created_at")
    .order("created_at", { ascending: false });
  // Un échec de lecture ne se déguise jamais en liste vide (audit 09/09).
  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
        <TitreEcran rubrique="entreprise">Liste d’attente des agences</TitreEcran>
        <div className="vide mt-4">
          Impossible de charger la page pour l&apos;instant — rechargez dans un instant.
        </div>
      </main>
    );
  }
  const inscriptions = (data ?? []) as Inscription[];
  // Plan de conformité du 23/10 (R45, relecture du 24/10) : aucune écriture à une adresse opposée (inscription retirée,
  // ou « Stop » comme prospect). Sans ce contrôle, aucun lien d'écriture ni « contactée ».
  const controle = await supabase.rpc("inscriptions_agences_opposees");
  const controleDisponible = !controle.error;
  const opposees = identifiantsOpposes(controle.data);
  // Même lecture que les gestes et la puce : un statut inconnu de l'écran compte comme une attente.
  const enAttente = inscriptions.filter((i) => statutConnu(i.statut) === "en_attente").length;
  const total = inscriptions.length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <TitreEcran rubrique="entreprise">Liste d’attente des agences</TitreEcran>
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-discret">
            {total === 0
              ? "Aucune agence inscrite"
              : `${enAttente} en attente · ${total} inscrite${total > 1 ? "s" : ""}`}
          </span>
          {/* Sans attribut `download` : la route pose Content-Disposition: attachment pour le fichier, et son refus (403)
              ou sa panne (503, texte en français) se lisent alors dans l'onglet au lieu d'un téléchargement échoué. */}
          {total > 0 && (
            <form action="/admin/liste-attente/export" method="get" className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-secondaire">Exporter en CSV</button>
            </form>
          )}
        </div>
      </div>

      <p className="mb-5 text-sm text-muted-foreground">
        Les agences de gestion locative qui ont laissé leurs coordonnées sur la page « Agences » du site vitrine, en
        attendant l’ouverture de l’offre qui leur est destinée. Rien ne leur est envoyé automatiquement, ni accusé de
        réception ni relance : à l’ouverture, vous les recontactez vous-même, puis vous notez ici où vous en êtes.
        L’export CSV exclut les agences retirées et les adresses qui se sont opposées à nos messages. Il est réservé à la
        supervision et laisse une ligne au journal d’audit.
      </p>
      {!controleDisponible && total > 0 && (
        <p role="alert" className="err mb-5">
          Le contrôle des oppositions est indisponible : n’écrivez à aucune agence avant de l’avoir vérifié. Rechargez dans un instant.
        </p>
      )}

      {total === 0 ? (
        <div className="vide-guide">
          <p className="titre">Aucune agence inscrite</p>
          <p className="explication">
            Les inscriptions arrivent depuis la page « Agences » du site vitrine : nom de l’agence, contact, parc géré
            et message libre.
          </p>
          <div className="geste">
            <Link href="/agences" target="_blank" className="btn-secondaire">
              Voir la page sur le site
            </Link>
          </div>
        </div>
      ) : (
        <div className="colonne-liste">
          {inscriptions.map((i) => {
            const statut = statutConnu(i.statut);
            const clos = statut === "convertie" || statut === "retiree";
            const replie = !!i.message && (i.message.length > MESSAGE_REPLIE || i.message.includes("\n"));
            const opposee = opposees.has(i.id);
            const ecrire = controleDisponible && !opposee;
            return (
              <div
                id={`agence-${i.id}`}
                key={i.id}
                className={`scroll-mt-24 rang flex-col items-stretch gap-0 ${clos ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm">{i.agence}</b>
                  <span className="text-sm text-muted-foreground">— {libelleTranche(i.nb_lots)}</span>
                  <span className={`puce ${PUCES[statut]}`}>{STATUTS_LISTE_ATTENTE[statut]}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Inscrite le {formaterDateHeureParis(i.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  {i.contact} ·{" "}
                  {ecrire ? (
                    <a href={`mailto:${i.email}`} className="lien-discret">
                      {i.email}
                    </a>
                  ) : (
                    <span className="break-all">{i.email}</span>
                  )}
                  {i.telephone && <span className="text-muted-foreground"> · {i.telephone}</span>}
                  <span className="text-muted-foreground"> · {i.code_postal}</span>
                </p>
                {i.message &&
                  (replie ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-sm">Lire le message</summary>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{i.message}</p>
                    </details>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{i.message}</p>
                  ))}
                {opposee && (
                  <span role="note" className="mt-1.5 text-xs">Opposition enregistrée : ne lui écrivez pas.</span>
                )}
                {i.contactee_le && (
                  <span className="mt-1.5 text-xs text-muted-foreground">
                    Contactée le {formaterDateHeureParis(i.contactee_le)}
                  </span>
                )}
                <div className="mt-2">
                  <BoutonsStatutAgence id={i.id} statut={statut} contactable={ecrire} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{NOTE_FUSEAU}</p>
    </main>
  );
}
