import { badgeDemandeRdv } from "@/lib/rendez-vous-locataire";
import { ChantiersDansAgenda } from "../clients/resumes";
import Link from "next/link";
import { chargerAgenda, chargerCreneauxMission, chargerDemandesRdv, chargerEchangesNonLus, verifierAccesArtisan, type CreneauMission, type LigneAgenda } from "../acces";
import { consigneDatesProposees, datesAGarder, joursAGarder } from "./dates-a-garder";
import { nonLusPar } from "@/lib/echanges-intervention";
import { CarteMission } from "../carte-mission";
import { creneauTexte, jourCivil, jourLong } from "../libelles";
import { Carte, EnteteSousPage, Erreur, TitreSection, Vide } from "../ui";

export const metadata = { title: "Mon agenda" };

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
 * Tout vient de `mon_agenda_artisan`, sauf les dates proposées au locataire
 * (lot 60, voir `dates-a-garder.ts`) : l'agenda n'en reçoit que le nombre,
 * elles sont lues comme sur la fiche de mission (`mes_creneaux_artisan`).
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
  // Audit 27/09 : le locataire a répondu par ses propres dates — à l'artisan
  // de trancher (A5 : confirmé ou arbitrage).
  if (l.dates_locataire_en_attente > 0)
    return `Le locataire propose ${l.dates_locataire_en_attente} date${l.dates_locataire_en_attente > 1 ? "s" : ""} : à confirmer`;
  // Même formule que l'accueil ; la carte la rend sans flèche, ce n'est pas
  // un geste de l'artisan (24/09).
  if (l.creneaux_en_attente > 0)
    return `${l.creneaux_en_attente} date${l.creneaux_en_attente > 1 ? "s" : ""} au choix du locataire`;
  return "Proposer trois créneaux au locataire";
}

const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Les sept jours à partir d'aujourd'hui, en clé civile (AAAA-MM-JJ). */
function semaineAVenir(aujourdhui: string): Date[] {
  // La date civile de Paris est déjà connue. Midi UTC sert uniquement à
  // parcourir le calendrier, indépendamment du fuseau serveur et des 23/25 h
  // des journées de changement d'heure.
  const depart = new Date(`${aujourdhui}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(depart);
    d.setUTCDate(depart.getUTCDate() + i);
    return d;
  });
}

export default async function PageAgendaArtisan() {
  const { fiche } = await verifierAccesArtisan();
  const [agenda, demandesRdv, echanges] = await Promise.all([chargerAgenda(), chargerDemandesRdv(), chargerEchangesNonLus()]);
  // Audit palier 1 (P1-05) : la mission dont la discussion porte un message à lire le dit sur sa carte.
  const aLire = nonLusPar(echanges.lignes, "intervention_id");
  const badge = (l: LigneAgenda) => badgeDemandeRdv(demandesRdv.lignes.find(d => d.intervention_id === l.intervention_id), l.statut);

  const sansDate = agenda.lignes.filter(
    (l) => !l.debut_prevu && l.statut !== "terminee"
  );
  const maintenant = new Date();
  const aujourdhui = jourCivil(maintenant);
  const datees = agenda.lignes.filter((l) => l.debut_prevu);

  // Regroupement par jour, dans l'ordre où ils arrivent (la base trie déjà par
  // début, les créneaux non posés d'abord).
  const jours = new Map<string, LigneAgenda[]>();
  const historique = new Map<string, LigneAgenda[]>();
  for (const ligne of datees) {
    const cle = jourCivil(ligne.debut_prevu!);
    const calendrier = cle < aujourdhui || ligne.statut === "terminee" ? historique : jours;
    const liste = calendrier.get(cle);
    if (liste) liste.push(ligne);
    else calendrier.set(cle, [ligne]);
  }

  // Lot 60 (E006, E116) : les dates proposées au locataire, à garder libres. Une lecture par mission en attente de sa
  // réponse (il y en a peu) ; une lecture en échec ne se rend pas comme « aucune date » : la carte le dit.
  const enAttenteDuLocataire = sansDate.filter((l) => l.statut === "acceptee" && l.creneaux_en_attente > 0);
  const lectures = await Promise.all(enAttenteDuLocataire.map((l) => chargerCreneauxMission(l.intervention_id)));
  const proposees = new Map<string, CreneauMission[] | null>(
    enAttenteDuLocataire.map((l, i) => [l.intervention_id, lectures[i].erreur ? null : datesAGarder(lectures[i].lignes)])
  );
  const aGarder = joursAGarder([...proposees.values()].filter((c) => c !== null));

  const joursAVenir = [...jours];
  const joursPasses = [...historique];
  const semaine = semaineAVenir(aujourdhui);

  return (
    <div className="space-y-6">
      <EnteteSousPage rubrique="agenda" titre="Mon agenda" mention={jourLong(maintenant.toISOString())} />

      {agenda.erreur && (
        <Erreur>
          Votre agenda n&apos;a pas pu être lu à l&apos;instant. Ne partez pas sur
          une journée vide : rechargez dans un instant.
        </Erreur>
      )}

      {demandesRdv.erreur && <Erreur>Les demandes de report et d’annulation n’ont pas pu être lues. Ouvrez la mission pour vérifier son rendez-vous avant de vous déplacer.</Erreur>}

      {/* La semaine qui vient, en sept cases. Une case avec des rendez-vous
          mène à sa journée ; les autres ne se cliquent pas (rien dessous). */}
      {!agenda.erreur && (
        <Carte>
          <TitreSection>Mes 7 prochains jours</TitreSection>
          <ol className="artisan-semaine grid grid-cols-7 gap-1.5 sm:gap-3" aria-label="Rendez-vous des sept prochains jours">
            {semaine.map((d) => {
              const cle = jourCivil(d);
              const nombre = jours.get(cle)?.length ?? 0;
              const gardees = aGarder.get(cle) ?? 0;
              const estAujourdhui = cle === aujourdhui;
              const contenu = (
                <>
                  <span className="text-[0.75rem] uppercase tracking-wide text-[var(--texte-secondaire)]">
                    {JOURS_COURTS[d.getUTCDay()]}
                  </span>
                  <span className="text-[1.0625rem] font-medium tabular-nums text-[var(--encre)]">
                    {d.getUTCDate()}
                  </span>
                  {(nombre > 0 || gardees === 0) && (
                    <span
                      className={`text-[0.8125rem] tabular-nums ${
                        nombre > 0 ? "font-semibold text-[var(--encre)]" : "text-[var(--texte-secondaire)]"
                      }`}
                      aria-label={
                        nombre > 0
                          ? `${nombre} rendez-vous`
                          : "aucun rendez-vous fixé"
                      }
                    >
                      {nombre > 0 ? `${nombre} rdv` : "—"}
                    </span>
                  )}
                  {/* Un point, pas un chiffre : ce n'est pas un rendez-vous fixé. La légende sous la bande dit ce qu'il signifie. */}
                  {gardees > 0 && (
                    <span data-jour-a-garder={cle} className="flex h-5 items-center">
                      <span aria-hidden className="size-2.5 rounded-full bg-[var(--warning)]" />
                      <span className="sr-only">
                        {gardees > 1 ? `${gardees} dates proposées à un locataire, à garder libres` : "une date proposée à un locataire, à garder libre"}
                      </span>
                    </span>
                  )}
                </>
              );
              const cadre = `flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-[var(--rayon-champ)] border-2 px-1 py-2 ${
                estAujourdhui
                  ? "border-[var(--marque)] bg-[var(--marque-clair)]"
                  : "border-[var(--filet-leger)] bg-[var(--ivoire)]"
              }`;
              return (
                <li key={cle}>
                  {nombre > 0 ? (
                    <Link
                      href={`#jour-${cle}`}
                      className={`${cadre} transition-colors hover:border-[var(--marque)] hover:bg-[var(--survol)]`}
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
          {semaine.some((d) => aGarder.has(jourCivil(d))) && (
            <p data-legende-a-garder className="mt-3 flex items-center gap-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[var(--warning)]" />
              Date proposée à un locataire : à garder libre jusqu&apos;à sa réponse.
            </p>
          )}
        </Carte>
      )}

      {joursAVenir.length > 0 ? (
        joursAVenir.map(([cle, lignes]) => (
          <section key={cle} id={`jour-${cle}`} className="scroll-mt-28">
            <TitreSection>
              {cle === aujourdhui ? "Aujourd'hui — " : ""}
              {jourLong(lignes[0].debut_prevu)}
            </TitreSection>
            <div className="artisan-liste">
              {lignes.map((l) => (
                <CarteMission key={l.intervention_id} ligne={l} badgeRdv={badge(l)} nouveauxMessages={aLire.get(l.intervention_id)} />
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
          Aucune intervention à venir. Les missions que vos clients vous confient apparaissent ici.
          {fiche.statut_plateforme === "en_attente"
            ? " Votre inscription est encore en cours de validation : vous pourrez recevoir de nouvelles demandes après validation."
            : ""}
        </Vide>
      )}

      {sansDate.length > 0 && (
        <section>
          <TitreSection>Sans rendez-vous ({sansDate.length})</TitreSection>
          <div className="artisan-liste">
            {sansDate.map((l) => (
              <CarteMission
                key={l.intervention_id}
                ligne={l}
                badgeRdv={badge(l)}
                nouveauxMessages={aLire.get(l.intervention_id)}
                // Reprise du lot 60 (R6) : le nombre écrit est celui des dates listées dessous, pas le compteur brut.
                aFaire={proposees.has(l.intervention_id) && l.dates_locataire_en_attente === 0 ? consigneDatesProposees(l.creneaux_en_attente, proposees.get(l.intervention_id) ?? null) : consigne(l)}
                plusDeDate={proposees.get(l.intervention_id)?.length === 0}
                datesAGarder={(proposees.get(l.intervention_id) ?? []).map((c) => creneauTexte(c.debut, c.fin))}
              />
            ))}
          </div>
        </section>
      )}

      {/* Les chantiers des clients externes viennent après les missions : l'agenda s'ouvre sur la semaine qui vient. */}
      <ChantiersDansAgenda />

      {joursPasses.length > 0 && (
        <section>
          <TitreSection>Historique des rendez-vous</TitreSection>
          <div className="space-y-6">
            {joursPasses.map(([cle, lignes]) => (
              <div key={cle} id={`historique-${cle}`} className="scroll-mt-28">
                <p className="mb-3 text-[0.9375rem] font-medium text-[var(--texte-secondaire)]">
                  {jourLong(lignes[0].debut_prevu)}
                </p>
                <div className="artisan-liste">
                  {lignes.map((l) => (
                    <CarteMission key={l.intervention_id} ligne={l} badgeRdv={badge(l)} nouveauxMessages={aLire.get(l.intervention_id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
        Cet agenda réunit toutes vos interventions. Chaque client ne
        voit, de son côté, que les siennes.
      </p>
    </div>
  );
}
