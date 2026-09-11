import Link from "next/link";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../acces";
import { euros, jourCourt } from "../libelles";
import { Carte, Etiquette, MarqueAgence, Retour, TitreSection, Vide } from "../ui";

export const metadata = { title: "Ma facturation — Espace artisan" };

/**
 * Ma facturation (9.7).
 *
 * CE QUE CETTE PAGE FAIT, ET CE QU'ELLE NE FAIT PAS — dit franchement, parce
 * que la moitié du module 9 n'est pas construite au 2026-09-11 : il n'existe
 * aucune table `factures`, donc aucun dépôt de facture dans l'application.
 * Inventer un écran de dépôt qui n'écrirait nulle part serait pire que de ne
 * rien faire : l'artisan croirait avoir facturé.
 *
 * Ce que la page fait, en revanche, est ce dont il a réellement besoin
 * aujourd'hui : SAVOIR CE QUI EST FACTURABLE. La règle est nette (module 9 :
 * « la facture exige intervention terminée + photo »), et les deux conditions
 * sont lisibles dans son agenda — compte rendu déposé, photo du travail
 * réalisé déposée. Une intervention terminée sans compte rendu n'est pas
 * facturable, et il vaut mieux qu'il l'apprenne ici que par un refus de
 * paiement.
 */
export default async function PageFacturation() {
  await verifierAccesArtisan();
  const agenda = await chargerAgenda();

  const terminees = agenda.lignes.filter((l) => l.statut === "terminee");
  const aCompleter = agenda.lignes.filter(
    (l) => l.statut === "en_cours" && !l.compte_rendu_depose
  );
  const total = terminees.reduce((somme, l) => somme + (l.montant_ttc_cents ?? 0), 0);

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <div>
        <p className="eyebrow">Toutes agences confondues</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">
          Ma facturation
        </h1>
      </div>

      {aCompleter.length > 0 && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>
            {aCompleter.length === 1
              ? "Une intervention n'est pas facturable"
              : `${aCompleter.length} interventions ne sont pas facturables`}
          </TitreSection>
          <p className="text-[0.9375rem] text-[var(--corps)]">
            Il y manque le compte rendu et la photo du travail réalisé. Tant
            qu&apos;ils manquent, l&apos;intervention n&apos;est pas terminée — et une
            intervention non terminée ne se facture pas.
          </p>
          <ul className="mt-3 space-y-2">
            {aCompleter.map((l) => (
              <li key={l.intervention_id}>
                <Link
                  href={`/artisan/missions/${l.intervention_id}/compte-rendu`}
                  className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
                >
                  {titreIncident(l.categorie)} — {l.agence_nom} : rendre compte
                </Link>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <section>
        <TitreSection>Interventions terminées ({terminees.length})</TitreSection>
        {terminees.length === 0 ? (
          <Vide>
            Aucune intervention terminée pour l&apos;instant. Une intervention
            apparaît ici dès que vous en avez rendu compte.
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
                  <Etiquette ton={l.compte_rendu_depose ? "ok" : "alerte"}>
                    {l.compte_rendu_depose ? "Facturable" : "Compte rendu manquant"}
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
                  {l.montant_ttc_cents !== null
                    ? `${euros(l.montant_ttc_cents)} TTC`
                    : "Montant non chiffré"}
                  <span className="ml-2 text-[0.8125rem] font-normal text-[var(--texte-secondaire)]">
                    devis retenu
                  </span>
                </p>
              </div>
            ))}
            <p className="pt-1 text-right text-[0.9375rem] text-[var(--texte-secondaire)]">
              Total des devis retenus : {euros(total)} TTC
            </p>
          </div>
        )}
      </section>

      <Carte>
        <TitreSection>Comment vous êtes payé</TitreSection>
        <ul className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            Votre facture est attendue par l&apos;agence, et elle est pré-remplie de
            votre devis retenu.
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
        <p className="mt-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Le dépôt de la facture dans Gerimmo n&apos;est pas encore ouvert : en
          attendant, adressez-la à l&apos;agence comme vous le faites aujourd&apos;hui.
          Ce que vous voyez ci-dessus est l&apos;état, du côté de Gerimmo, de ce qui
          est facturable.
        </p>
      </Carte>
    </div>
  );
}
