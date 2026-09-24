import { chargerFicheArtisan, chargerSollicitations, verifierAccesArtisan } from "../acces";
import { CarteSollicitation } from "../carte-sollicitation";
import { EnteteSousPage, Erreur, Succes, TitreSection, Vide } from "../ui";

// Un seul nom pour cet écran : « Demandes de devis », comme son titre (24/09).
export const metadata = { title: "Demandes de devis — Espace artisan" };

// Une demande close n'est pas forcément une demande à laquelle il a répondu :
// une expirée ou une annulée ne rejoint pas ses devis (tour du 24/09).
const STATUTS_DEVIS_ENVOYE = ["devis_depose", "retenue", "non_retenue"];
const STATUTS_SANS_SUITE = ["declinee", "expiree", "annulee"];

/**
 * La boîte de réception des demandes de devis (9.2), TOUTES AGENCES CONFONDUES.
 *
 * Comme l'agenda, elle ne prend aucune organisation en paramètre : une agence
 * ne peut pas demander « les sollicitations que j'ai envoyées à cet artisan »
 * par cette porte, et l'artisan ne peut pas demander celles d'un confrère.
 *
 * Il ne voit jamais le devis de l'autre artisan sollicité sur le même incident
 * — la mise en concurrence est réelle (deux au maximum en parallèle, RM-9.1.1),
 * et elle ne serait plus une concurrence s'il pouvait lire le prix d'en face.
 */
export default async function PageDevisArtisan(props: PageProps<"/artisan/devis">) {
  await verifierAccesArtisan();
  const { envoye } = await props.searchParams;
  const [{ fiche }, sollicitations] = await Promise.all([
    chargerFicheArtisan(),
    chargerSollicitations(),
  ]);

  const aChiffrer = sollicitations.lignes.filter((l) => l.statut === "envoyee");
  const envoyes = sollicitations.lignes.filter((l) => STATUTS_DEVIS_ENVOYE.includes(l.statut));
  const sansSuite = sollicitations.lignes.filter((l) => STATUTS_SANS_SUITE.includes(l.statut));

  return (
    <div className="space-y-6">
      <EnteteSousPage titre="Demandes de devis" mention="Toutes agences confondues" />

      {envoye && <Succes>Devis envoyé. L&apos;agence le compare et vous répond.</Succes>}

      {/* Lecture en échec : le bandeau d'erreur reste seul. Un « À chiffrer (0) »
          dessous contredisait ce qu'il demande de ne pas conclure (24/09). */}
      {sollicitations.erreur ? (
        <Erreur>
          Vos demandes n&apos;ont pas pu être lues à l&apos;instant. Rechargez dans un
          instant plutôt que de conclure qu&apos;il n&apos;y en a pas.
        </Erreur>
      ) : (
        <>
          <section>
            <TitreSection>À chiffrer ({aChiffrer.length})</TitreSection>
            {aChiffrer.length === 0 ? (
              <Vide>
                Aucune demande en attente.
                {fiche?.statut_plateforme === "en_attente"
                  ? " Votre inscription est encore en cours de validation : aucune agence ne peut vous solliciter avant."
                  : ""}
              </Vide>
            ) : (
              <div className="space-y-3">
                {aChiffrer.map((l) => (
                  <CarteSollicitation key={l.sollicitation_id} ligne={l} />
                ))}
              </div>
            )}
          </section>

          {envoyes.length > 0 && (
            <section>
              <TitreSection>Devis envoyés ({envoyes.length})</TitreSection>
              <div className="space-y-3">
                {envoyes.map((l) => (
                  <CarteSollicitation key={l.sollicitation_id} ligne={l} />
                ))}
              </div>
            </section>
          )}

          {sansSuite.length > 0 && (
            <section>
              <TitreSection>Sans suite ({sansSuite.length})</TitreSection>
              <div className="space-y-3">
                {sansSuite.map((l) => (
                  <CarteSollicitation key={l.sollicitation_id} ligne={l} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
