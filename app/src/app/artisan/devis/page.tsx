import { chargerFicheArtisan, chargerSollicitations, verifierAccesArtisan } from "../acces";
import { CarteSollicitation } from "../carte-sollicitation";
import { Carte, Erreur, Succes, TitreSection, Vide } from "../ui";

export const metadata = { title: "Mes demandes de devis — Espace artisan" };

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
  const suite = sollicitations.lignes.filter((l) => l.statut !== "envoyee");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Toutes agences confondues</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">
          Demandes de devis
        </h1>
      </div>

      {envoye && <Succes>Devis envoyé. L&apos;agence le compare et vous répond.</Succes>}

      {sollicitations.erreur && (
        <Erreur>
          Vos demandes n&apos;ont pas pu être lues à l&apos;instant. Rechargez dans un
          instant plutôt que de conclure qu&apos;il n&apos;y en a pas.
        </Erreur>
      )}

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

      {suite.length > 0 && (
        <section>
          <TitreSection>Déjà répondu</TitreSection>
          <div className="space-y-3">
            {suite.map((l) => (
              <CarteSollicitation key={l.sollicitation_id} ligne={l} />
            ))}
          </div>
        </section>
      )}

      <Carte>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Un devis reste valable jusqu&apos;à la date que vous indiquez — trente
          jours par défaut. Passée cette date, il devient caduc et ne peut plus
          être retenu.
        </p>
      </Carte>
    </div>
  );
}
