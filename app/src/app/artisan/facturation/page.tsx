import Link from "next/link";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../acces";
import { euros, jourCourt } from "../libelles";
import {
  Carte,
  DetailsInformation,
  EnteteSousPage,
  Erreur,
  Etiquette,
  MarqueAgence,
  Retour,
  Succes,
  TitreSection,
  Vide,
} from "../ui";

export const metadata = { title: "Ma facturation — Espace artisan" };

/**
 * Ma facturation (9.7).
 *
 * Depuis l'audit du 27/09, la facture SE DÉPOSE : table
 * `intervention_factures`, RPC `deposer_facture_artisan` (migration
 * 20260927123000), écran /artisan/missions/[id]/facture. Version simple du
 * wiki (concepts/Devis) : pré-remplie du montant engagé, écart justifié et
 * alerté sans blocage. La validation par l'agence et l'écriture comptable
 * restent de son côté.
 *
 * Le montant affiché est le plafond engagé — dernier avenant accepté, sinon
 * devis retenu — et non plus le seul devis initial, qui ignorait l'avenant.
 *
 * La page dit aussi CE QUI EST FACTURABLE. La règle est nette (module 9 :
 * « la facture exige intervention terminée + photo »), et les deux conditions
 * sont lisibles dans son agenda — compte rendu déposé, photo du travail
 * réalisé déposée. Une intervention terminée sans compte rendu n'est pas
 * facturable, et il vaut mieux qu'il l'apprenne ici que par un refus de
 * paiement.
 */
export default async function PageFacturation(props: PageProps<"/artisan/facturation">) {
  await verifierAccesArtisan();
  const { facture } = await props.searchParams;
  const agenda = await chargerAgenda();

  const terminees = agenda.lignes.filter((l) => l.statut === "terminee");
  const aCompleter = agenda.lignes.filter(
    (l) => l.statut === "en_cours" && (!l.compte_rendu_depose || !l.photo_apres_deposee)
  );
  const montant = (l: (typeof terminees)[number]) =>
    l.montant_plafond_cents ?? l.montant_ttc_cents;
  const total = terminees.reduce((somme, l) => somme + (montant(l) ?? 0), 0);

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <EnteteSousPage titre="Ma facturation" mention="Toutes agences confondues" />

      {/* La phrase qui compte le plus de la page : en texte courant, pas en
          gris secondaire ; « encore » se lisait « une fois de plus » (24/09). */}
      {facture && (
        <Succes>
          Facture déposée. L&apos;agence est prévenue : elle la contrôle et la
          règle selon ses délais.
        </Succes>
      )}

      <p className="text-base text-[var(--corps)]">
        Cet écran suit vos interventions facturables et vos factures déposées,
        pas les paiements reçus. Une fois l&apos;intervention terminée, déposez
        votre facture depuis la mission : elle rejoint le dossier de l&apos;agence.
      </p>

      {agenda.erreur && <Erreur>Vos interventions n’ont pas pu être chargées. Rechargez la page avant de conclure qu’aucune intervention n’est facturable.</Erreur>}

      {!agenda.erreur && aCompleter.length > 0 && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>
            {aCompleter.length === 1
              ? "Une intervention n'est pas facturable"
              : `${aCompleter.length} interventions ne sont pas facturables`}
          </TitreSection>
          <p className="text-[0.9375rem] text-[var(--corps)]">
            La photo du travail réalisé et le compte rendu sont tous deux
            nécessaires. Chaque mission ci-dessous indique ce qu&apos;il reste à
            faire avant de pouvoir la facturer.
          </p>
          <ul className="mt-3 space-y-2">
            {aCompleter.map((l) => (
              <li key={l.intervention_id}>
                <Link
                  href={`/artisan/missions/${l.intervention_id}/compte-rendu`}
                  className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
                >
                  {titreIncident(l.categorie)} — {l.agence_nom} : {l.photo_apres_deposee ? "terminer le compte rendu" : "ajouter la photo du travail réalisé"}
                </Link>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      {!agenda.erreur && <section>
        <TitreSection>Interventions terminées ({terminees.length})</TitreSection>
        {terminees.length === 0 ? (
          <Vide action={{ href: "/artisan/agenda", libelle: "Voir mon agenda" }}>
            Aucune intervention terminée pour l&apos;instant. Une intervention
            apparaît ici dès que son compte rendu et la photo du travail
            réalisé sont déposés.
          </Vide>
        ) : (
          <div className="space-y-3">
            {terminees.map((l) => (
              <div
                key={l.intervention_id}
                className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MarqueAgence nom={l.agence_nom} />
                  <Etiquette
                    ton={l.facture_deposee ? "ok" : l.compte_rendu_depose ? "encre" : "alerte"}
                  >
                    {l.facture_deposee
                      ? "Facture déposée"
                      : l.compte_rendu_depose
                        ? "Facturable"
                        : "Compte rendu manquant"}
                  </Etiquette>
                </div>
                <p className="mt-2.5 text-base font-medium text-[var(--corps)]">
                  {titreIncident(l.categorie)}
                </p>
                <p className="mt-0.5 text-[0.9375rem] text-[var(--texte-secondaire)]">
                  {l.incident_numero}
                  {l.debut_prevu ? ` · ${jourCourt(l.debut_prevu)}` : ""}
                  {l.ville ? ` · ${l.ville}` : ""}
                </p>
                <p className="mt-2 text-[1.0625rem] font-medium text-[var(--encre)]">
                  {montant(l) !== null
                    ? `${euros(montant(l))} TTC`
                    : "Montant non chiffré"}
                  <span className="ml-2 text-[0.8125rem] font-normal text-[var(--texte-secondaire)]">
                    {l.montant_plafond_cents !== null &&
                    l.montant_plafond_cents !== l.montant_ttc_cents
                      ? "avenant accepté"
                      : "devis retenu"}
                  </span>
                </p>
                {!l.facture_deposee && l.compte_rendu_depose && l.photo_apres_deposee && (
                  <Link
                    href={`/artisan/missions/${l.intervention_id}/facture`}
                    className="mt-2 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
                  >
                    Déposer ma facture
                  </Link>
                )}
              </div>
            ))}
            <p className="pt-1 text-right text-[0.9375rem] text-[var(--texte-secondaire)]">
              Total engagé (devis et avenants acceptés) : {euros(total)} TTC
            </p>
          </div>
        )}
      </section>}

      {/* Déplié tant que la page n'a rien d'autre à montrer (24/09). */}
      <DetailsInformation
        titre="Comment transmettre ma facture et être payé"
        ouvert={terminees.length === 0}
      >
        <ul className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            Déposez votre facture depuis la mission terminée : son montant est
            pré-rempli avec le devis retenu, ou l&apos;avenant accepté.
          </li>
          <li>
            Un écart entre le devis et la facture ne bloque rien : vous le
            justifiez, l&apos;agence le tranche.
          </li>
          <li>
            Elle ne peut être réglée qu&apos;une fois l&apos;intervention terminée,
            compte rendu et photo compris.
          </li>
        </ul>
      </DetailsInformation>
    </div>
  );
}
