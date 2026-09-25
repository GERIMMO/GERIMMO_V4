// Les e-mails qui préviennent quelqu'un qu'un geste l'attend (25/09).
//
// AVANT CE FICHIER, rien ne partait : l'artisan apprenait une demande de devis
// en ouvrant son portail, le locataire découvrait des créneaux à choisir en
// ouvrant son espace, l'agence lisait un incident urgent à sa prochaine
// connexion. La « notification » était un changement de statut que personne ne
// voyait sans venir le chercher — et un dossier où personne ne vient s'arrête.
//
// TROIS PARTIS PRIS.
// 1. Un e-mail court, un seul lien : là où le geste se fait. Le détail du
//    dossier est dans l'écran, pas dans le message.
// 2. Un échec d'envoi ne fait JAMAIS échouer l'action métier. La demande de
//    devis existe dès que la base l'a écrite ; si le courrier ne part pas, on le
//    consigne (`tech_log`) et l'action rend son succès. Rien ici ne lève.
// 3. Le journal ne porte aucune adresse : des identifiants, un rôle, un motif.
//
// MARQUE BLANCHE : l'expéditeur, l'en-tête et le nom signé sont ceux de
// l'organisation (`envoyerEmail` s'en charge avec `organisation`). Le nom
// « Gerimmo » n'apparaît jamais dans un message au locataire.
//
// QUI LIT QUOI. Depuis une action serveur, les lectures passent par le client
// de l'utilisateur, donc par la RLS : un gérant lit ses incidents, ses
// personnes, les artisans rattachés ; un locataire ne lit son agence que par
// `mon_gestionnaire_locataire`. La tâche planifiée (`envoyerRappelsGestes`)
// reçoit le client de service, qui voit tout et doit rester dans `/api/cron`.
//
// L'EXCEPTION, ET SA CLÔTURE (25/09, `notifierEnCoulisses`). Quand c'est
// l'artisan ou le locataire qui agit (devis déposé, mission refusée, créneaux
// proposés ou choisis), la personne à prévenir est de l'autre côté de la RLS :
// leur client ne lit ni `incidents`, ni `incident_interventions`, ni `persons`,
// ni `organizations` (vérifié sur le banc : toutes ces policies sont gérant
// seul). Une RPC definer qui rendrait l'adresse du locataire, ou celle du
// gérant, à une session d'artisan élargirait ce que l'artisan a le droit de
// lire — juste pour un e-mail. On préfère le client de service, mais STRICTEMENT
// après que la RPC métier (definer, `mon_artisan_id()` / `ma_personne_locataire`)
// a accepté l'écriture : c'est elle qui prouve le lien. Le client de service ne
// sert alors qu'à lire ce que le message dit, à envoyer, et à journaliser ; il
// ne remonte jamais dans la réponse, et l'organisation vient de la lecture
// RPC, jamais du formulaire.
//
// La partie haute du fichier est PURE (gabarits, clés, filtrage des rappels) :
// c'est elle que `tests/notifications.test.ts` exerce. La partie basse lit la
// base et envoie.

import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerEmail } from "./email";
import { eur } from "./ged";
import { titreIncident } from "./incidents";
import { echapperMarque, emailValide, nomMarque } from "./marque-organisation";
import { chargerMarque } from "./marque-organisation-serveur";
import { creneauEnToutesLettres, jourDuRendezVous } from "./rappel-email";
import { adresseDuSite } from "./site";
import { clientDeService } from "./supabase/service";

// ============================================================
// Partie pure — gabarits
// ============================================================

export type Message = { sujet: string; html: string };
export type Role = "artisan" | "locataire" | "agence";

type Gabarit = {
  titre: string;
  prenom?: string | null;
  /** Des phrases en texte brut : le gabarit les échappe. */
  lignes: string[];
  /** Le geste attendu et où le faire. `lien` nul : on dit le geste sans promettre un clic. */
  action?: { libelle: string; lien: string | null };
  emetteur: string;
};

/**
 * Un seul habillage pour toutes les notifications : titre, bonjour, quelques
 * phrases, UN bouton, la signature de l'émetteur. Le bouton reprend l'action en
 * lien texte au-dessous — les clients mail qui perdent les styles gardent le lien.
 */
export function gabaritNotification(g: Gabarit): string {
  const e = echapperMarque;
  const paragraphes = g.lignes.map((l) => `<p>${e(l)}</p>`).join("\n      ");
  const action = g.action
    ? g.action.lien
      ? `<p style="margin:20px 0"><a href="${e(g.action.lien)}" style="display:inline-block;padding:10px 18px;background:#0f2352;color:#ffffff;text-decoration:none;border-radius:6px">${e(g.action.libelle)}</a></p>
      <p style="font-size:12px;color:#555">Si le bouton ne s'affiche pas : ${e(g.action.lien)}</p>`
      : `<p><strong>${e(g.action.libelle)}</strong> — connectez-vous à votre espace pour le faire.</p>`
    : "";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#151b2b">
      <h2 style="color:#0f2352">${e(g.titre)}</h2>
      <p>Bonjour${g.prenom ? " " + e(g.prenom) : ""},</p>
      ${paragraphes}
      ${action}
      <p>— ${e(g.emetteur)}</p>
    </div>`;
}

/** « Fuite sur canalisation » plutôt que « plomberie_canalisation ». */
function categorieLisible(slug: string): string {
  return titreIncident(slug);
}

/** Une description tronquée pour un sujet ou une ligne : jamais un roman. */
export function extrait(texte: string | null | undefined, max = 140): string {
  const t = (texte ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// — Vers l'artisan ————————————————————————————————————————————————————————

export function messageDevisDemande(p: {
  emetteur: string;
  categorie: string;
  ville: string | null;
  numero: string;
  lien: string | null;
}): Message {
  const cat = categorieLisible(p.categorie);
  return {
    sujet: `Nouvelle demande de devis — ${p.emetteur} — ${cat}${p.ville ? ` — ${p.ville}` : ""}`,
    html: gabaritNotification({
      titre: "Nouvelle demande de devis",
      emetteur: p.emetteur,
      lignes: [
        `${p.emetteur} vous consulte pour : ${cat}${p.ville ? `, à ${p.ville}` : ""} (dossier ${p.numero}).`,
        "Vous pouvez chiffrer depuis votre espace, ou décliner en un clic si vous n'êtes pas disponible — l'agence le saura tout de suite.",
      ],
      action: { libelle: "Répondre à la demande", lien: p.lien },
    }),
  };
}

export function messageMissionConfiee(p: {
  emetteur: string;
  categorie: string;
  adresse: string | null;
  numero: string;
  lien: string | null;
}): Message {
  const cat = categorieLisible(p.categorie);
  return {
    sujet: `Mission confiée — ${p.emetteur} — ${cat}`,
    html: gabaritNotification({
      titre: "Votre devis est retenu",
      emetteur: p.emetteur,
      lignes: [
        `${p.emetteur} vous confie l'intervention « ${cat} »${p.adresse ? `, ${p.adresse}` : ""} (dossier ${p.numero}).`,
        "Acceptez la mission pour proposer vos créneaux au locataire. Si vous ne pouvez plus la prendre, refusez-la sans attendre : l'agence réaffecte aussitôt.",
      ],
      action: { libelle: "Accepter ou refuser la mission", lien: p.lien },
    }),
  };
}

export function messageRendezVousFixe(p: {
  destinataire: "artisan" | "locataire";
  emetteur: string;
  prenom?: string | null;
  categorie: string;
  debut: string;
  fin: string | null;
  adresse: string | null;
  artisan: string;
  lien: string | null;
}): Message {
  const quand = `${jourDuRendezVous(p.debut)} ${creneauEnToutesLettres(p.debut, p.fin)}`;
  const cat = categorieLisible(p.categorie);
  const pourArtisan = [
    `${p.emetteur} a fixé le rendez-vous d'intervention « ${cat} » au ${quand}${p.adresse ? `, ${p.adresse}` : ""}.`,
    "Le locataire est prévenu du même créneau. En cas d'empêchement, signalez-le depuis votre espace.",
  ];
  const pourLocataire = [
    `Le rendez-vous pour « ${cat} » est fixé au ${quand}. L'intervenant sera ${p.artisan}.`,
    "Merci de permettre l'accès au logement sur ce créneau. Si vous ne pouvez pas être présent, prévenez votre gestionnaire au plus tôt.",
  ];
  return {
    sujet: `Rendez-vous fixé — ${quand}`,
    html: gabaritNotification({
      titre: "Rendez-vous fixé",
      prenom: p.destinataire === "locataire" ? p.prenom : null,
      emetteur: p.emetteur,
      lignes: p.destinataire === "artisan" ? pourArtisan : pourLocataire,
      action: { libelle: "Voir le rendez-vous", lien: p.lien },
    }),
  };
}

export function messageMissionAnnulee(p: {
  emetteur: string;
  categorie: string;
  numero: string;
  motif: string;
  lien: string | null;
}): Message {
  return {
    sujet: `Mission annulée — ${p.emetteur} — dossier ${p.numero}`,
    html: gabaritNotification({
      titre: "Mission annulée",
      emetteur: p.emetteur,
      lignes: [
        `${p.emetteur} retire la mission « ${categorieLisible(p.categorie)} » (dossier ${p.numero}). Motif : ${extrait(p.motif, 300)}`,
        "Les créneaux proposés sont sans objet. Aucun déplacement n'est attendu.",
      ],
      action: { libelle: "Voir le dossier", lien: p.lien },
    }),
  };
}

export type ReponseLocataireCreneaux =
  | { type: "choisi"; debut: string; fin: string | null }
  | { type: "contre_propose"; nbCreneaux: number };

/**
 * Le locataire a répondu aux créneaux : il en a retenu un (le rendez-vous est
 * fixé) ou il en propose d'autres (l'artisan doit reprendre l'une de ses dates
 * — RM-10.2.2). Deux sujets distincts : l'artisan lit lequel dès la boîte.
 */
export function messageReponseLocataireCreneaux(p: {
  emetteur: string;
  categorie: string;
  adresse: string | null;
  numero: string;
  reponse: ReponseLocataireCreneaux;
  lien: string | null;
}): Message {
  const cat = categorieLisible(p.categorie);
  const ou = p.adresse ? `, ${p.adresse}` : "";
  if (p.reponse.type === "choisi") {
    const quand = `${jourDuRendezVous(p.reponse.debut)} ${creneauEnToutesLettres(p.reponse.debut, p.reponse.fin)}`;
    return {
      sujet: `Rendez-vous confirmé par le locataire — ${quand}`,
      html: gabaritNotification({
        titre: "Le locataire a choisi un créneau",
        emetteur: p.emetteur,
        lignes: [
          `Le locataire a retenu le ${quand} pour « ${cat} »${ou} (dossier ${p.numero}).`,
          "Le rendez-vous est fixé : notez-le. En cas d'empêchement, proposez d'autres créneaux depuis votre espace — cela défait celui-ci.",
        ],
        action: { libelle: "Voir le rendez-vous", lien: p.lien },
      }),
    };
  }
  const n = p.reponse.nbCreneaux;
  return {
    sujet: `Le locataire propose d'autres créneaux — dossier ${p.numero}`,
    html: gabaritNotification({
      titre: "Aucun de vos créneaux ne convenait",
      emetteur: p.emetteur,
      lignes: [
        `Le locataire propose ${n > 1 ? `${n} autres créneaux` : "un autre créneau"} pour « ${cat} »${ou} (dossier ${p.numero}).`,
        "Reprenez l'une de ses dates en la proposant à votre tour depuis votre espace, ou proposez-en de nouvelles. Sans réponse, le rendez-vous reste en suspens.",
      ],
      action: { libelle: "Voir ses disponibilités", lien: p.lien },
    }),
  };
}

// — Vers le locataire —————————————————————————————————————————————————————

export function messageCreneauxAChoisir(p: {
  emetteur: string;
  prenom?: string | null;
  categorie: string;
  artisan: string;
  nbCreneaux: number;
  lien: string | null;
}): Message {
  const n = p.nbCreneaux;
  return {
    sujet: "Choisissez le créneau de votre intervention",
    html: gabaritNotification({
      titre: "Des créneaux vous attendent",
      prenom: p.prenom,
      emetteur: p.emetteur,
      lignes: [
        `${p.artisan} propose ${n > 1 ? `${n} créneaux` : "un créneau"} pour intervenir sur « ${categorieLisible(p.categorie)} ».`,
        "Choisissez celui qui vous convient, ou proposez d'autres disponibilités. Sans réponse de votre part, l'intervention ne peut pas être planifiée.",
      ],
      action: { libelle: "Choisir un créneau", lien: p.lien },
    }),
  };
}

export function messageReponseGestionnaire(p: {
  emetteur: string;
  prenom?: string | null;
  lien: string | null;
}): Message {
  return {
    sujet: `${p.emetteur} vous a répondu`,
    html: gabaritNotification({
      titre: "Une réponse vous attend",
      prenom: p.prenom,
      emetteur: p.emetteur,
      // Le texte de la réponse reste dans l'espace : un e-mail se transfère,
      // se lit sur un écran partagé, s'archive chez un tiers.
      lignes: ["Votre gestionnaire a répondu à votre message. Lisez sa réponse dans votre espace, et poursuivez l'échange au même endroit si besoin."],
      action: { libelle: "Lire la réponse", lien: p.lien },
    }),
  };
}

export function messagePieceDemandee(p: {
  emetteur: string;
  prenom?: string | null;
  libelle: string;
  note?: string | null;
  relance: boolean;
  lien: string | null;
}): Message {
  const lignes = p.relance
    ? [`${p.emetteur} attend toujours la pièce suivante : ${p.libelle}.`]
    : [`${p.emetteur} vous demande une pièce : ${p.libelle}.`];
  if (p.note) lignes.push(`Précision : ${extrait(p.note, 300)}`);
  lignes.push("Une photo lisible ou un PDF suffit. Le dépôt se fait depuis votre espace, en une minute.");
  return {
    sujet: p.relance ? `Rappel — pièce attendue : ${p.libelle}` : `Pièce demandée : ${p.libelle}`,
    html: gabaritNotification({
      titre: p.relance ? "Pièce toujours attendue" : "Une pièce vous est demandée",
      prenom: p.prenom,
      emetteur: p.emetteur,
      lignes,
      action: { libelle: "Déposer la pièce", lien: p.lien },
    }),
  };
}

export function messageSignatureDemandee(p: {
  emetteur: string;
  prenom?: string | null;
  titreDocument: string;
  lien: string | null;
}): Message {
  return {
    sujet: `Document à signer : ${p.titreDocument}`,
    html: gabaritNotification({
      titre: "Un document attend votre signature",
      prenom: p.prenom,
      emetteur: p.emetteur,
      lignes: [
        `${p.emetteur} vous soumet « ${p.titreDocument} » pour signature.`,
        "Téléchargez-le depuis votre espace, signez-le, puis déposez le document signé au même endroit.",
      ],
      action: { libelle: "Voir le document", lien: p.lien },
    }),
  };
}

// — Vers l'agence ——————————————————————————————————————————————————————————

export function messageIncidentUrgent(p: {
  emetteur: string;
  numero: string;
  categorie: string;
  lot: string | null;
  piece: string | null;
  description: string | null;
  lien: string | null;
}): Message {
  const cat = categorieLisible(p.categorie);
  const lignes = [
    `Un locataire vient de déclarer un incident URGENT${p.lot ? ` — ${p.lot}` : ""} : ${cat}${p.piece ? ` (${p.piece})` : ""}. Dossier ${p.numero}.`,
  ];
  const d = extrait(p.description);
  if (d) lignes.push(`« ${d} »`);
  lignes.push("Le locataire a lu que vous êtes prévenu immédiatement : qualifiez le dossier et, si besoin, consultez un artisan sans attendre.");
  return {
    sujet: `URGENT — ${cat}${p.lot ? ` — ${p.lot}` : ""} — ${p.numero}`,
    html: gabaritNotification({
      titre: "Incident urgent déclaré",
      emetteur: p.emetteur,
      lignes,
      action: { libelle: "Ouvrir le dossier", lien: p.lien },
    }),
  };
}

export function messageDevisRecu(p: {
  emetteur: string;
  artisan: string;
  montantCents: number;
  numero: string;
  categorie: string;
  lien: string | null;
}): Message {
  return {
    sujet: `Devis reçu — ${p.artisan} — ${eur(p.montantCents / 100)} — ${p.numero}`,
    html: gabaritNotification({
      titre: "Un devis est arrivé",
      emetteur: p.emetteur,
      lignes: [
        `${p.artisan} a déposé un devis de ${eur(p.montantCents / 100)} TTC pour « ${categorieLisible(p.categorie)} » (dossier ${p.numero}).`,
        "Comparez-le aux autres réponses attendues, puis retenez-en un : c'est ce qui confie la mission.",
      ],
      action: { libelle: "Voir le devis", lien: p.lien },
    }),
  };
}

export function messageMissionRefusee(p: {
  emetteur: string;
  artisan: string;
  motif: string | null;
  numero: string;
  categorie: string;
  lien: string | null;
}): Message {
  const lignes = [`${p.artisan} refuse la mission « ${categorieLisible(p.categorie)} » (dossier ${p.numero}).`];
  if (p.motif) lignes.push(`Motif : ${extrait(p.motif, 300)}`);
  lignes.push("Le dossier attend une réaffectation : sollicitez un autre artisan depuis la fiche.");
  return {
    sujet: `Mission refusée — ${p.artisan} — ${p.numero}`,
    html: gabaritNotification({
      titre: "Mission refusée par l'artisan",
      emetteur: p.emetteur,
      lignes,
      action: { libelle: "Réaffecter", lien: p.lien },
    }),
  };
}

// — Rappels des gestes attendus ——————————————————————————————————————————

export type TypeRappel =
  | "creneau_non_choisi"
  | "mission_non_acceptee"
  | "piece_demandee"
  | "devis_non_chiffre";

/** Après combien de jours sans geste on rappelle — une fois, et une seule. */
export const DELAIS_RAPPEL: Record<TypeRappel, number> = {
  creneau_non_choisi: 3,
  mission_non_acceptee: 2,
  piece_demandee: 7,
  devis_non_chiffre: 3,
};

/** Le rôle qui reçoit chaque rappel : le message est écrit pour lui. */
export const ROLE_RAPPEL: Record<TypeRappel, Role> = {
  creneau_non_choisi: "locataire",
  mission_non_acceptee: "artisan",
  piece_demandee: "locataire",
  devis_non_chiffre: "artisan",
};

export function messageRappelGeste(p: {
  type: TypeRappel;
  emetteur: string;
  prenom?: string | null;
  categorie?: string | null;
  libelle?: string | null;
  jours: number;
  lien: string | null;
}): Message {
  const cat = p.categorie ? categorieLisible(p.categorie) : "votre dossier";
  const depuis = `depuis ${p.jours} jour${p.jours > 1 ? "s" : ""}`;
  switch (p.type) {
    case "creneau_non_choisi":
      return {
        sujet: "Rappel — un créneau attend votre choix",
        html: gabaritNotification({
          titre: "Votre choix de créneau est attendu",
          prenom: p.prenom,
          emetteur: p.emetteur,
          lignes: [
            `Des créneaux pour « ${cat} » vous sont proposés ${depuis}, sans réponse.`,
            "Tant que vous n'avez pas choisi, l'artisan ne peut pas venir. Un clic suffit — ou proposez d'autres disponibilités.",
          ],
          action: { libelle: "Choisir un créneau", lien: p.lien },
        }),
      };
    case "mission_non_acceptee":
      return {
        sujet: `Rappel — mission en attente de votre réponse — ${p.emetteur}`,
        html: gabaritNotification({
          titre: "Une mission attend votre réponse",
          emetteur: p.emetteur,
          lignes: [
            `${p.emetteur} vous a confié « ${cat} » ${depuis}. Sans acceptation, le locataire n'a toujours pas de créneau.`,
            "Acceptez pour proposer vos disponibilités, ou refusez pour que l'agence réaffecte.",
          ],
          action: { libelle: "Répondre", lien: p.lien },
        }),
      };
    case "piece_demandee":
      return messagePieceDemandee({
        emetteur: p.emetteur,
        prenom: p.prenom,
        libelle: p.libelle ?? "la pièce demandée",
        relance: true,
        lien: p.lien,
      });
    case "devis_non_chiffre":
      return {
        sujet: `Rappel — demande de devis sans réponse — ${p.emetteur}`,
        html: gabaritNotification({
          titre: "Une demande de devis attend",
          emetteur: p.emetteur,
          lignes: [
            `${p.emetteur} vous a demandé un devis pour « ${cat} » ${depuis}.`,
            "Chiffrez-le, ou déclinez en un clic : l'agence consultera quelqu'un d'autre plutôt que d'attendre.",
          ],
          action: { libelle: "Répondre à la demande", lien: p.lien },
        }),
      };
  }
}

// ============================================================
// Partie pure — idempotence des rappels
// ============================================================

/** L'événement `tech_log` qui trace un rappel parti : la clé de « déjà fait ». */
export const EVENEMENT_RAPPEL = "notification_rappel";

/** Une clé par objet et par type : c'est elle qui interdit le second rappel. */
export function cleRappel(type: TypeRappel, objetId: string): string {
  return `${type}:${objetId}`;
}

/** Le délai est-il écoulé ? Dates ISO ; `maintenant` injectable pour les tests. */
export function echeanceAtteinte(depuisIso: string, jours: number, maintenant: Date = new Date()): boolean {
  const depuis = new Date(depuisIso).getTime();
  if (!Number.isFinite(depuis)) return false;
  return maintenant.getTime() - depuis >= jours * 86_400_000;
}

/** Les clés déjà tracées, lues des lignes `tech_log` (détails inconnus : tolérant). */
export function clesDejaTracees(lignes: { details: unknown }[]): Set<string> {
  const cles = new Set<string>();
  for (const l of lignes) {
    const d = l.details;
    if (d && typeof d === "object" && typeof (d as { cle?: unknown }).cle === "string") {
      cles.add((d as { cle: string }).cle);
    }
  }
  return cles;
}

/**
 * Ce qui reste à envoyer : ni déjà tracé, ni en double dans la passe (deux
 * créneaux d'une même intervention ne valent qu'un rappel au locataire).
 */
export function rappelsDus<T extends { cle: string }>(candidats: T[], dejaTracees: Set<string>): T[] {
  const vus = new Set<string>();
  const dus: T[] = [];
  for (const c of candidats) {
    if (dejaTracees.has(c.cle) || vus.has(c.cle)) continue;
    vus.add(c.cle);
    dus.push(c);
  }
  return dus;
}

// ============================================================
// Partie impure — lectures, envoi, journal
// ============================================================

export type ResultatNotification = {
  envoyee: boolean;
  motif?: "sans_adresse" | "echec_envoi" | "introuvable" | "erreur";
};

const NON: ResultatNotification = { envoyee: false, motif: "erreur" };

/** Le journal technique. Ne lève jamais, ne porte jamais d'adresse. */
async function journaliser(db: SupabaseClient, evenement: string, details: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await db.rpc("log_tech", { evenement, details });
    if (error) {
      console.error(`[notifications] journal (${evenement}) :`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[notifications] journal (${evenement}) :`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Le lien vers un écran, ou rien si l'adresse publique n'est pas configurée. */
function lien(chemin: string): string | null {
  const site = adresseDuSite();
  return site ? `${site}${chemin}` : null;
}

async function emetteur(db: SupabaseClient, orgId: string): Promise<string> {
  const marque = await chargerMarque(db, orgId);
  return marque ? nomMarque(marque) : "Votre gestionnaire";
}

/**
 * L'envoi lui-même. Tout est absorbé : pas d'adresse, refus du service,
 * exception — consigné, jamais relancé vers l'appelant.
 */
async function expedier(
  db: SupabaseClient,
  p: { orgId: string; to: string | null | undefined; message: Message; evenement: string; objet: string; role: Role }
): Promise<ResultatNotification> {
  const trace = { evenement: p.evenement, objet: p.objet, org: p.orgId, role: p.role };
  const to = (p.to ?? "").trim();
  if (!to || !emailValide(to)) {
    await journaliser(db, "notification_sans_adresse", trace);
    return { envoyee: false, motif: "sans_adresse" };
  }
  try {
    const envoi = await envoyerEmail({
      organisation: { db, id: p.orgId },
      to,
      subject: p.message.sujet,
      html: p.message.html,
    });
    if (envoi.erreur) {
      await journaliser(db, "notification_echec", { ...trace, erreur: envoi.erreur });
      return { envoyee: false, motif: "echec_envoi" };
    }
    await journaliser(db, "notification_envoyee", trace);
    return { envoyee: true };
  } catch (e) {
    await journaliser(db, "notification_echec", { ...trace, erreur: e instanceof Error ? e.message : "exception" });
    return { envoyee: false, motif: "echec_envoi" };
  }
}

// — Lectures partagées (RLS du client fourni) ——————————————————————————————

type Incident = {
  id: string;
  numero: string;
  categorie: string;
  piece: string | null;
  description: string | null;
  bail_id: string | null;
  declarant_person_id: string | null;
  responsable_account_id: string | null;
  lot_id: string;
};

type Lieu = { lot: string | null; adresse: string | null; ville: string | null };
type Personne = { email: string | null; prenom: string | null };

async function lireIncident(db: SupabaseClient, orgId: string, incidentId: string): Promise<Incident | null> {
  const { data } = await db
    .from("incidents")
    .select("id, numero, categorie, piece, description, bail_id, declarant_person_id, responsable_account_id, lot_id")
    .eq("id", incidentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as Incident | null) ?? null;
}

async function lireLieu(db: SupabaseClient, lotId: string): Promise<Lieu> {
  const { data: lot } = await db.from("lots").select("nom, bien_id").eq("id", lotId).maybeSingle();
  if (!lot) return { lot: null, adresse: null, ville: null };
  const { data: bien } = await db
    .from("biens")
    .select("address_line1, postal_code, city")
    .eq("id", lot.bien_id)
    .maybeSingle();
  return {
    lot: lot.nom ?? null,
    adresse: bien ? `${bien.address_line1}, ${bien.postal_code} ${bien.city}` : null,
    ville: bien?.city ?? null,
  };
}

/** Le locataire d'un incident : celui du bail, sinon le déclarant. */
async function lireLocataire(db: SupabaseClient, orgId: string, inc: Incident): Promise<Personne | null> {
  let personId = inc.declarant_person_id;
  if (inc.bail_id) {
    const { data: bail } = await db.from("baux").select("locataire_principal").eq("id", inc.bail_id).maybeSingle();
    if (bail?.locataire_principal) personId = bail.locataire_principal;
  }
  if (!personId) return null;
  return lirePersonne(db, orgId, personId);
}

async function lirePersonne(db: SupabaseClient, orgId: string, personId: string): Promise<Personne | null> {
  const { data } = await db
    .from("persons")
    .select("email, prenom")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as Personne | null) ?? null;
}

async function lireArtisan(db: SupabaseClient, artisanId: string): Promise<{ email: string | null; raison_sociale: string } | null> {
  const { data } = await db.from("artisans").select("email, raison_sociale").eq("id", artisanId).maybeSingle();
  return data ?? null;
}

type Intervention = {
  id: string;
  incident_id: string;
  artisan_id: string;
  debut_prevu: string | null;
  fin_prevue: string | null;
  refus_motif: string | null;
};

async function lireIntervention(db: SupabaseClient, orgId: string, interventionId: string): Promise<Intervention | null> {
  const { data } = await db
    .from("incident_interventions")
    .select("id, incident_id, artisan_id, debut_prevu, fin_prevue, refus_motif")
    .eq("id", interventionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as Intervention | null) ?? null;
}

/**
 * Qui, à l'agence, reçoit un e-mail sur un incident : son responsable s'il en
 * a un, sinon l'adresse de contact de l'organisation, sinon le premier
 * responsable d'agence. `org_membres_gerants` est filtrée par la RLS : depuis
 * un client qui n'est pas gérant, elle ne rend rien et on retombe sur le contact.
 */
async function destinataireAgence(db: SupabaseClient, orgId: string, responsableAccountId: string | null): Promise<string | null> {
  const { data: membres } = await db.rpc("org_membres_gerants", { org: orgId });
  let liste = (membres ?? []) as { account_id: string; email: string; role: string }[];
  if (liste.length === 0) {
    // La RPC se fonde sur `auth.uid()` : le client de service n'en a pas et
    // n'obtient rien. On lit alors la table — ce que la RLS laisse passer
    // (tout pour le service, rien pour un artisan : on retombe sur le contact).
    const { data: lignes } = await db
      .from("memberships")
      .select("account_id, role, accounts(email)")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .in("role", ["admin_agence", "agent", "proprietaire_direct"]);
    liste = ((lignes ?? []) as unknown as { account_id: string; role: string; accounts: { email: string } | { email: string }[] | null }[])
      .map((l) => ({ account_id: l.account_id, role: l.role, email: (Array.isArray(l.accounts) ? l.accounts[0]?.email : l.accounts?.email) ?? "" }))
      .filter((l) => l.email);
  }
  const responsable = responsableAccountId ? liste.find((m) => m.account_id === responsableAccountId) : undefined;
  if (responsable?.email) return responsable.email;
  const marque = await chargerMarque(db, orgId);
  if (marque?.email_contact && emailValide(marque.email_contact)) return marque.email_contact;
  return liste.find((m) => m.role === "admin_agence" || m.role === "proprietaire_direct")?.email ?? liste[0]?.email ?? null;
}

// — Les événements ——————————————————————————————————————————————————————————

/** Devis demandé (`solliciter_artisan`) → l'artisan. */
export async function notifierDevisDemande(db: SupabaseClient, orgId: string, consultationId: string, artisanId: string): Promise<ResultatNotification> {
  try {
    const { data: sollicitation } = await db
      .from("incident_sollicitations")
      .select("id, incident_id")
      .eq("organization_id", orgId)
      .eq("consultation_id", consultationId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (!sollicitation) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, sollicitation.incident_id), lireArtisan(db, artisanId), emetteur(db, orgId)]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    const lieu = await lireLieu(db, inc.lot_id);
    return expedier(db, {
      orgId, to: artisan.email, role: "artisan", evenement: "devis_demande", objet: sollicitation.id,
      message: messageDevisDemande({ emetteur: nom, categorie: inc.categorie, ville: lieu.ville, numero: inc.numero, lien: lien(`/artisan/devis/${sollicitation.id}`) }),
    });
  } catch (e) {
    console.error("[notifications] devis_demande :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Mission confiée (`retenir_devis`) → l'artisan retenu. */
export async function notifierMissionConfiee(db: SupabaseClient, orgId: string, devisId: string): Promise<ResultatNotification> {
  try {
    const { data: iv } = await db
      .from("incident_interventions")
      .select("id, incident_id, artisan_id")
      .eq("organization_id", orgId)
      .eq("devis_id", devisId)
      .in("statut", ["proposee", "acceptee"])
      .order("confiee_le", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!iv) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, iv.incident_id), lireArtisan(db, iv.artisan_id), emetteur(db, orgId)]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    const lieu = await lireLieu(db, inc.lot_id);
    return expedier(db, {
      orgId, to: artisan.email, role: "artisan", evenement: "mission_confiee", objet: iv.id,
      message: messageMissionConfiee({ emetteur: nom, categorie: inc.categorie, adresse: lieu.adresse, numero: inc.numero, lien: lien(`/artisan/missions/${iv.id}`) }),
    });
  } catch (e) {
    console.error("[notifications] mission_confiee :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Rendez-vous fixé par l'agence (`fixer_creneau_arbitrage`) → l'artisan ET le locataire. */
export async function notifierRendezVousFixe(db: SupabaseClient, orgId: string, interventionId: string): Promise<{ artisan: ResultatNotification; locataire: ResultatNotification }> {
  const rien = { artisan: NON, locataire: NON };
  try {
    const iv = await lireIntervention(db, orgId, interventionId);
    if (!iv?.debut_prevu) return rien;
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, iv.incident_id), lireArtisan(db, iv.artisan_id), emetteur(db, orgId)]);
    if (!inc || !artisan) return rien;
    const [lieu, locataire] = await Promise.all([lireLieu(db, inc.lot_id), lireLocataire(db, orgId, inc)]);
    const base = { emetteur: nom, categorie: inc.categorie, debut: iv.debut_prevu, fin: iv.fin_prevue, adresse: lieu.adresse, artisan: artisan.raison_sociale };
    const [a, l] = await Promise.all([
      expedier(db, {
        orgId, to: artisan.email, role: "artisan", evenement: "rendez_vous_fixe", objet: iv.id,
        message: messageRendezVousFixe({ ...base, destinataire: "artisan", lien: lien(`/artisan/missions/${iv.id}`) }),
      }),
      expedier(db, {
        orgId, to: locataire?.email, role: "locataire", evenement: "rendez_vous_fixe", objet: iv.id,
        message: messageRendezVousFixe({ ...base, destinataire: "locataire", prenom: locataire?.prenom, lien: lien(`/locataire/${orgId}/demandes`) }),
      }),
    ]);
    return { artisan: a, locataire: l };
  } catch (e) {
    console.error("[notifications] rendez_vous_fixe :", e instanceof Error ? e.message : e);
    return rien;
  }
}

/** Mission annulée par l'agence (`annuler_mission`) → l'artisan. */
export async function notifierMissionAnnulee(db: SupabaseClient, orgId: string, interventionId: string, motif: string): Promise<ResultatNotification> {
  try {
    const iv = await lireIntervention(db, orgId, interventionId);
    if (!iv) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, iv.incident_id), lireArtisan(db, iv.artisan_id), emetteur(db, orgId)]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    return expedier(db, {
      orgId, to: artisan.email, role: "artisan", evenement: "mission_annulee", objet: iv.id,
      message: messageMissionAnnulee({ emetteur: nom, categorie: inc.categorie, numero: inc.numero, motif, lien: lien(`/artisan/missions/${iv.id}`) }),
    });
  } catch (e) {
    console.error("[notifications] mission_annulee :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/**
 * Créneaux proposés par l'artisan (`proposer_creneaux`) → le locataire.
 * Appelée depuis actions/artisan.ts via `notifierEnCoulisses` : le client de
 * l'artisan ne lit ni l'intervention, ni l'incident, ni le locataire.
 */
export async function notifierCreneauxAChoisir(db: SupabaseClient, orgId: string, interventionId: string): Promise<ResultatNotification> {
  try {
    const iv = await lireIntervention(db, orgId, interventionId);
    if (!iv) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom, { count }] = await Promise.all([
      lireIncident(db, orgId, iv.incident_id),
      lireArtisan(db, iv.artisan_id),
      emetteur(db, orgId),
      db.from("intervention_creneaux").select("id", { count: "exact", head: true }).eq("intervention_id", iv.id).eq("statut", "propose"),
    ]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    const locataire = await lireLocataire(db, orgId, inc);
    return expedier(db, {
      orgId, to: locataire?.email, role: "locataire", evenement: "creneaux_proposes", objet: iv.id,
      message: messageCreneauxAChoisir({ emetteur: nom, prenom: locataire?.prenom, categorie: inc.categorie, artisan: artisan.raison_sociale, nbCreneaux: count ?? 1, lien: lien(`/locataire/${orgId}/demandes`) }),
    });
  } catch (e) {
    console.error("[notifications] creneaux_proposes :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Réponse du gestionnaire (`repondre_message_personne`) → le locataire. */
export async function notifierReponseGestionnaire(db: SupabaseClient, orgId: string, personId: string): Promise<ResultatNotification> {
  try {
    const [personne, nom] = await Promise.all([lirePersonne(db, orgId, personId), emetteur(db, orgId)]);
    if (!personne) return { envoyee: false, motif: "introuvable" };
    return expedier(db, {
      orgId, to: personne.email, role: "locataire", evenement: "reponse_gestionnaire", objet: personId,
      message: messageReponseGestionnaire({ emetteur: nom, prenom: personne.prenom, lien: lien(`/locataire/${orgId}/contact`) }),
    });
  } catch (e) {
    console.error("[notifications] reponse_gestionnaire :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Pièce demandée, ou relancée à la main → le locataire. */
export async function notifierPieceDemandee(
  db: SupabaseClient,
  orgId: string,
  personId: string,
  piece: { id: string; libelle: string; note?: string | null },
  relance: boolean
): Promise<ResultatNotification> {
  try {
    const [personne, nom] = await Promise.all([lirePersonne(db, orgId, personId), emetteur(db, orgId)]);
    if (!personne) return { envoyee: false, motif: "introuvable" };
    return expedier(db, {
      orgId, to: personne.email, role: "locataire", evenement: relance ? "piece_relancee" : "piece_demandee", objet: piece.id,
      message: messagePieceDemandee({ emetteur: nom, prenom: personne.prenom, libelle: piece.libelle, note: piece.note, relance, lien: lien(`/locataire/${orgId}/documents`) }),
    });
  } catch (e) {
    console.error("[notifications] piece_demandee :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Signature demandée (`envoyer_pour_signature`, parcours manuel) → le signataire. */
export async function notifierSignatureDemandee(db: SupabaseClient, orgId: string, personId: string, documentId: string, demandeId: string): Promise<ResultatNotification> {
  try {
    const [personne, nom, { data: doc }] = await Promise.all([
      lirePersonne(db, orgId, personId),
      emetteur(db, orgId),
      db.from("documents").select("titre").eq("id", documentId).eq("organization_id", orgId).maybeSingle(),
    ]);
    if (!personne) return { envoyee: false, motif: "introuvable" };
    return expedier(db, {
      orgId, to: personne.email, role: "locataire", evenement: "signature_demandee", objet: demandeId,
      message: messageSignatureDemandee({ emetteur: nom, prenom: personne.prenom, titreDocument: doc?.titre ?? "Document", lien: lien(`/locataire/${orgId}/documents`) }),
    });
  } catch (e) {
    console.error("[notifications] signature_demandee :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/**
 * Incident déclaré URGENT par le locataire → l'agence, tout de suite.
 * Le client est celui du LOCATAIRE : il ne lit pas `accounts` ni `incidents`.
 * `mon_gestionnaire_locataire` (RPC definer, réservée au locataire de l'agence)
 * lui donne l'agent en charge de son bien, sinon l'adresse de contact.
 */
export async function notifierIncidentUrgentDeclare(
  db: SupabaseClient,
  orgId: string,
  incidentId: string,
  champs: { categorie: string; piece: string | null; description: string | null }
): Promise<ResultatNotification> {
  try {
    const [{ data: gestion }, { data: mesIncidents }] = await Promise.all([
      db.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
      db.rpc("mes_incidents_locataire", { p_org: orgId }),
    ]);
    const g = ((gestion ?? []) as { agence: string; email_contact: string | null; agent_email: string | null }[])[0];
    const moi = ((mesIncidents ?? []) as { id: string; numero: string; lot_nom: string | null }[]).find((i) => i.id === incidentId);
    return expedier(db, {
      orgId, to: g?.agent_email ?? g?.email_contact, role: "agence", evenement: "incident_urgent", objet: incidentId,
      message: messageIncidentUrgent({
        emetteur: g?.agence ?? "Votre espace de gestion",
        numero: moi?.numero ?? "—",
        categorie: champs.categorie,
        lot: moi?.lot_nom ?? null,
        piece: champs.piece,
        description: champs.description,
        lien: lien(`/agence/${orgId}/incidents?sel=${incidentId}`),
      }),
    });
  } catch (e) {
    console.error("[notifications] incident_urgent :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/**
 * Devis déposé par l'artisan (`deposer_devis_structure`) → l'agence.
 * Le client de l'artisan ne lit ni l'organisation ni ses membres : appelée
 * depuis actions/artisan.ts via `notifierEnCoulisses`.
 */
export async function notifierDevisRecu(db: SupabaseClient, orgId: string, devisId: string): Promise<ResultatNotification> {
  try {
    const { data: devis } = await db
      .from("incident_devis")
      .select("id, incident_id, artisan_id, montant_ttc_cents")
      .eq("id", devisId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!devis) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, devis.incident_id), lireArtisan(db, devis.artisan_id), emetteur(db, orgId)]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    const to = await destinataireAgence(db, orgId, inc.responsable_account_id);
    return expedier(db, {
      orgId, to, role: "agence", evenement: "devis_recu", objet: devis.id,
      message: messageDevisRecu({ emetteur: nom, artisan: artisan.raison_sociale, montantCents: Number(devis.montant_ttc_cents), numero: inc.numero, categorie: inc.categorie, lien: lien(`/agence/${orgId}/incidents?sel=${inc.id}`) }),
    });
  } catch (e) {
    console.error("[notifications] devis_recu :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Mission refusée par l'artisan (`refuser_mission`) → l'agence. Même client que ci-dessus. */
export async function notifierMissionRefusee(db: SupabaseClient, orgId: string, interventionId: string): Promise<ResultatNotification> {
  try {
    const iv = await lireIntervention(db, orgId, interventionId);
    if (!iv) return { envoyee: false, motif: "introuvable" };
    const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, iv.incident_id), lireArtisan(db, iv.artisan_id), emetteur(db, orgId)]);
    if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
    const to = await destinataireAgence(db, orgId, inc.responsable_account_id);
    return expedier(db, {
      orgId, to, role: "agence", evenement: "mission_refusee", objet: iv.id,
      message: messageMissionRefusee({ emetteur: nom, artisan: artisan.raison_sociale, motif: iv.refus_motif, numero: inc.numero, categorie: inc.categorie, lien: lien(`/agence/${orgId}/incidents?sel=${inc.id}`) }),
    });
  } catch (e) {
    console.error("[notifications] mission_refusee :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Le locataire a retenu un créneau (`choisir_creneau`) → l'artisan. */
export async function notifierCreneauChoisi(db: SupabaseClient, orgId: string, creneauId: string): Promise<ResultatNotification> {
  try {
    const { data: creneau } = await db
      .from("intervention_creneaux")
      .select("intervention_id, debut, fin")
      .eq("id", creneauId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!creneau) return { envoyee: false, motif: "introuvable" };
    return notifierReponseLocataire(db, orgId, creneau.intervention_id, { type: "choisi", debut: creneau.debut, fin: creneau.fin });
  } catch (e) {
    console.error("[notifications] creneau_choisi :", e instanceof Error ? e.message : e);
    return NON;
  }
}

/** Le locataire propose d'autres créneaux (`contre_proposer_creneaux`) → l'artisan. */
export async function notifierContrePropositionLocataire(db: SupabaseClient, orgId: string, interventionId: string): Promise<ResultatNotification> {
  try {
    const { count } = await db
      .from("intervention_creneaux")
      .select("id", { count: "exact", head: true })
      .eq("intervention_id", interventionId)
      .eq("organization_id", orgId)
      .eq("statut", "propose")
      .eq("propose_par", "locataire");
    return notifierReponseLocataire(db, orgId, interventionId, { type: "contre_propose", nbCreneaux: count ?? 1 });
  } catch (e) {
    console.error("[notifications] creneaux_contre_proposes :", e instanceof Error ? e.message : e);
    return NON;
  }
}

async function notifierReponseLocataire(db: SupabaseClient, orgId: string, interventionId: string, reponse: ReponseLocataireCreneaux): Promise<ResultatNotification> {
  const iv = await lireIntervention(db, orgId, interventionId);
  if (!iv) return { envoyee: false, motif: "introuvable" };
  const [inc, artisan, nom] = await Promise.all([lireIncident(db, orgId, iv.incident_id), lireArtisan(db, iv.artisan_id), emetteur(db, orgId)]);
  if (!inc || !artisan) return { envoyee: false, motif: "introuvable" };
  const lieu = await lireLieu(db, inc.lot_id);
  return expedier(db, {
    orgId, to: artisan.email, role: "artisan", evenement: reponse.type === "choisi" ? "creneau_choisi" : "creneaux_contre_proposes", objet: iv.id,
    message: messageReponseLocataireCreneaux({ emetteur: nom, categorie: inc.categorie, adresse: lieu.adresse, numero: inc.numero, reponse, lien: lien(`/artisan/missions/${iv.id}`) }),
  });
}

/**
 * Prévenir depuis une action d'artisan ou de locataire (voir l'en-tête,
 * « L'exception, et sa clôture »). À n'appeler qu'APRÈS le succès de la RPC
 * métier : c'est elle qui a vérifié que l'appelant est lié au dossier. Le
 * client de service ne sort pas d'ici ; sans clé de service, on consigne avec
 * le client de l'appelant et on rend la main. Ne lève jamais.
 */
export async function notifierEnCoulisses(
  appelant: SupabaseClient,
  trace: { evenement: string; objet: string; org: string },
  envoyer: (service: SupabaseClient) => Promise<unknown>
): Promise<void> {
  try {
    const service = clientDeService();
    if (!service) {
      await journaliser(appelant, "notification_sans_service", trace);
      return;
    }
    await envoyer(service);
  } catch (e) {
    console.error(`[notifications] ${trace.evenement} :`, e instanceof Error ? e.message : e);
  }
}

// ============================================================
// Les rappels automatiques (tâche `rappels`, client de service)
// ============================================================

export type BilanRappelsGestes = {
  envoyes: number;
  echecs: number;
  sans_adresse: number;
  /** Partis mais non tracés : la passe suivante les renverrait (leçon B5). */
  non_consignes: number;
  par_type: Record<TypeRappel, number>;
};

type Candidat = {
  cle: string;
  type: TypeRappel;
  orgId: string;
  objetId: string;
  depuis: string;
  /** Ce qu'il faut pour écrire et adresser le message. */
  incidentId?: string;
  artisanId?: string;
  personId?: string;
  libelle?: string;
  lienChemin: string;
};

const PLAFOND_PAR_TYPE = 100;

/**
 * Les quatre rappels d'un geste qui n'est pas venu — un seul par objet, tracé
 * dans `tech_log` sous `notification_rappel` (clé `type:objet`). On envoie
 * PUIS on trace, comme les autres tâches : le pire cas est un doublon, pas un
 * silence. Une organisation dont l'écriture est fermée n'écrit plus en son nom.
 */
export async function envoyerRappelsGestes(service: SupabaseClient, maintenant: Date = new Date()): Promise<BilanRappelsGestes> {
  const bilan: BilanRappelsGestes = {
    envoyes: 0, echecs: 0, sans_adresse: 0, non_consignes: 0,
    par_type: { creneau_non_choisi: 0, mission_non_acceptee: 0, piece_demandee: 0, devis_non_chiffre: 0 },
  };
  const avant = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();

  // 1. Les candidats, par type.
  const candidats: Candidat[] = [];

  const { data: creneaux } = await service
    .from("intervention_creneaux")
    .select("intervention_id, organization_id, created_at")
    .eq("statut", "propose")
    .eq("propose_par", "artisan")
    .lte("created_at", avant(DELAIS_RAPPEL.creneau_non_choisi))
    .order("created_at", { ascending: true })
    .limit(PLAFOND_PAR_TYPE * 3);
  for (const c of creneaux ?? []) {
    candidats.push({
      cle: cleRappel("creneau_non_choisi", c.intervention_id), type: "creneau_non_choisi",
      orgId: c.organization_id, objetId: c.intervention_id, depuis: c.created_at,
      lienChemin: `/locataire/${c.organization_id}/demandes`,
    });
  }

  const { data: missions } = await service
    .from("incident_interventions")
    .select("id, organization_id, incident_id, artisan_id, confiee_le")
    .eq("statut", "proposee")
    .lte("confiee_le", avant(DELAIS_RAPPEL.mission_non_acceptee))
    .order("confiee_le", { ascending: true })
    .limit(PLAFOND_PAR_TYPE);
  for (const m of missions ?? []) {
    candidats.push({
      cle: cleRappel("mission_non_acceptee", m.id), type: "mission_non_acceptee",
      orgId: m.organization_id, objetId: m.id, depuis: m.confiee_le,
      incidentId: m.incident_id, artisanId: m.artisan_id, lienChemin: `/artisan/missions/${m.id}`,
    });
  }

  const { data: pieces } = await service
    .from("pieces_demandees")
    .select("id, organization_id, person_id, libelle, demandee_le")
    .is("satisfaite_le", null)
    .is("relancee_le", null)
    .lte("demandee_le", avant(DELAIS_RAPPEL.piece_demandee))
    .order("demandee_le", { ascending: true })
    .limit(PLAFOND_PAR_TYPE);
  for (const p of pieces ?? []) {
    candidats.push({
      cle: cleRappel("piece_demandee", p.id), type: "piece_demandee",
      orgId: p.organization_id, objetId: p.id, depuis: p.demandee_le,
      personId: p.person_id, libelle: p.libelle, lienChemin: `/locataire/${p.organization_id}/documents`,
    });
  }

  const { data: sollicitations } = await service
    .from("incident_sollicitations")
    .select("id, organization_id, incident_id, artisan_id, envoyee_le")
    .eq("statut", "envoyee")
    .lte("envoyee_le", avant(DELAIS_RAPPEL.devis_non_chiffre))
    .order("envoyee_le", { ascending: true })
    .limit(PLAFOND_PAR_TYPE);
  for (const s of sollicitations ?? []) {
    candidats.push({
      cle: cleRappel("devis_non_chiffre", s.id), type: "devis_non_chiffre",
      orgId: s.organization_id, objetId: s.id, depuis: s.envoyee_le,
      incidentId: s.incident_id, artisanId: s.artisan_id, lienChemin: `/artisan/devis/${s.id}`,
    });
  }
  if (candidats.length === 0) return bilan;

  // 2. Ce qui est déjà parti. Fenêtre de 90 jours : un objet plus vieux a été
  //    soldé ou est mort ; `tech_log` est purgé à six mois de toute façon.
  const { data: traces, error: erreurTraces } = await service
    .from("tech_log")
    .select("details")
    .eq("evenement", EVENEMENT_RAPPEL)
    .gte("created_at", avant(90));
  if (erreurTraces) {
    // Sans la liste des envois passés, envoyer reviendrait à rappeler tout le
    // monde une seconde fois : on s'abstient et on le dit.
    console.error("[rappels gestes] traces illisibles :", erreurTraces.message);
    bilan.echecs = candidats.length;
    return bilan;
  }
  const dus = rappelsDus(candidats, clesDejaTracees((traces ?? []) as { details: unknown }[]));

  // 3. Envoi, organisation par organisation (écriture ouverte vérifiée une fois).
  const ecritureOuverte = new Map<string, boolean>();
  const noms = new Map<string, string>();
  for (const c of dus) {
    if (!ecritureOuverte.has(c.orgId)) {
      const { data } = await service.rpc("org_ecriture_ouverte", { p_org: c.orgId });
      ecritureOuverte.set(c.orgId, data === true);
      noms.set(c.orgId, await emetteur(service, c.orgId));
    }
    if (!ecritureOuverte.get(c.orgId)) continue;

    const resultat = await envoyerUnRappel(service, c, noms.get(c.orgId) ?? "Votre gestionnaire", maintenant);
    if (!resultat.envoyee) {
      if (resultat.motif === "sans_adresse") bilan.sans_adresse += 1;
      else bilan.echecs += 1;
      continue;
    }
    bilan.envoyes += 1;
    bilan.par_type[c.type] += 1;
    const tracee = await journaliser(service, EVENEMENT_RAPPEL, { cle: c.cle, type: c.type, objet: c.objetId, org: c.orgId, role: ROLE_RAPPEL[c.type] });
    if (!tracee) bilan.non_consignes += 1;
    if (c.type === "piece_demandee") {
      // La relance automatique laisse la même empreinte que le bouton
      // « Relancer » : le gérant lit « relancée le … » sur la demande.
      await service.from("pieces_demandees").update({ relancee_le: maintenant.toISOString() }).eq("id", c.objetId).is("relancee_le", null);
    }
  }
  return bilan;
}

async function envoyerUnRappel(service: SupabaseClient, c: Candidat, nom: string, maintenant: Date): Promise<ResultatNotification> {
  const jours = Math.max(1, Math.floor((maintenant.getTime() - new Date(c.depuis).getTime()) / 86_400_000));
  const role = ROLE_RAPPEL[c.type];
  try {
    let to: string | null | undefined;
    let prenom: string | null = null;
    let categorie: string | null = null;

    if (c.type === "creneau_non_choisi") {
      const iv = await lireIntervention(service, c.orgId, c.objetId);
      if (!iv) return { envoyee: false, motif: "introuvable" };
      const inc = await lireIncident(service, c.orgId, iv.incident_id);
      if (!inc) return { envoyee: false, motif: "introuvable" };
      const locataire = await lireLocataire(service, c.orgId, inc);
      to = locataire?.email; prenom = locataire?.prenom ?? null; categorie = inc.categorie;
    } else if (c.type === "piece_demandee") {
      const personne = c.personId ? await lirePersonne(service, c.orgId, c.personId) : null;
      to = personne?.email; prenom = personne?.prenom ?? null;
    } else {
      const [inc, artisan] = await Promise.all([
        c.incidentId ? lireIncident(service, c.orgId, c.incidentId) : Promise.resolve(null),
        c.artisanId ? lireArtisan(service, c.artisanId) : Promise.resolve(null),
      ]);
      to = artisan?.email; categorie = inc?.categorie ?? null;
    }

    return expedier(service, {
      orgId: c.orgId, to, role, evenement: `rappel_${c.type}`, objet: c.objetId,
      message: messageRappelGeste({ type: c.type, emetteur: nom, prenom, categorie, libelle: c.libelle, jours, lien: lien(c.lienChemin) }),
    });
  } catch (e) {
    console.error(`[rappels gestes] ${c.type} :`, e instanceof Error ? e.message : e);
    return NON;
  }
}
