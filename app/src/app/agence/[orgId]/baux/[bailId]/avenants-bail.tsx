import type { SupabaseClient } from "@supabase/supabase-js";
import { RubriqueDossier } from "@/components/rubrique-dossier";
import { aujourdhuiParis, eur, formaterDate } from "@/lib/ged";
import {
  LIBELLE_ETAT_AVENANT,
  changementsAvenant,
  datesEffetProposees,
  etatAvenantBail,
  libelleMois,
  libellePremierDuMois,
  type AvenantBail,
} from "@/lib/avenants-bail";
import { deElide } from "@/lib/elision";
import { GenererAvenant } from "./generer-avenant";
import { GestesAvenantSigne } from "./gestes-avenant-signe";

const COLONNES =
  "id, objet, signe_le, date_effet, ancien_loyer_hc, nouveau_loyer_hc, anciennes_charges, nouvelles_charges, document_id, enregistre_le, applique_le, annule_le, annulation_motif";

type BailPourAvenant = {
  etat: string;
  loyer_hc: number | string | null;
  charges: number | string | null;
  charges_mode?: string | null;
  date_debut: string | null;
  date_fin: string | null;
  /** Bail repris en cours : le mois à partir duquel Gerimmo appelle ses loyers. */
  loyers_suivis_depuis?: string | null;
};

function CarteAvenant({ a, base, libelleCharges }: { a: AvenantBail; base: string; libelleCharges: string }) {
  const etat = etatAvenantBail(a);
  return (
    <li data-avenant={a.id} data-etat-avenant={etat} className="rounded-[var(--rayon-carte)] border border-border p-3 text-sm">
      <p className="font-medium">{a.objet}</p>
      <p className="mt-1 text-muted-foreground">
        {LIBELLE_ETAT_AVENANT[etat]} · signé le {formaterDate(a.signe_le)} · effet au {libellePremierDuMois(a.date_effet)}
      </p>
      <ul className="mt-2 space-y-0.5">
        {changementsAvenant(a, (n) => eur(n), libelleCharges).map((ligne) => <li key={ligne}>{ligne}</li>)}
      </ul>
      {etat === "annule" && a.annulation_motif && (
        <p className="mt-2 text-muted-foreground">Annulé le {formaterDate(a.annule_le)} : {a.annulation_motif}</p>
      )}
      <p className="mt-2">
        <a className="lien-discret inline-flex min-h-11 items-center" href={`${base}/documents/${a.document_id}/fichier`} target="_blank" rel="noreferrer">
          Consulter l’avenant signé
        </a>
      </p>
    </li>
  );
}

/**
 * La rubrique « Avenant au bail » de la fiche d'un bail (audit palier 1 du 22/11/2026, P1-14).
 *
 * Avant : un seul geste, « Générer l'avenant (PDF) », et plus rien — l'avenant signé n'était rangé nulle part et le
 * loyer appelé restait celui d'avant. La rubrique porte maintenant les deux temps : préparer le texte à faire signer,
 * puis enregistrer l'avenant signé, dont les nouveaux montants s'appliquent d'eux-mêmes à partir de sa date d'effet.
 *
 * Elle lit seule ce dont elle a besoin (les avenants du bail, le dernier loyer appelé) : une lecture en panne se dit,
 * et retire le formulaire plutôt que de proposer une date que la base refuserait.
 */
export async function RubriqueAvenantsBail({
  supabase,
  orgId,
  bailId,
  base,
  bail,
  lectureSeule = false,
}: {
  supabase: SupabaseClient;
  orgId: string;
  bailId: string;
  base: string;
  bail: BailPourAvenant;
  /** Consultation par la supervision : l'historique se lit, aucun geste n'est proposé. */
  lectureSeule?: boolean;
}) {
  const enCours = bail.etat === "actif" || bail.etat === "preavis";
  if (!enCours && bail.etat !== "termine") return null;

  const [{ data: lignes, error: erreurAvenants }, { data: dernier, error: erreurAppel }] = await Promise.all([
    supabase.from("avenants_bail").select(COLONNES).eq("organization_id", orgId).eq("bail_id", bailId).order("enregistre_le", { ascending: false }),
    supabase.from("appels_loyer").select("periode").eq("organization_id", orgId).eq("bail_id", bailId).order("periode", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const avenants = (lignes ?? []) as AvenantBail[];
  // Un bail terminé sans avenant n'a rien à montrer ici.
  if (!enCours && !erreurAvenants && avenants.length === 0) return null;

  const attente = avenants.find((a) => etatAvenantBail(a) === "en_attente") ?? null;
  const autres = avenants.filter((a) => a !== attente);
  const libelleCharges = bail.charges_mode === "forfait" ? "Forfait de charges" : "Provision pour charges";
  const aujourdhui = aujourdhuiParis();
  const gestes = enCours && !lectureSeule;
  const lecturesCompletes = !erreurAvenants && !erreurAppel;
  const dates = lecturesCompletes
    ? datesEffetProposees({ dernierAppel: (dernier as { periode?: string } | null)?.periode ?? null, dateDebut: bail.date_debut, dateFin: bail.date_fin, suivisDepuis: bail.loyers_suivis_depuis ?? null, aujourdhui })
    : [];
  const resume = attente
    ? `Un avenant s’appliquera au loyer ${deElide(libelleMois(attente.date_effet))}`
    : enCours
      ? "Préparer une modification, puis enregistrer l’avenant signé"
      : "Avenants enregistrés pendant la location";

  // Les intertitres sont des paragraphes en gras, pas des titres : le titre d'une rubrique repliable n'en est pas un
  // non plus, et un <h4> posé là sauterait deux niveaux sous le <h1> de la page (ordre des titres).
  return (
    // Jamais ouverte d'office : une rubrique qui s'ouvre parce qu'un avenant attend se REFERMERAIT d'elle-même dès qu'il
    // est annulé ou appliqué, en emportant le message de confirmation. Son résumé, toujours visible, dit ce qui attend.
    <RubriqueDossier id="avenant" titre="Avenant au bail" resume={resume}>
      {enCours && (
        <section className="space-y-3" aria-labelledby="avenant-preparer">
          <p id="avenant-preparer" className="font-semibold">1. Préparer l’avenant à faire signer</p>
          <GenererAvenant orgId={orgId} bailId={bailId} cheminRetour={`${base}/baux/${bailId}`} />
        </section>
      )}

      {enCours && (
        <section className="space-y-3 border-t border-border pt-4" aria-labelledby="avenant-enregistrer">
          <p id="avenant-enregistrer" className="font-semibold">2. Enregistrer l’avenant signé</p>
          {!lecturesCompletes ? (
            <p role="alert" className="text-sm text-destructive">
              Les avenants de ce bail ne peuvent pas être lus pour le moment : rechargez la page avant d’en enregistrer un.
            </p>
          ) : attente ? (
            <div data-avenant-en-attente className="space-y-2">
              <p className="text-sm">
                <strong>Un avenant attend sa date d’effet.</strong> Il s’appliquera de lui-même au loyer{" "}
                {deElide(libelleMois(attente.date_effet))} ; d’ici là, les loyers restent appelés aux montants actuels.
                Un seul avenant peut attendre à la fois.
              </p>
              <ul className="space-y-2"><CarteAvenant a={attente} base={base} libelleCharges={libelleCharges} /></ul>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Une fois l’avenant signé par le bailleur et le locataire, enregistrez-le ici avec sa pièce. S’il modifie
                le loyer ou les charges, les nouveaux montants s’appliquent aux loyers appelés à partir de sa date
                d’effet — jamais aux loyers déjà appelés.
              </p>
              <ul className="list-disc space-y-1 pl-5" data-avenant-a-savoir>
                <li>Le dépôt de garantie ne change pas.</li>
                <li>
                  Gerimmo ne contrôle pas ici l’encadrement des loyers ni les règles propres à votre commune : avant une
                  hausse, vérifiez qu’elle est permise.
                </li>
                <li>
                  Si le dernier diagnostic classe le logement F ou G, la hausse du loyer est refusée, par prudence
                  (comme pour la révision annuelle).
                </li>
                <li>
                  Un avenant qui ne touche ni au loyer ni aux charges ne s’enregistre pas ici : déposez sa pièce signée
                  dans Documents.
                </li>
              </ul>
            </div>
          )}
          {gestes && lecturesCompletes && (
            <GestesAvenantSigne
              orgId={orgId}
              bailId={bailId}
              attenteId={attente?.id ?? null}
              dates={dates}
              loyerActuel={Number(bail.loyer_hc ?? 0)}
              chargesActuelles={Number(bail.charges ?? 0)}
              libelleCharges={libelleCharges}
              aujourdhui={aujourdhui}
            />
          )}
        </section>
      )}

      {erreurAvenants && !enCours && (
        <p role="alert" className="text-sm text-destructive">Les avenants de ce bail ne peuvent pas être lus pour le moment.</p>
      )}
      {autres.length > 0 && (
        <section className={enCours ? "space-y-3 border-t border-border pt-4" : "space-y-3"} aria-labelledby="avenant-historique">
          <p id="avenant-historique" className="font-semibold">Avenants enregistrés</p>
          <ul className="space-y-2" data-avenants-enregistres>
            {autres.map((a) => <CarteAvenant key={a.id} a={a} base={base} libelleCharges={libelleCharges} />)}
          </ul>
        </section>
      )}
    </RubriqueDossier>
  );
}
