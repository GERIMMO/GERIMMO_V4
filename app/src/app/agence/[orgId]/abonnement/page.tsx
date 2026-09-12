import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutonPortail, BoutonSouscrire } from "./boutons-abonnement";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate } from "@/lib/ged";
import {
  EncadreLectureImpossible,
  EnteteReglages,
  statutOrganisation,
} from "../profil/famille-reglages";

export const metadata = { title: "Mon abonnement — Gerimmo" };

type EtatAbonnement = {
  statut: string;
  ecriture_ouverte: boolean;
  essai_fin: string | null;
  jours_essai_restants: number | null;
  public_tarif: "agence" | "proprietaire_direct";
  unite: string;
  unites_total: number;
  unites_facturees: number;
  mensuel: number;
  en_ligne_possible: boolean;
};

// Le détail du barème, tranche par tranche. Une facture qu'on ne peut pas
// recalculer soi-même est une facture qu'on appelle pour contester.
type Tranche = {
  rang: number;
  libelle: string;
  unites: number;
  prix_unitaire: number;
  sous_total: number;
};

// Ce que Stripe sait, ramené au strict nécessaire : ni identifiant client, ni
// identifiant de souscription — ils n'ont rien à faire dans un navigateur.
type EtatPaiement = {
  stripe_statut: string | null;
  paye: boolean;
  periode_fin: string | null;
  annulation_demandee: boolean;
  quantite_cible: number;
  montant_mensuel: number;
  paiement_en_retard: boolean;
  lecture_seule_le: string | null;
  jours_avant_lecture_seule: number | null;
};

// « Mon abonnement » (maquette PC v1) — grille tarifaire ACTÉE le 05/09
// (remplace celle du 25/07) : 1ᵉʳ bien offert, 5,99 €/bien/mois ensuite,
// sans frais de mise en place.
// Le paiement en ligne (Stripe) arrive au S11 : d'ici là, la page dit ce qui
// est vrai — la formule, le décompte de biens, le statut d'essai.
//
// Relevé 11/09, deux mensonges corrigés : (1) le champ `error` de la lecture
// des biens n'était pas consulté — une lecture en échec affichait « Aucun bien
// pour l'instant » et un total de 0 €, c'est-à-dire une FACTURE FAUSSE ;
// (2) le statut ne connaissait que « essai », tout le reste passait en vert
// « actif » — une organisation suspendue ou archivée s'y voyait active.
//
// Relevé du soir, troisième mensonge : la page promettait « rien ne se ferme
// sans vous prévenir ». Depuis que l'abonnement a un effet (déclencheur du
// 11/09), un essai expiré FERME l'écriture le jour même, sans traitement de
// nuit — la date suffit. La page dit désormais ce qui arrive, avant que ça
// n'arrive, et ce qui reste possible après : tout lire, tout exporter.
//
// Le décompte vient de `etat_abonnement`, pas d'un calcul refait ici : c'est
// la même fonction qui sert de source au reste du produit, et deux additions
// du même montant finissent toujours par diverger.
export default async function PageAbonnement(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const { supabase, organisation, role } = await verifierAccesEspace(orgId);
  // OUVERT AUX AGENCES depuis la grille du 12/09 : elles ont désormais un
  // barème et un chemin d'encaissement. Réservé au RESPONSABLE dans les deux
  // cas — un agent n'a pas à connaître la facture de son agence, et la base
  // refuse déjà de la lui rendre (`mon_abonnement`).
  if (!["admin_agence", "proprietaire_direct"].includes(role)) notFound();
  const estAgence = organisation.type === "agence";

  const [
    { data: biens, error: erreurBiens },
    { data: etatBrut, error: erreurEtat },
    { data: paiementBrut, error: erreurPaiement },
    { data: tranchesBrut, error: erreurTranches },
  ] = await Promise.all([
    supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("created_at"),
    supabase.rpc("etat_abonnement", { p_org: orgId }),
    supabase.rpc("mon_abonnement", { p_org: orgId }),
    supabase.rpc("detail_tranches_abonnement", { p_org: orgId }),
  ]);
  const liste = (biens ?? []) as { id: string; nom: string }[];
  const etat = ((etatBrut ?? []) as EtatAbonnement[])[0] ?? null;
  const paiement = ((paiementBrut ?? []) as EtatPaiement[])[0] ?? null;
  const tranches = (tranchesBrut ?? []) as Tranche[];
  const total = etat?.mensuel ?? 0;
  const ferme = etat ? !etat.ecriture_ouverte : false;
  // LA PASTILLE DOIT DIRE CE QUE L'ÉCRAN DIT. Une organisation en défaut de
  // paiement garde le statut « active » — elle PAIE, c'est sa carte qui a
  // échoué — mais son écriture est fermée. Afficher une pastille verte au-dessus
  // d'un bandeau rouge « lecture seule » ferait douter de l'un ou de l'autre.
  const statutBrut = statutOrganisation(organisation.status);
  const statut =
    ferme && organisation.status === "active"
      ? { libelle: "lecture seule", puce: "puce-rouge" }
      : statutBrut;
  const jours = etat?.jours_essai_restants ?? null;

  // Retour de Stripe. `annule` n'est pas une erreur : le client a fermé la page
  // de paiement, ce qui est son droit — on le lui dit sans le gronder.
  const { paiement: retourStripe } = await props.searchParams;

  // Rien à payer tant qu'on ne gère qu'un bien : le premier est offert à vie.
  // La page ne propose donc pas de souscrire — proposer de payer 0 € est la
  // meilleure façon de faire douter quelqu'un de ce qu'il va lui être compté.
  const rienAPayer = (etat?.unites_facturees ?? 0) < 1;
  // Au-delà du seuil, l'abonnement ne se souscrit plus d'un clic.
  const surDevis = etat ? !etat.en_ligne_possible : false;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Mon abonnement" mention={organisation.name}>
        {estAgence
          ? "Ce que vous payez, lot par lot, et l'état de votre compte."
          : "Ce que vous payez, bien par bien, et l'état de votre compte."}
      </EnteteReglages>

      {retourStripe === "ok" && (
        <div
          role="status"
          className="loc-carte border-l-4 border-l-[var(--success)]"
        >
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Merci, votre paiement est enregistré.</b>{" "}
            <span className="text-muted-foreground">
              Votre compte s&apos;ouvre dès que Stripe nous le confirme — quelques
              secondes en général. Si cette page dit encore le contraire dans une
              minute, rechargez-la.
            </span>
          </p>
        </div>
      )}
      {retourStripe === "annule" && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            Paiement interrompu : rien n&apos;a été prélevé, et rien n&apos;a
            changé. Vous pouvez reprendre quand vous voulez.
          </p>
        </div>
      )}

      {erreurPaiement && (
        <EncadreLectureImpossible>
          L&apos;état de votre paiement n&apos;a pas pu être lu. Ce n&apos;est pas
          un abonnement absent : rechargez la page dans un instant.
        </EncadreLectureImpossible>
      )}

      {/* LE PRÉLÈVEMENT A ÉCHOUÉ : ON DIT LA DATE, PAS SEULEMENT LE FAIT.
          Décision humain du 12/09 — quinze jours, puis lecture seule jusqu'à
          régularisation. Un délai qu'on ne nomme pas est un délai qu'on subit :
          l'écran affiche le jour exact, et le décompte quand il approche. */}
      {paiement?.paiement_en_retard && (
        <div
          role="alert"
          className={`loc-carte border-l-4 ${
            ferme ? "border-l-[var(--destructive)]" : "border-l-[var(--warning)]"
          }`}
        >
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              {ferme
                ? "Votre compte est en lecture seule, faute de règlement."
                : "Le dernier prélèvement n’est pas passé."}
            </b>{" "}
            <span className="text-muted-foreground">
              {ferme ? (
                <>
                  Dès que le paiement aboutit, tout rouvre à la seconde, exactement
                  où vous vous êtes arrêté. Rien n’a été supprimé, et rien ne le
                  sera : vos baux, quittances, états des lieux et votre journal de
                  gestion restent consultables et exportables.
                </>
              ) : (
                <>
                  Votre banque a peut-être refusé, ou la carte a expiré. Votre
                  compte reste entièrement ouvert
                  {paiement.lecture_seule_le
                    ? ` jusqu’au ${formaterDate(paiement.lecture_seule_le)}`
                    : ""}
                  {paiement.jours_avant_lecture_seule !== null
                    ? paiement.jours_avant_lecture_seule === 0
                      ? " — dernier jour"
                      : ` — ${paiement.jours_avant_lecture_seule} jour${
                          paiement.jours_avant_lecture_seule > 1 ? "s" : ""
                        } restant${paiement.jours_avant_lecture_seule > 1 ? "s" : ""}`
                    : ""}
                  . Passé cette date et sans règlement, la saisie de nouvelles
                  données est suspendue — tout reste consultable et exportable.
                  Mettez votre moyen de paiement à jour ci-dessous.
                </>
              )}
            </span>
          </p>
        </div>
      )}

      {paiement?.annulation_demandee && paiement.periode_fin && (
        <div role="status" className="loc-carte border-l-4 border-l-[var(--warning)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre abonnement prend fin le {formaterDate(paiement.periode_fin)}.
            </b>{" "}
            <span className="text-muted-foreground">
              Le mois en cours vous est acquis : rien ne change d&apos;ici là.
              Passé cette date, le compte passe en lecture seule — vos données
              restent entières et exportables. Vous pouvez revenir sur cette
              décision depuis « Gérer mon abonnement ».
            </span>
          </p>
        </div>
      )}

      {ferme && !paiement?.paiement_en_retard && (
        <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre compte est en lecture seule.
            </b>{" "}
            <span className="text-muted-foreground">
              {etat?.statut === "essai"
                ? "Votre essai est arrivé à son terme."
                : "L'abonnement n'est plus actif."}{" "}
              Vos données restent entières : vous pouvez tout consulter et tout
              exporter, y compris le journal de gestion. Seules les nouvelles
              saisies sont suspendues — baux, quittances, incidents. Elles
              reprendront exactement où elles se sont arrêtées.
            </span>
          </p>
        </div>
      )}

      {erreurEtat && !ferme && (
        <EncadreLectureImpossible>
          L&apos;état de votre abonnement n&apos;a pas pu être lu. Ce n&apos;est
          pas un compte fermé : rechargez la page dans un instant.
        </EncadreLectureImpossible>
      )}

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Formule Gerimmo</h3>
          <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
        </div>
        {/* DEUX PUBLICS, DEUX LECTURES. Un propriétaire gère une poignée de
            biens : la liste nominative lui montre lequel est offert, c'est le
            plus parlant. Une agence en gère des centaines : la même liste
            ferait trois cents lignes que personne ne lit, et cacherait la seule
            chose qui compte — d'où sort le montant. Elle voit donc son barème,
            tranche par tranche, avec ses sous-totaux. */}
        {estAgence ? (
          erreurTranches || erreurEtat ? (
            <EncadreLectureImpossible>
              Votre décompte n&apos;a pas pu être lu — ce n&apos;est pas un
              portefeuille vide, et un total affiché ici serait faux. Rechargez
              la page dans un instant : rien n&apos;est prélevé entre-temps.
            </EncadreLectureImpossible>
          ) : (etat?.unites_facturees ?? 0) === 0 ? (
            <div className="vide-guide">
              <p className="titre">Aucun lot sous mandat actif</p>
              <p className="explication">
                La facturation suit les lots que vos mandants vous confient :
                un lot sous mandat actif est compté, vacant ou loué. Tant
                qu&apos;aucun mandat n&apos;est signé, rien n&apos;est dû.
              </p>
              <div className="geste">
                <Link href={`/agence/${orgId}/parc`} className="btn-or">
                  Voir mon portefeuille
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <div className="ligne-info">
                <span>Lots sous mandat actif</span>
                <span className="montant font-medium">{etat?.unites_facturees}</span>
              </div>
              {tranches.map((tr) => (
                <div key={tr.rang} className="ligne-info">
                  <span>
                    {tr.libelle}
                    <small className="block">
                      {tr.unites} lot{tr.unites > 1 ? "s" : ""}
                      {tr.prix_unitaire > 0
                        ? ` × ${eur(tr.prix_unitaire)}`
                        : " · forfait de départ"}
                    </small>
                  </span>
                  <span className="montant">{eur(tr.sous_total)}</span>
                </div>
              ))}
              <div className="ligne-info font-medium">
                <span className="!text-foreground">Total mensuel</span>
                <span className="montant font-heading text-lg">{eur(total)}</span>
              </div>
            </div>
          )
        ) : erreurBiens ? (
          <EncadreLectureImpossible>
            Vos biens n&apos;ont pas pu être lus — ce n&apos;est pas un parc
            vide, et un total affiché ici serait faux. Rechargez la page dans
            un instant : rien n&apos;est prélevé entre-temps.
          </EncadreLectureImpossible>
        ) : liste.length === 0 ? (
          <div className="vide-guide">
            <p className="titre">Aucun bien pour l&apos;instant</p>
            <p className="explication">
              Votre premier bien est offert, à vie : tant que vous n&apos;en
              gérez qu&apos;un, votre abonnement reste à 0 €.
            </p>
            <div className="geste">
              <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
                Ajouter un bien
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {liste.map((b, ix) => (
              <div key={b.id} className="ligne-info">
                <span>
                  {b.nom}
                  {ix === 0 && (
                    <small className="block">1ᵉʳ bien — offert, à vie</small>
                  )}
                </span>
                <span className="montant">
                  {ix === 0 ? "0 €" : "5,99 €/mois"}
                </span>
              </div>
            ))}
            <div className="ligne-info font-medium">
              <span className="!text-foreground">Total mensuel</span>
              <span className="montant font-heading text-lg">{eur(total)}</span>
            </div>
          </div>
        )}
        <p className="mesure-lecture mt-3 text-xs text-muted-foreground">
          {estAgence
            ? "Un tarif dégressif par tranches, tout compris, sans engagement : baux, quittances, incidents, artisans, comptabilité de gérance et relevés. Chaque lot est facturé au tarif de sa tranche — signer un lot de plus ne fait jamais changer de palier. Un mandat résilié n'est plus compté le mois suivant."
            : "Un prix par bien, tout compris, sans engagement : baux, quittances, incidents, livre et fiscalité. Un bien retiré n'est plus compté le mois suivant."}
        </p>

        {/* LES DEUX GESTES, ET UN SEUL À LA FOIS. Proposer « S'abonner » à qui
            paie déjà, c'est lui faire craindre un double prélèvement ; proposer
            « Gérer » à qui n'a pas de dossier chez Stripe, c'est un bouton qui
            mène à une erreur. L'écran ne montre donc que celui qui a un sens à
            cet instant. */}
        {!erreurBiens && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {rienAPayer ? (
              <p className="mesure-lecture text-sm text-muted-foreground">
                {estAgence
                  ? "Rien à régler pour l'instant : la facturation démarre au premier lot confié sous mandat actif."
                  : "Rien à régler pour l'instant : votre premier bien est offert, à vie. Le paiement s'ouvrira le jour où vous en ajouterez un second."}
              </p>
            ) : surDevis && !paiement?.paye ? (
              /* AU-DELÀ DU SEUIL, ON NE VEND PAS D'UN CLIC. Un portefeuille de
                 cette taille suppose une reprise comptable et une formation :
                 proposer un bouton, ce serait promettre un accompagnement
                 qu'on n'a pas préparé. */
              <p className="mesure-lecture text-sm text-muted-foreground">
                Au-delà de 600 lots, l&apos;abonnement se met en place avec nous.
                Écrivez-nous : nous préparons votre devis et la reprise de votre
                portefeuille, soldes compris.
              </p>
            ) : paiement?.paiement_en_retard ? (
              <>
                {/* Ce client a DÉJÀ une souscription : lui proposer de
                    « s'abonner » ouvrirait un second prélèvement à côté du
                    premier. Ce qu'il doit faire, c'est changer sa carte. */}
                <p className="mesure-lecture text-sm text-muted-foreground">
                  Votre abonnement existe : il n’y a rien à souscrire de
                  nouveau. Mettez votre moyen de paiement à jour, et le
                  prélèvement repart.
                </p>
                <BoutonPortail orgId={orgId} />
              </>
            ) : paiement?.paye ? (
              <>
                <p className="mesure-lecture text-sm text-muted-foreground">
                  Votre abonnement est actif
                  {paiement.periode_fin && !paiement.annulation_demandee
                    ? ` — prochaine échéance le ${formaterDate(paiement.periode_fin)}`
                    : ""}
                  . Carte, factures et résiliation se règlent chez notre
                  prestataire de paiement.
                </p>
                <BoutonPortail orgId={orgId} />
              </>
            ) : (
              <>
                <p className="mesure-lecture text-sm text-muted-foreground">
                  {ferme
                    ? "Votre compte rouvre dès le premier paiement, avec toutes vos données là où vous les avez laissées."
                    : "Vous pouvez souscrire dès maintenant : le prélèvement ne démarre qu'à la validation, et votre essai n'en est pas raccourci."}
                </p>
                <BoutonSouscrire
                  orgId={orgId}
                  libelle={
                    ferme
                      ? `Rouvrir mon compte — ${eur(total)} par mois`
                      : `S'abonner — ${eur(total)} par mois`
                  }
                />
                {/* Un client peut avoir un dossier chez Stripe sans abonnement
                    actif (résiliation, paiement abandonné) : ses anciennes
                    factures lui restent dues, il doit pouvoir les retrouver. */}
                {paiement?.stripe_statut && <BoutonPortail orgId={orgId} />}
              </>
            )}
          </div>
        )}
      </div>

      {!ferme && etat?.statut === "essai" && etat.essai_fin && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre essai gratuit court jusqu&apos;au {formaterDate(etat.essai_fin)}
              {jours !== null && jours <= 7
                ? jours === 0
                  ? " — dernier jour."
                  : ` — ${jours} jour${jours > 1 ? "s" : ""} restant${jours > 1 ? "s" : ""}.`
                : "."}
            </b>{" "}
            <span className="text-muted-foreground">
              Passé cette date, le compte passe en lecture seule : vous gardez
              l&apos;accès à tout ce qui s&apos;y trouve et à vos exports, mais
              vous ne pouvez plus rien saisir de nouveau.
              {rienAPayer
                ? estAgence
                  ? " Tant qu'aucun lot n'est sous mandat actif, rien n'est à régler."
                  : " Tant que vous ne gérez qu'un bien, rien n'est à régler : votre compte reste ouvert."
                : " Souscrire maintenant ne raccourcit pas votre essai."}
            </span>
          </p>
        </div>
      )}
    </main>
  );
}
