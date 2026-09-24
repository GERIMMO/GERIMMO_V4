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
  TitreSection,
  Vide,
} from "../ui";

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
    (l) => l.statut === "en_cours" && (!l.compte_rendu_depose || !l.photo_apres_deposee)
  );
  const total = terminees.reduce((somme, l) => somme + (l.montant_ttc_cents ?? 0), 0);

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <EnteteSousPage titre="Ma facturation" mention="Toutes agences confondues" />

      {/* La phrase qui compte le plus de la page : en texte courant, pas en
          gris secondaire ; « encore » se lisait « une fois de plus » (24/09). */}
      <p className="text-base text-[var(--corps)]">
        Cet écran suit les interventions facturables, pas les paiements reçus.
        Pour l&apos;instant, transmettez votre facture directement à l&apos;agence :
        son dépôt dans Gerimmo n&apos;est pas encore ouvert.
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
      </section>}

      {/* Déplié tant que la page n'a rien d'autre à montrer (24/09). */}
      <DetailsInformation
        titre="Comment transmettre ma facture et être payé"
        ouvert={terminees.length === 0}
      >
        <ul className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            Adressez votre facture à l&apos;agence en rappelant le devis retenu et
            l&apos;intervention concernée.
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
