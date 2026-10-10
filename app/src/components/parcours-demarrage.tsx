import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import styles from "./parcours-demarrage.module.css";
import { toutManuel, type ReglagesEnvoi } from "@/lib/envois-automatiques";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * « Par où je commence ? » — le chemin du compte au premier loyer encaissé.
 *
 * Une organisation qui vient d'ouvrir arrive sur un tableau de bord à zéro.
 * Entre le premier bien et le premier loyer appelé il y a cinq gestes, chacun
 * gardé par une règle qui refuse tant que le précédent n'a pas eu lieu : la
 * détention à 100 %, le DPE en habitation, les mentions obligatoires du bail.
 * Celui qui découvre le produit les rencontrait une par une, sous forme de
 * refus. Ce bloc les met dans l'ordre, dit où l'on en est, et n'ouvre QU'UNE
 * porte à la fois — la suivante.
 *
 * Il DISPARAÎT dès que les six étapes sont faites : un guide qui reste après
 * coup devient un reproche.
 *
 * SIXIÈME ÉTAPE (audit du 27/09) : le parcours s'arrêtait au bail et
 * concluait « vous n'aurez plus rien à lancer ». Or l'encaissement se déclare
 * à la main — la comptabilité est déclarative : le premier loyer encaissé, et
 * la quittance qui en découle, sont la vraie fin du démarrage.
 */

type Etape = {
  etape: string;
  faite: boolean;
  detail: string | null;
  lot_id: string | null;
  bien_id: string | null;
};

const LIBELLES: Record<string, { titre: string; geste: string }> = {
  identite: { titre: "Votre identité", geste: "Compléter le profil" },
  bien: { titre: "Un premier bien", geste: "Ajouter un bien" },
  lot_pret: { titre: "Un lot en état d'être loué", geste: "Lever ce qui bloque" },
  locataire: { titre: "Un locataire", geste: "Créer sa fiche" },
  bail: { titre: "Le bail", geste: "Créer le bail" },
  loyer: { titre: "Le premier loyer encaissé", geste: "Déclarer l'encaissement" },
};
// Chez le propriétaire direct, « bien » et « lot » se disputaient l'écran
// (25/09, D16) : pour qui possède un appartement, c'est la même chose. Un seul
// mot à l'écran, le lot reste un concept de code.
const LIBELLES_PROPRIETAIRE: Record<string, { titre: string; geste: string }> = {
  ...LIBELLES,
  lot_pret: { titre: "Un bien en état d'être loué", geste: "Lever ce qui bloque" },
};

function lien(orgId: string, e: Etape): string {
  switch (e.etape) {
    case "identite":
      return `/agence/${orgId}/profil`;
    case "bien":
      return `/agence/${orgId}/parc/nouveau`;
    case "locataire":
      return `/agence/${orgId}/personnes#creer-fiche`;
    case "loyer":
      return `/agence/${orgId}/loyers`;
    case "lot_pret":
    case "bail":
      // Le formulaire de création d'un bail vit sur la fiche du lot, section
      // « Baux & état des lieux » — c'est l'unique porte d'entrée du produit.
      return e.bien_id && e.lot_id
        ? `/agence/${orgId}/parc/${e.bien_id}/lots/${e.lot_id}#baux`
        : `/agence/${orgId}/parc`;
    default:
      return `/agence/${orgId}/parc`;
  }
}

export async function ParcoursDemarrage({
  supabase,
  orgId,
  automatiqueProposeAilleurs = false,
  estProprietaire = false,
}: {
  supabase: SupabaseClient;
  orgId: string;
  /** Vrai quand l'écran qui porte le bloc propose déjà l'automatique (l'assistant du tableau de bord) : on ne le dit pas deux fois. */
  automatiqueProposeAilleurs?: boolean;
  /** Propriétaire direct : « bien » à l'écran, jamais « lot ». */
  estProprietaire?: boolean;
}) {
  const libelles = estProprietaire ? LIBELLES_PROPRIETAIRE : LIBELLES;
  const [{ data, error }, reglages] = await Promise.all([
    supabase.rpc("parcours_demarrage", { p_org: orgId }),
    // Les trois envois automatiques (audit du 20/09, proposition n° 7) : le
    // moment de les proposer est CELUI-CI, avant le premier bail, pas après
    // le premier loyer réclamé à la main. Une lecture tombée vaut « rien
    // d'activé » : on propose, on ne décide pas.
    supabase
      .from("organizations")
      .select("quittances_envoi_auto, appels_envoi_auto, relances_envoi_auto")
      .eq("id", orgId)
      .maybeSingle(),
  ]);
  // Une lecture tombée ne doit pas se déguiser en parcours terminé : on
  // n'affiche rien plutôt que d'annoncer une fin qu'on n'a pas constatée.
  if (error) return null;
  const envois = (reglages.data as ReglagesEnvoi | null) ?? {
    quittances_envoi_auto: false,
    appels_envoi_auto: false,
    relances_envoi_auto: false,
  };
  const proposerAutomatique = !automatiqueProposeAilleurs && toutManuel(envois);

  const etapes = (data ?? []) as Etape[];
  if (etapes.length === 0 || etapes.every((e) => e.faite)) return null;

  const faites = etapes.filter((e) => e.faite).length;
  const suivante = etapes.find((e) => !e.faite);

  // Le démarrage reste disponible sans repousser les chiffres sous l’écran.
  // La prochaine action est visible ; le détail se déplie seulement au besoin.
  return (
    <section className={`loc-carte ${styles.carte}`} aria-labelledby="parcours-titre">
      <div className={styles.resume}>
        <div className={styles.principal}>
          <h2 id="parcours-titre" className={styles.titre}>Mettre votre premier {estProprietaire ? "bien" : "lot"} en location</h2>
          {suivante && <p className={styles.prochaine}>Prochaine étape : <strong>{libelles[suivante.etape]?.titre ?? suivante.etape}</strong></p>}
        </div>
        <div className={styles.actions}>
          <div className={styles.avancement}>
            <span>{faites} / {etapes.length} étapes</span>
            <span className={styles.barre} role="progressbar" aria-label="Progression de la mise en location" aria-valuenow={faites} aria-valuemin={0} aria-valuemax={etapes.length}>
              <span style={{width:`${faites / etapes.length * 100}%`}} />
            </span>
          </div>
          {suivante && <Link href={lien(orgId, suivante)} className={`btn-or ${styles.action}`}>{libelles[suivante.etape]?.geste ?? "Continuer"}<ArrowRight size={14} aria-hidden="true" /></Link>}
        </div>
      </div>
      <details className={styles.details}>
        <summary><span className={styles.ferme}>Voir les étapes</span><span className={styles.ouvert}>Masquer les étapes</span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className={styles.contenu}>
      <ol className={styles.liste}>
        {etapes.map((e) => {
          const libelle = libelles[e.etape];
          const courante = suivante?.etape === e.etape;
          return (
            <li
              key={e.etape}
              className="flex items-start gap-3 border-b border-[var(--filet)] py-3 last:border-0"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] ${
                  e.faite
                    ? "bg-[var(--marque)] text-[var(--sur-marque)]"
                    : courante
                      ? "border-2 border-[var(--marque)] text-[var(--marque-sombre)]"
                      : "border border-[var(--filet)] text-[var(--texte-secondaire)]"
                }`}
              >
                {e.faite ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-sm ${e.faite ? "text-[var(--texte-secondaire)]" : "font-medium"}`}>
                    {libelle?.titre ?? e.etape}
                  </span>
                  <span className="sr-only">{e.faite ? "— fait" : "— à faire"}</span>
                </span>
                {e.detail && (
                  <span className="mt-1 block text-[13px] text-muted-foreground">{e.detail}</span>
                )}
                {/* CHAQUE étape non faite porte son geste (25/09, D05) : seule
                    la suivante avait un bouton, et « Un lot en état d'être
                    loué » ou « Le bail » restaient du texte — le propriétaire
                    devait deviner que ça se passe dans la fiche du lot. La
                    suivante garde le bouton plein ; les autres, un lien. */}
                {!e.faite && !courante && (
                  <Link href={lien(orgId, e)} className="lien-discret mt-1.5 inline-block text-[13px]">
                    {libelle?.geste ?? "Continuer"}&nbsp;→
                  </Link>
                )}
                {courante && e.etape === "bien" && (
                  <span className="mt-2 block text-xs text-muted-foreground">
                    Un parc déjà constitué ? <Link href={`/agence/${orgId}/parc/import`} className="lien-discret">Reprenez-le depuis un tableur</Link>.
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {proposerAutomatique ? (
        <div className="assistant-suggestion mt-3 border-b-0">
          <p>
            Une fois le bail actif, le loyer du mois est calculé seul le 1ᵉʳ ;
            vous déclarez l&apos;encaissement, la quittance s&apos;établit
            d&apos;elle-même.{" "}
            <b>Gerimmo peut aussi envoyer avis et quittances seul</b>, avec les
            relances d&apos;impayé : rien ne part sans votre accord, donné une fois.
          </p>
          <Link href={`/agence/${orgId}/profil#relances`} className="lien-discret whitespace-nowrap">
            Activer les envois automatiques →
          </Link>
        </div>
      ) : (
        // « Vous n'aurez plus rien à lancer » était faux (27/09) : chaque
        // encaissement se déclare. On dit ce qui reste à faire, et seulement ça.
        <p className="mt-3 text-[13px] text-muted-foreground">
          Une fois le bail actif, le loyer du mois est calculé seul le 1ᵉʳ
          {envois.appels_envoi_auto ? " et l'avis part au locataire" : ""}. Il vous
          reste un geste&nbsp;: déclarer chaque encaissement — la quittance
          s&apos;établit alors d&apos;elle-même
          {envois.quittances_envoi_auto
            ? " et part au locataire."
            : ", à lui envoyer d'un clic depuis la fiche du bail."}
        </p>
      )}
        </div>
      </details>
    </section>
  );
}
