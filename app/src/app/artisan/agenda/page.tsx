import { chargerAgenda, verifierAccesArtisan, type LigneAgenda } from "../acces";
import { CarteMission } from "../carte-mission";
import { jourCivil, jourLong } from "../libelles";
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
/**
 * Ce qui reste à faire sur une mission sans date — et par qui.
 *
 * Trois cas, pas deux : la mission attend d'être acceptée ; elle est acceptée
 * et personne n'a proposé de date ; des dates sont posées et c'est au
 * locataire de trancher. Le troisième cas n'est PAS une action de l'artisan :
 * lui répéter « proposez trois créneaux » le pousserait à reproposer, ce qui
 * annule les dates en cours (RM-10.4.1 — le compteur de tours avance alors
 * vers l'arbitrage du gérant sans que personne n'ait rien refusé).
 */
function consigne(l: LigneAgenda): string {
  if (l.statut === "proposee") return "Accepter ou refuser";
  if (l.creneaux_en_attente > 0)
    return `${l.creneaux_en_attente} date${l.creneaux_en_attente > 1 ? "s" : ""} proposée${l.creneaux_en_attente > 1 ? "s" : ""} — au locataire de choisir`;
  return "Proposer trois créneaux au locataire";
}

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
    const cle = jourCivil(ligne.debut_prevu!);
    const liste = jours.get(cle);
    if (liste) liste.push(ligne);
    else jours.set(cle, [ligne]);
  }

  const aujourdhui = jourCivil(new Date());

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
                aFaire={consigne(l)}
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
