// L'ALERTE E-MAIL DU RELAIS (D46-B, décisions du dirigeant du 15/10/2026) — la partie sans effet.
//
// Réponses du dirigeant : responsable du relais = le dirigeant ; canal = e-mail vers deux adresses ; horaire = 05 h 00,
// heure de Paris, été comme hiver. Les adresses ne sont JAMAIS dans le dépôt (public) : elles viennent de la variable du
// serveur GERIMMO_RELAIS_EMAILS, lue par `lib/relais-alerte-envoi.ts` (serveur seulement). Ce module-ci ne lit aucune
// variable d'environnement : il calcule l'heure, lit une liste, masque une adresse et compose le message.
//
// Le message ne porte que des compteurs, des libellés de tâche (constantes de l'application) et un lien vers la
// console : jamais un nom, une adresse, un montant, le titre d'une alerte ni le motif d'un arrêt (textes libres).

import { composantesParis } from "./heure-paris-calcul";
import { formaterDateHeureParis } from "./heure-paris";
import { emailValide } from "./marque-organisation";
import { arretSansEffet, nomArret } from "./nom-arret-supervision";
import { DELAI_URGENCE_MAX_MINUTES, INTERVALLE_PASSAGE_URGENCES_MINUTES, libelleSortEmail, libelleUrgence, type UrgenceRecente } from "./relais-urgences";

/** L'heure de l'alerte, à Paris (05 h 00, été comme hiver). */
export const HEURE_RELAIS_PARIS = 5;
/** Au-delà, les adresses sont ignorées (et comptées comme telles). */
export const MAX_ADRESSES_RELAIS = 10;
/** Sans passage du relais depuis ce délai, l'écran le signale (une journée et sa marge, comme Santé). */
export const RETARD_RELAIS_HEURES = 26;

/**
 * Est-il 5 h à Paris ? Vercel ne connaît que l'UTC : la route est appelée à 03 h et 04 h UTC, et seule celle qui tombe
 * à 5 h à Paris agit (03 h UTC en heure d'été, 04 h UTC en heure d'hiver). Même motif que la parution marketing de
 * 9 h, dont la base calcule l'instant de Paris (`instant_paris`, miroir `lib/heure-paris-calcul.ts`).
 */
export function estHeureDuRelais(instant: Date): boolean {
  return composantesParis(instant).heure === HEURE_RELAIS_PARIS;
}

export type AdressesRelais = {
  /** Les adresses retenues, sans doublon, dans l'ordre de la variable. */
  valides: string[];
  /** Les morceaux ignorés : adresse invalide, ou au-delà de MAX_ADRESSES_RELAIS. */
  invalides: number;
  /** Au moins une adresse valide. */
  configure: boolean;
};

/** Lit la liste du réglage : virgules, espaces tolérés ; adresses invalides ignorées et comptées. */
export function lireAdressesRelais(valeur: string | null | undefined): AdressesRelais {
  const valides: string[] = [];
  const vues = new Set<string>();
  let invalides = 0;
  for (const morceau of (valeur ?? "").split(",")) {
    const adresse = morceau.trim();
    if (!adresse) continue;
    if (!emailValide(adresse)) { invalides++; continue; }
    const cle = adresse.toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    if (valides.length >= MAX_ADRESSES_RELAIS) { invalides++; continue; }
    valides.push(adresse);
  }
  return { valides, invalides, configure: valides.length > 0 };
}

/**
 * « re•••is@example.com » : les deux premiers et les deux derniers caractères avant @, puis le domaine — assez pour
 * distinguer deux adresses du même domaine (décision du 15/10), jamais l'adresse entière : au moins un caractère reste
 * caché, et le nombre de caractères cachés ne se lit pas (toujours « ••• »). Partie avant @ de 3 ou 4 caractères :
 * le premier et le dernier ; de 2 : le premier ; d'un seul : rien.
 */
export function masquerAdresse(adresse: string): string {
  const arobase = adresse.lastIndexOf("@");
  if (arobase < 1) return "•••";
  const nom = adresse.slice(0, arobase);
  const visibles = nom.length >= 5 ? 2 : nom.length >= 3 ? 1 : 0;
  const debut = nom.length === 2 ? nom.slice(0, 1) : nom.slice(0, visibles);
  const fin = visibles > 0 ? nom.slice(-visibles) : "";
  return `${debut}•••${fin}${adresse.slice(arobase)}`;
}

/** La phrase que la console affiche : ce qui part vraiment, ou « relais non configuré ». */
export function descriptionRelais(a: AdressesRelais): string {
  if (!a.configure) {
    return "Relais non configuré : aucune alerte e-mail ne part. Les adresses se renseignent dans le réglage GERIMMO_RELAIS_EMAILS du serveur.";
  }
  const n = a.valides.length;
  return `Alerte e-mail quotidienne à 5 h (heure de Paris) vers ${n} adresse${n > 1 ? "s" : ""} : ${a.valides.map(masquerAdresse).join(", ")}.`;
}

/** « 1 adresse du réglage est invalide et a été ignorée. », ou null. */
export function avertissementAdresses(a: AdressesRelais): string | null {
  if (a.invalides === 0) return null;
  return a.invalides > 1
    ? `${a.invalides} adresses du réglage sont invalides ou en trop et ont été ignorées.`
    : "1 adresse du réglage est invalide ou en trop et a été ignorée.";
}

// ── Le constat et le message ──────────────────────────────────────────────────────────────────────────────────────

export type EtatTacheSignalee = "echec" | "absente" | "non_programmee" | "sans_passage";

export type ConstatRelais = {
  /** Les arrêts d'urgence actifs (clé, depuis quand) ; jamais leur motif. */
  arrets: { cle: string; depuis: string | null }[];
  /** Les alertes du mode vacances non accusées ; null quand elles n'ont pas pu être lues. */
  alertes: { ouvertes: number; escaladees: number; non_acheminees: number } | null;
  /** Les tâches planifiées (celles de l’écran Santé et celles de pg_cron) en échec ou absentes sur les dernières 24 h. */
  taches: { libelle: string; etat: EtatTacheSignalee }[];
  /** Les contrôles qui n'ont pas pu se faire (libellés constants). */
  lecturesImpossibles: string[];
  /** Le relais du mode vacances n'a pas pu être actualisé avant la lecture. */
  relaisNonActualise: boolean;
  /**
   * Le rappel des urgences posées dans les dernières 24 h (décision du 15/10 : y compris celles dont l'e-mail immédiat
   * est déjà parti) : les 50 plus récentes et leur nombre total. Absent ou null : rien à rappeler, ou lecture impossible
   * (alors comptée dans `lecturesImpossibles`).
   */
  urgences?: { liste: UrgenceRecente[]; total: number } | null;
  /**
   * Les demandes de contact du site vitrine non traitées (M16, audit du 19/10 ; `demandes_contact_en_attente`) : leur
   * nombre et, parmi elles, celles reçues il y a plus de 48 h. Jamais une donnée de la demande. Absent : non demandé ;
   * null : comptage impossible (alors compté dans `lecturesImpossibles`).
   */
  contacts?: ContactsEnAttente | null;
  /** Agences non contactées ; null : lecture impossible, absent : non demandé. */
  agences?: { en_attente: number } | null;
};

export type ContactsEnAttente = { en_attente: number; depuis_plus_de_48h: number };

function totalAlertes(c: ConstatRelais): number {
  return c.alertes ? c.alertes.ouvertes + c.alertes.escaladees + c.alertes.non_acheminees : 0;
}

/** Décision du 19/10 : UN point au total dès qu'il reste au moins une demande de contact non traitée, quel que soit leur nombre. */
function pointDesContacts(c: ConstatRelais): number {
  return c.contacts && c.contacts.en_attente > 0 ? 1 : 0;
}

/** Le nombre de points à vérifier. Zéro : aucun e-mail ne part. */
export function pointsDuRelais(c: ConstatRelais): number {
  return c.arrets.length + totalAlertes(c) + c.taches.length + c.lecturesImpossibles.length + (c.relaisNonActualise ? 1 : 0) + pointDesContacts(c) + (c.agences && c.agences.en_attente > 0 ? 1 : 0);
}

/**
 * Le point, tel que l'e-mail l'écrit (décision du 19/10) : « Demandes de contact du site vitrine — en attente de
 * réponse : N (dont M depuis plus de 48 h) » ; le titre du bloc, puis sa ligne. Des nombres seulement. La parenthèse
 * n'est écrite que si au moins une demande attend depuis plus de 48 h (relecture du 19/10 : « dont 0 » n'apprend rien).
 */
export const TITRE_CONTACTS_EN_ATTENTE = "Demandes de contact du site vitrine";
export function ligneContactsEnAttente(contacts: ContactsEnAttente): string {
  const anciennes = contacts.depuis_plus_de_48h > 0 ? ` (dont ${contacts.depuis_plus_de_48h} depuis plus de 48 h)` : "";
  return `En attente de réponse : ${contacts.en_attente}${anciennes}`;
}

/** Le nombre d'urgences des dernières 24 h que l'e-mail de 5 h rappelle (elles suffisent à le faire partir). */
export function urgencesDuRelais(c: ConstatRelais): number {
  return c.urgences?.total ?? 0;
}

/** Ce que le registre du relais garde du constat : des nombres seulement. */
export function compteursDuRelais(c: ConstatRelais, adressesIgnorees = 0): Record<string, number> {
  return {
    arrets_actifs: c.arrets.length,
    alertes_ouvertes: c.alertes?.ouvertes ?? 0,
    alertes_escaladees: c.alertes?.escaladees ?? 0,
    alertes_non_acheminees: c.alertes?.non_acheminees ?? 0,
    taches_en_echec: c.taches.filter((t) => t.etat === "echec" || t.etat === "sans_passage").length,
    taches_absentes: c.taches.filter((t) => t.etat === "absente" || t.etat === "non_programmee").length,
    lectures_impossibles: c.lecturesImpossibles.length + (c.relaisNonActualise ? 1 : 0),
    adresses_ignorees: adressesIgnorees,
    urgences_24h: urgencesDuRelais(c),
    demandes_contact_en_attente: c.contacts?.en_attente ?? 0,
    demandes_contact_48h: c.contacts?.depuis_plus_de_48h ?? 0,
    agences_en_attente: c.agences?.en_attente ?? 0,
  };
}

const enUrgences = (n: number) => `${n} urgence${n > 1 ? "s" : ""} en 24 h`;

export function sujetAlerteRelais(points: number, urgences = 0): string {
  if (points === 0 && urgences > 0) return `Gerimmo — relais de 5 h : rappel, ${enUrgences(urgences)}`;
  return `Gerimmo — relais de 5 h : ${points} point${points > 1 ? "s" : ""} à vérifier${urgences > 0 ? `, ${enUrgences(urgences)}` : ""}`;
}

function echapper(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ETAT_TACHE: Record<EtatTacheSignalee, string> = {
  echec: "en échec",
  absente: "absente (pas passée à l’heure prévue)",
  non_programmee: "plus programmée dans la base",
  sans_passage: "lancée à l’heure, mais le serveur n’a reçu aucun passage depuis plus de 30 minutes (extension pg_net, adresse du site ou jeton à vérifier)",
};

/** Le corps de l'e-mail : compteurs, libellés de tâche, lien de la console. */
export function htmlAlerteRelais(c: ConstatRelais, maintenant: Date, lienConsole: string): string {
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(maintenant);
  const points = pointsDuRelais(c);
  const titre = "font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:18px 0 6px";
  const liste = (lignes: string[]) => `<ul style="margin:0;padding-left:20px;line-height:1.6">${lignes.map((l) => `<li>${echapper(l)}</li>`).join("")}</ul>`;
  const blocs: string[] = [];
  if (c.arrets.length) {
    blocs.push(`<p style="${titre}">Arrêt d’urgence</p>` + liste(c.arrets.map((a) =>
      `${arretSansEffet(a.cle) ? "Arrêt enregistré sans effet" : "Arrêt d’urgence en cours"} : ${nomArret(a.cle)}${a.depuis ? `, depuis le ${formaterDateHeureParis(a.depuis)}` : ""}`)));
  }
  if (c.alertes && totalAlertes(c) > 0) {
    blocs.push(`<p style="${titre}">Alertes du mode vacances non accusées</p>` + liste([
      `À examiner : ${c.alertes.ouvertes}`,
      `Escaladées (délai dépassé) : ${c.alertes.escaladees}`,
      `Non acheminées (responsable sans habilitation) : ${c.alertes.non_acheminees}`,
    ]));
  }
  if (c.taches.length) {
    blocs.push(`<p style="${titre}">Tâches planifiées, dernières 24 h</p>` + liste(c.taches.map((t) => `${t.libelle} : ${ETAT_TACHE[t.etat]}`)));
  }
  // M16 : le nombre des demandes de contact du site vitrine qui attendent une réponse ; jamais leur contenu.
  if (c.agences && c.agences.en_attente > 0) {
    blocs.push(`<p style="${titre}">Liste d’attente des agences</p>` + liste([`Agences en attente : ${c.agences.en_attente}`]));
  }
  if (c.contacts && c.contacts.en_attente > 0) {
    blocs.push(`<p style="${titre}">${TITRE_CONTACTS_EN_ATTENTE}</p>` + liste([ligneContactsEnAttente(c.contacts)]));
  }
  const rappel = c.urgences && c.urgences.total > 0 ? c.urgences : null;
  if (rappel) {
    const autres = rappel.total - rappel.liste.length;
    blocs.push(`<p style="${titre}">Urgences des dernières 24 h (rappel)</p>` + liste([
      ...rappel.liste.map((u) => `${formaterDateHeureParis(u.posee_le)} — ${libelleUrgence(u.nature)} : ${libelleSortEmail(u.email)}`),
      ...(autres > 0 ? [`Et ${autres} autre${autres > 1 ? "s" : ""}, à lire dans la console`] : []),
    ]));
  }
  const impossibles = [...c.lecturesImpossibles, ...(c.relaisNonActualise ? ["Le relais du mode vacances n’a pas pu être actualisé : ses chiffres datent du dernier passage."] : [])];
  if (impossibles.length) {
    blocs.push(`<p style="${titre}">Contrôles impossibles</p>` + liste(impossibles));
  }
  const urgences = urgencesDuRelais(c);
  const entete = points > 0 || urgences === 0
    ? `${points} point${points > 1 ? "s" : ""} à vérifier`
    : `Rappel : ${urgences} urgence${urgences > 1 ? "s" : ""} des dernières 24 h`;
  return `
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#14304f">
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 8px">Relais du ${echapper(jour)}, 5 h (heure de Paris)</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 4px">${entete}</h1>
  ${blocs.join("\n  ")}
  <p style="margin:22px 0 20px">
    <a href="${echapper(lienConsole)}" style="display:inline-block;background:#14304f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Ouvrir la console</a>
  </p>
  <p style="font-size:13px;color:#53617a;margin:0">Cet e-mail part au plus une fois par jour, vers 5 h (heure de Paris), et seulement s’il y a quelque chose à signaler. Les urgences partent aussi dans un e-mail immédiat, au plus ${DELAI_URGENCE_MAX_MINUTES} minutes après l’événement (un passage automatique les constate toutes les ${INTERVALLE_PASSAGE_URGENCES_MINUTES} minutes) ; il les rappelle ici. Il ne contient ni nom ni montant ; rien ne se décide depuis lui : les gestes se font dans la console.</p>
</div>`;
}

// ── Le registre, à l'écran ────────────────────────────────────────────────────────────────────────────────────────

export type PassageRelais = {
  jour: string;
  statut: string;
  destinataires: number;
  envoyes: number;
  points: number;
  commence_le: string;
  termine_le: string | null;
  /** Les compteurs du passage (des nombres) ; `urgences_24h` depuis la décision du 15/10. */
  compteurs?: Record<string, unknown> | null;
};

/** Le résultat d'un passage, en français. */
export function resultatPassageRelais(p: PassageRelais): string {
  const u = typeof p.compteurs?.urgences_24h === "number" ? p.compteurs.urgences_24h : 0;
  // Un e-mail parti pour le seul rappel des urgences des dernières 24 h (décision du 15/10) ne dit pas « 0 point ».
  const pts = p.points === 0 && u > 0
    ? `rappel de ${u} urgence${u > 1 ? "s" : ""} des dernières 24 h`
    : `${p.points} point${p.points > 1 ? "s" : ""} signalé${p.points > 1 ? "s" : ""}${u > 0 ? `, ${u} urgence${u > 1 ? "s" : ""} rappelée${u > 1 ? "s" : ""}` : ""}`;
  switch (p.statut) {
    case "envoye": return `e-mail envoyé à ${p.envoyes} adresse${p.envoyes > 1 ? "s" : ""} (${pts})`;
    case "envoi_partiel": return `e-mail envoyé à ${p.envoyes} adresse${p.envoyes > 1 ? "s" : ""} sur ${p.destinataires} ; les autres envois ont échoué (${pts})`;
    case "echec": return `échec de l’envoi : aucun e-mail confirmé (${pts})`;
    case "rien_a_signaler": return "rien à signaler, aucun e-mail envoyé";
    case "non_configure": return `relais non configuré, aucun e-mail envoyé (${pts})`;
    case "en_cours": return "passage en cours";
    default: return "résultat inconnu";
  }
}

/** Le relais n'est pas passé depuis plus de 26 h (ou jamais) alors qu'il est configuré. */
export function relaisEnRetard(dernier: PassageRelais | null, maintenant: Date = new Date()): boolean {
  if (!dernier) return true;
  return maintenant.getTime() - new Date(dernier.commence_le).getTime() > RETARD_RELAIS_HEURES * 3_600_000;
}
