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

/** « r•••@example.com » : la première lettre, puis le domaine. Jamais l'adresse entière à l'écran. */
export function masquerAdresse(adresse: string): string {
  const arobase = adresse.lastIndexOf("@");
  if (arobase < 1) return "•••";
  return `${adresse.slice(0, 1)}•••${adresse.slice(arobase)}`;
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

export type EtatTacheSignalee = "echec" | "absente" | "non_programmee";

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
};

function totalAlertes(c: ConstatRelais): number {
  return c.alertes ? c.alertes.ouvertes + c.alertes.escaladees + c.alertes.non_acheminees : 0;
}

/** Le nombre de points à vérifier. Zéro : aucun e-mail ne part. */
export function pointsDuRelais(c: ConstatRelais): number {
  return c.arrets.length + totalAlertes(c) + c.taches.length + c.lecturesImpossibles.length + (c.relaisNonActualise ? 1 : 0);
}

/** Ce que le registre du relais garde du constat : des nombres seulement. */
export function compteursDuRelais(c: ConstatRelais, adressesIgnorees = 0): Record<string, number> {
  return {
    arrets_actifs: c.arrets.length,
    alertes_ouvertes: c.alertes?.ouvertes ?? 0,
    alertes_escaladees: c.alertes?.escaladees ?? 0,
    alertes_non_acheminees: c.alertes?.non_acheminees ?? 0,
    taches_en_echec: c.taches.filter((t) => t.etat === "echec").length,
    taches_absentes: c.taches.filter((t) => t.etat !== "echec").length,
    lectures_impossibles: c.lecturesImpossibles.length + (c.relaisNonActualise ? 1 : 0),
    adresses_ignorees: adressesIgnorees,
  };
}

export function sujetAlerteRelais(points: number): string {
  return `Gerimmo — relais de 5 h : ${points} point${points > 1 ? "s" : ""} à vérifier`;
}

function echapper(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ETAT_TACHE: Record<EtatTacheSignalee, string> = {
  echec: "en échec",
  absente: "absente (pas passée à l’heure prévue)",
  non_programmee: "plus programmée dans la base",
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
  const impossibles = [...c.lecturesImpossibles, ...(c.relaisNonActualise ? ["Le relais du mode vacances n’a pas pu être actualisé : ses chiffres datent du dernier passage."] : [])];
  if (impossibles.length) {
    blocs.push(`<p style="${titre}">Contrôles impossibles</p>` + liste(impossibles));
  }
  return `
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f2352">
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 8px">Relais du ${echapper(jour)}, 5 h (heure de Paris)</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 4px">${points} point${points > 1 ? "s" : ""} à vérifier</h1>
  ${blocs.join("\n  ")}
  <p style="margin:22px 0 20px">
    <a href="${echapper(lienConsole)}" style="display:inline-block;background:#2457f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Ouvrir la console</a>
  </p>
  <p style="font-size:13px;color:#53617a;margin:0">Cet e-mail part au plus une fois par jour, vers 5 h (heure de Paris), et seulement s’il y a quelque chose à signaler. Il ne contient ni nom ni montant ; rien ne se décide depuis lui : les gestes se font dans la console.</p>
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
};

/** Le résultat d'un passage, en français. */
export function resultatPassageRelais(p: PassageRelais): string {
  const pts = `${p.points} point${p.points > 1 ? "s" : ""} signalé${p.points > 1 ? "s" : ""}`;
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
