import Link from "next/link";
import { chargerAgenda, verifierAccesArtisan, type LigneAgenda } from "../acces";
import { CarteMission } from "../carte-mission";
import { jourCivil, jourLong } from "../libelles";
import { Carte, EnteteSousPage, Erreur, TitreSection, Vide } from "../ui";

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
 *
 * 25/09 (A3) : un artisan vient ici pour savoir QUAND. L'écran s'ouvre donc
 * sur la semaine qui vient — sept cases, une par jour, le chiffre dit combien
 * de rendez-vous y commencent — puis les rendez-vous fixés, jour par jour.
 * Les missions sans date passent en second : elles n'ont pas de « quand ».
 * Aucune lecture nouvelle : tout vient de `mon_agenda_artisan`.
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
  // Même formule que l'accueil ; la carte la rend sans flèche, ce n'est pas
  // un geste de l'artisan (24/09).
  if (l.creneaux_en_attente > 0)
    return `${l.creneaux_en_attente} date${l.creneaux_en_attente > 1 ? "s" : ""} au choix du locataire`;
  return "Proposer trois créneaux au locataire";
}

const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Les sept jours à partir d'aujourd'hui, en clé civile (AAAA-MM-JJ). */
function semaineAVenir(): Date[] {
  const depart = new Date();
  depart.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(depart);
    d.setDate(depart.getDate() + i);
    return d;
  });
}

export default async function PageAgendaArtisan() {
  const { fiche } = await verifierAccesArtisan();
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
  // Les journées passées (interventions terminées, ou dont le rendez-vous est
  // derrière) se lisent après celles qui viennent : on regarde devant soi.
  const joursAVenir = [...jours.entries()].filter(([cle]) => cle >= aujourdhui);
  const joursPasses = [...jours.entries()].filter(([cle]) => cle < aujourdhui);
  const semaine = semaineAVenir();

  return (
    <div className="space-y-6">
      <EnteteSousPage titre="Mon agenda" mention={jourLong(new Date().toISOString())} />

      {agenda.erreur && (
        <Erreur>
          Votre agenda n&apos;a pas pu être lu à l&apos;instant. Ne partez pas sur
          une journée vide : rechargez dans un instant.
        </Erreur>
      )}

      {/* La semaine qui vient, en sept cases. Une case avec des rendez-vous
          mène à sa journée ; les autres ne se cliquent pas (rien dessous). */}
      {!agenda.erreur && (
        <Carte>
          <TitreSection>Les 7 prochains jours</TitreSection>
          <ol className="grid grid-cols-7 gap-1.5 sm:gap-3" aria-label="Rendez-vous des sept prochains jours">
            {semaine.map((d) => {
              const cle = jourCivil(d);
              const nombre = jours.get(cle)?.length ?? 0;
              const estAujourdhui = cle === aujourdhui;
              const contenu = (
                <>
                  <span className="text-[0.75rem] uppercase tracking-wide text-[var(--texte-secondaire)]">
                    {JOURS_COURTS[d.getDay()]}
                  </span>
                  <span className="text-[1.0625rem] font-medium tabular-nums text-[var(--encre)]">
                    {d.getDate()}
                  </span>
                  <span
                    className={`text-[0.8125rem] tabular-nums ${
                      nombre > 0 ? "font-medium text-[var(--marque-sombre)]" : "text-[var(--libelle)]"
                    }`}
                    aria-label={
                      nombre > 0
                        ? `${nombre} rendez-vous`
                        : "aucun rendez-vous"
                    }
                  >
                    {nombre > 0 ? `${nombre} rdv` : "—"}
                  </span>
                </>
              );
              const cadre = `flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-1 py-2 ${
                estAujourdhui
                  ? "border-[var(--marque)] bg-[var(--marque-clair)]"
                  : "border-[var(--filet-leger)] bg-[var(--ivoire)]"
              }`;
              return (
                <li key={cle}>
                  {nombre > 0 ? (
                    <Link
                      href={`#jour-${cle}`}
                      className={`${cadre} transition-colors hover:border-[var(--encre)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)]`}
                    >
                      {contenu}
                    </Link>
                  ) : (
                    <div className={cadre}>{contenu}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Carte>
      )}

      {joursAVenir.length > 0 ? (
        joursAVenir.map(([cle, lignes]) => (
          <section key={cle} id={`jour-${cle}`} className="scroll-mt-28">
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
      ) : agenda.erreur ? null : sansDate.length > 0 ? (
        // Rien de fixé, mais des missions attendent une date : l'état vide
        // renvoie à la liste juste dessous plutôt qu'ailleurs.
        <Vide>
          Aucun rendez-vous fixé pour l&apos;instant. Les missions ci-dessous en
          attendent un.
        </Vide>
      ) : (
        // Un état vide qui mène quelque part (24/09) : ce sont les
        // attestations qui ouvrent les affectations.
        <Vide action={{ href: "/artisan/attestations", libelle: "Mes attestations" }}>
          Aucune intervention à votre agenda. Les missions qu&apos;une agence vous
          confie apparaissent ici, quelle que soit l&apos;agence.
          {fiche.statut_plateforme === "en_attente"
            ? " Votre inscription est encore en cours de validation : aucune agence ne peut vous solliciter avant."
            : ""}
        </Vide>
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

      {joursPasses.length > 0 && (
        <section>
          <TitreSection>Journées passées</TitreSection>
          <div className="space-y-6">
            {joursPasses.map(([cle, lignes]) => (
              <div key={cle} id={`jour-${cle}`} className="scroll-mt-28">
                <p className="mb-3 text-[0.9375rem] font-medium text-[var(--texte-secondaire)]">
                  {jourLong(lignes[0].debut_prevu)}
                </p>
                <div className="space-y-3">
                  {lignes.map((l) => (
                    <CarteMission key={l.intervention_id} ligne={l} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
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
