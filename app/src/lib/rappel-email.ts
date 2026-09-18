// Le rappel de rendez-vous, écrit une seule fois — mais pas dit de la même
// façon aux deux destinataires.
//
// Le locataire doit ÊTRE LÀ : ce qui compte pour lui, c'est l'heure, la durée,
// et quoi faire s'il ne peut pas. L'artisan doit VENIR : ce qui compte pour
// lui, c'est l'adresse, le désordre à traiter et la référence du dossier.
// Envoyer le même texte aux deux, c'est obliger chacun à trier ce qui le
// concerne dans un message écrit pour l'autre.

export type Rappel = {
  /** « veille » ou « j7 » — ce que le message annonce n'est pas la même chose. */
  echeance: "veille" | "j7";
  destinataire: "locataire" | "artisan";
  prenom?: string | null;
  emetteur: string;
  artisan: string;
  lot: string;
  adresseBien: string;
  debutPrevu: string;
  finPrevue?: string | null;
  incidentNumero: string;
  categorie: string;
};

const FUSEAU = "Europe/Paris";

/** « mardi 6 octobre ». Le jour de la semaine aide plus que la date seule. */
export function jourDuRendezVous(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: FUSEAU,
  });
}

/** « 9 h 30 ». Les rendez-vous se disent à l'heure de Paris, jamais en UTC. */
export function heureDuRendezVous(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU })
    .replace(":", " h ");
}

/** « de 9 h 00 à 11 h 00 », ou « à 9 h 00 » quand la fin n'est pas connue. */
export function creneauEnToutesLettres(debut: string, fin?: string | null): string {
  return fin
    ? `de ${heureDuRendezVous(debut)} à ${heureDuRendezVous(fin)}`
    : `à ${heureDuRendezVous(debut)}`;
}

export function sujetRappel(r: Pick<Rappel, "echeance" | "debutPrevu">): string {
  return r.echeance === "veille"
    ? `Rappel — intervention demain, ${creneauEnToutesLettres(r.debutPrevu)}`
    : `Intervention prévue ${jourDuRendezVous(r.debutPrevu)}`;
}

export function corpsRappel(r: Rappel): string {
  const quand = `${jourDuRendezVous(r.debutPrevu)} ${creneauEnToutesLettres(r.debutPrevu, r.finPrevue)}`;
  // « demain » n'est vrai que la veille. À J-7 on nomme le jour, sans quoi le
  // message serait faux d'une semaine.
  const annonce =
    r.echeance === "veille"
      ? `Petit rappel : une intervention est prévue <strong>demain</strong>, ${creneauEnToutesLettres(r.debutPrevu, r.finPrevue)}.`
      : `Pour mémoire, une intervention est prévue dans une semaine, <strong>${quand}</strong>.`;

  const pourLeLocataire = `
      <p>${annonce}</p>
      <ul>
        <li>Logement : ${r.lot} — ${r.adresseBien}</li>
        <li>Motif : ${r.categorie}</li>
        <li>Intervenant : ${r.artisan}</li>
      </ul>
      <p>Merci de permettre l'accès au logement sur ce créneau. Si vous ne
         pouvez pas être présent, prévenez-nous au plus tôt : un rendez-vous
         manqué décale l'intervention et peut être facturé.</p>`;

  const pourLArtisan = `
      <p>${annonce}</p>
      <ul>
        <li>Adresse : ${r.adresseBien} — ${r.lot}</li>
        <li>Désordre signalé : ${r.categorie}</li>
        <li>Dossier : ${r.incidentNumero}</li>
      </ul>
      <p>Le locataire a été prévenu du même créneau. En cas d'empêchement,
         signalez-le depuis votre espace : une absence non prévenue pèse sur
         votre fiabilité.</p>`;

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#151b2b">
      <h2 style="color:#0f2352">${r.echeance === "veille" ? "Intervention demain" : "Intervention la semaine prochaine"}</h2>
      <p>Bonjour${r.prenom ? " " + r.prenom : ""},</p>
      ${r.destinataire === "locataire" ? pourLeLocataire : pourLArtisan}
      <p>— ${r.emetteur}</p>
    </div>`;
}
