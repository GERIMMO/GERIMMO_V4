// Les quatre courriers d'un prélèvement qui n'est pas passé.
//
// POURQUOI QUATRE, ET PAS UN RAPPEL RÉPÉTÉ. Le même message renvoyé tous les
// trois jours apprend à ne plus l'ouvrir — et le dernier, celui qui annonce
// l'arrêt de la saisie, arriverait dans un fil qu'on ne lit plus. Chacun dit
// donc quelque chose que le précédent ne disait pas : ce qui s'est passé, puis
// combien de temps il reste, puis que c'est demain, puis que c'est fait.
//
// CE QU'AUCUN DES QUATRE NE FAIT : accuser. Une carte qui expire, un plafond
// bancaire, un changement de banque — la cause est presque toujours matérielle.
// Le ton est celui d'un fournisseur qui prévient, pas d'un créancier qui
// réclame ; et chacun dit où corriger, en un clic.
//
// ET TOUS RAPPELLENT CE QUI RESTE POSSIBLE. Lecture seule n'est pas porte
// close : tout se consulte, tout s'exporte, le journal de gestion compris.
// Le taire ferait croire à une perte de données, et c'est la peur qui fait
// partir un client.

import { eur } from "@/lib/ged";

export type Palier = 0 | 1 | 2 | 3;

export type RelancePaiement = {
  palier: Palier;
  organisation: string;
  montantMensuel: number;
  joursRestants: number;
  lectureSeuleLe: string; // AAAA-MM-JJ
  lien: string; // vers « Mon abonnement »
};

function jour(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function sujetRelance(r: Pick<RelancePaiement, "palier" | "joursRestants">): string {
  switch (r.palier) {
    case 0:
      return "Votre prélèvement Gerimmo n'est pas passé";
    case 1:
      return `Prélèvement Gerimmo : il vous reste ${r.joursRestants} jour${r.joursRestants > 1 ? "s" : ""}`;
    case 2:
      return "Prélèvement Gerimmo : votre saisie s'arrête demain";
    default:
      return "Votre compte Gerimmo est en lecture seule";
  }
}

/** Le paragraphe propre à chaque palier. */
function message(r: RelancePaiement): string {
  const le = jour(r.lectureSeuleLe);
  switch (r.palier) {
    case 0:
      return `
        <p>Le prélèvement de votre abonnement (<strong>${eur(r.montantMensuel)} par mois</strong>)
        n'a pas abouti. Cela vient presque toujours d'une carte arrivée à expiration
        ou d'un plafond bancaire — rien d'inquiétant, mais il faut le corriger.</p>
        <p><strong>Votre compte reste entièrement ouvert jusqu'au ${le}.</strong>
        Passé cette date et sans règlement, la saisie de nouvelles données sera
        suspendue.</p>`;
    case 1:
      return `
        <p>Le prélèvement de votre abonnement n'a toujours pas abouti.
        Il vous reste <strong>${r.joursRestants} jour${r.joursRestants > 1 ? "s" : ""}</strong>
        avant que la saisie ne soit suspendue, le ${le}.</p>
        <p>Mettre votre moyen de paiement à jour prend une minute.</p>`;
    case 2:
      return `
        <p><strong>Demain, ${le}, la saisie de nouvelles données sera suspendue</strong>
        sur votre compte, faute de règlement.</p>
        <p>Il est encore temps : dès que le paiement passe, tout rouvre immédiatement.</p>`;
    default:
      return `
        <p>Faute de règlement depuis le ${le}, <strong>votre compte est passé en
        lecture seule</strong>.</p>
        <p>Dès que le paiement aboutit, <strong>tout rouvre à la seconde</strong>,
        exactement où vous vous étiez arrêté. Rien n'a été supprimé, et rien ne le sera.</p>`;
  }
}

export function corpsRelance(r: RelancePaiement): string {
  const geste = r.palier === 3 ? "Régulariser et rouvrir mon compte" : "Mettre mon paiement à jour";
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="font-size:17px">${sujetRelance(r)}</h2>
      <p>Bonjour,</p>
      ${message(r)}
      <p style="margin:22px 0">
        <a href="${r.lien}"
           style="background:#12263f;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">
          ${geste}
        </a>
      </p>
      <p style="color:#555">
        Quoi qu'il arrive, <strong>vos données restent entières</strong> : baux,
        quittances, états des lieux, journal de gestion — tout reste consultable et
        exportable, même compte suspendu. Seules les nouvelles saisies attendent le
        règlement.
      </p>
      <p style="color:#555">— Gerimmo, pour ${r.organisation}</p>
    </div>`;
}
