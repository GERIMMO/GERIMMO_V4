"use client";

import { Fragment, useId, useLayoutEffect, useRef } from "react";
import { CheckCheck, MessageCircle, Send } from "lucide-react";
import { repondreMessagePersonne, type EtatMessage } from "@/app/actions/messages";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { jourParis } from "@/lib/agenda-gestion";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Label } from "@/components/ui/label";
import type { MessagePersonne } from "../personnes/[personId]/carte-messages";
import styles from "./messagerie.module.css";

export function ConversationProprietaire({ orgId, personId, prenom, messages }: {
  orgId: string; personId: string; prenom: string | null; messages: MessagePersonne[];
}) {
  const historique = useRef<HTMLDivElement>(null);
  const suivreFin = useRef(true);
  const reponseEnvoyee = useRef(false);
  const { etat, enCours, soumettre, version } = useActionFormulaire<EtatMessage>(async (precedent, donnees) => {
    const retour = await repondreMessagePersonne(orgId, personId, precedent, donnees);
    if (retour.succes) reponseEnvoyee.current = true;
    return retour;
  }, true);
  const idTexte = useId();
  const dernierMessage = messages.at(-1)?.id;
  // Ouvrir sur le dernier échange et montrer notre réponse après confirmation.
  // Une mise à jour ne déplace pas le lecteur qui consulte des messages plus anciens.
  useLayoutEffect(() => {
    const element = historique.current;
    if (!element || (!suivreFin.current && !reponseEnvoyee.current)) return;
    element.scrollTop = element.scrollHeight;
    suivreFin.current = true;
    reponseEnvoyee.current = false;
  }, [dernierMessage, etat]);
  return <div className={styles.echange}>
    {messages.length ? <div ref={historique} className={styles.historique} role="region" aria-label="Historique des messages" tabIndex={0}
      onScroll={event => {
        const element = event.currentTarget;
        suivreFin.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
      }}>
      {messages.map((message, index) => {
        const date = new Date(message.cree_le);
        const nouveauJour = index === 0 || jourParis(date) !== jourParis(new Date(messages[index - 1].cree_le));
        return <Fragment key={message.id}>
          {nouveauJour && <div className={styles.dateMessages}><span>{date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}</span></div>}
          <div className={styles.message} data-auteur={message.auteur}>
            <span className={styles.auteur}>{message.auteur === "gerant" ? "Vous" : prenom || "Locataire"}</span>
            <p>{message.texte}</p>
            <time dateTime={message.cree_le}>{date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</time>
          </div>
        </Fragment>;
      })}
    </div> : <div className={styles.premierMessage}><MessageCircle size={25} strokeWidth={1.5} aria-hidden="true" /><div><strong>Commencez votre échange{prenom ? ` avec ${prenom}` : ""}</strong><p>Votre message sera disponible dans son espace locataire.</p></div></div>}
    <form data-saisie-confirmee key={version} onSubmit={soumettre} className={styles.redaction} aria-busy={enCours}>
      <fieldset disabled={enCours}>
        <Label htmlFor={idTexte}>Votre message</Label>
        <textarea id={idTexte} name="texte" required maxLength={4000} rows={3}
          placeholder={`${messages.length ? "Répondre" : "Écrire"}${prenom ? ` à ${prenom}` : ""}…`} />
        <div className={styles.piedRedaction}><span>Envoyé dans son espace locataire</span><BoutonEnvoi enCours={enCours} enCoursTexte="Envoi en cours…"><Send size={15} aria-hidden="true" />Envoyer</BoutonEnvoi></div>
      </fieldset>
      {etat.succes && <p className={styles.succes} role="status"><CheckCheck size={17} aria-hidden="true" />{etat.succes}</p>}
      {etat.erreur && <p className={styles.erreur} role="alert">{etat.erreur}</p>}
      {etat.avertissement && <p className={styles.avertissement} role="status">{etat.avertissement}</p>}
    </form>
  </div>;
}
