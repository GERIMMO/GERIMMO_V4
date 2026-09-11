import { chargerAgenda, verifierAccesArtisan, type LigneAgenda } from "../acces";
import { CarteMission } from "../carte-mission";
import { jourLong } from "../libelles";
import { Carte, Erreur, TitreSection, Vide } from "../ui";

export const metadata = { title: "Mon agenda — Espace artisan" };

/**
 * L'AGENDA TOUTES AGENCES CONFONDUES (RM-19.3.3, RM-10.7.3).
 *
 * C'est le seul écran du produit qui traverse les organisations, et c'est
 * volontaire : l'artisan ne travaille pas « dans » une agence, il enchaîne les
 * chantiers de plusieurs. Un agenda par agence lui ferait ouvrir trois
 * portails pour savoir ce qu'il fait mardi.
 *
 * Ce qui rend la chose sûre tient en une phrase : `mon_agenda_artisan` n'a
 * AUCUN paramètre d'organisation. Il n'existe pas d'argument permettant de
 * demander l'agenda d'une autre agence, ni celui d'un autre artisan — le seul
 * filtre d'appartenance est `mon_artisan_id()`, déduit de `auth.uid()`. Cette
 * page ne fait que ranger par jour ce que la base a bien voulu rendre.
 *
 * Et puisque les agences se mélangent, LA MARQUE DE L'AGENCE EST SUR CHAQUE
 * LIGNE (RM-19.3.3 / RM-17.3.2), pas en tête d'écran : c'est elle qui dit,
 * à 14 h, pour qui on travaille.
 */
export default async function PageAgendaArtisan() {
  await verifierAccesArtisan();
  const agenda = await chargerAgenda();

  const sansDate = agenda.lignes.filter(
    (l) => !l.debut_prevu && l.statut !== "terminee"
  );
  const datees = agenda.lignes.filter((l) => l.debut_prevu);

  // Regroupement par jour, dans l'ordre où ils arrivent (la base trie déjà par
  // début, les créneaux non posés d'abord).
  const jours = new Map<string, LigneAgenda[]>();
  for (const ligne of datees) {
    const cle = new Date(ligne.debut_prevu!).toISOString().slice(0, 10);
    const liste = jours.get(cle);
    if (liste) liste.push(ligne);
    else jours.set(cle, [ligne]);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Toutes agences confondues</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">Mon agenda</h1>
      </div>

      {agenda.erreur && (
        <Erreur>
          Votre agenda n&apos;a pas pu être lu à l&apos;instant. Ne partez pas sur
          une journée vide : rechargez dans un instant.
        </Erreur>
      )}

      {sansDate.length > 0 && (
        <section>
          <TitreSection>Sans rendez-vous ({sansDate.length})</TitreSection>
          <div className="space-y-3">
            {sansDate.map((l) => (
              <CarteMission
                key={l.intervention_id}
                ligne={l}
                aFaire={
                  l.statut === "proposee"
                    ? "Accepter ou refuser"
                    : "Proposer trois créneaux au locataire"
                }
              />
            ))}
          </div>
        </section>
      )}

      {jours.size === 0 && sansDate.length === 0 ? (
        <Vide>
          Aucune intervention à votre agenda. Les missions qu&apos;une agence vous
          confie apparaissent ici, quelle que soit l&apos;agence.
        </Vide>
      ) : (
        [...jours.entries()].map(([cle, lignes]) => (
          <section key={cle}>
            <TitreSection>
              {cle === aujourdhui ? "Aujourd'hui — " : ""}
              {jourLong(lignes[0].debut_prevu)}
            </TitreSection>
            <div className="space-y-3">
              {lignes.map((l) => (
                <CarteMission key={l.intervention_id} ligne={l} />
              ))}
            </div>
          </section>
        ))
      )}

      <Carte>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Cet agenda réunit vos interventions de toutes les agences. Chacune ne
          voit, de son côté, que les siennes.
        </p>
      </Carte>
    </div>
  );
}
