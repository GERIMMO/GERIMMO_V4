"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCheck, ChevronRight, Inbox, Mail, MessageCircle, PenLine, Search, UsersRound, X } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initiales, correspond } from "@/lib/roles-personnes";
import { formaterDateHeure } from "@/lib/ged";
import styles from "./messagerie.module.css";
import { useBaseEspace } from "@/components/racine-espace-contexte";

export type FilConversation = {
  person_id: string; nom: string; prenom: string | null; dernier: string | null;
  dernier_le: string | null; dernier_auteur: "locataire" | "gerant" | null; non_lus: number;
};

export function MessagerieProprietaire({ orgId, fils, selection, conversation }: {
  orgId: string; fils: FilConversation[]; selection?: string; conversation?: ReactNode;
}) {
  const [recherche, setRecherche] = useState("");
  const [nonLuesSeulement, setNonLuesSeulement] = useState(false);
  const idRecherche = useId();
  const idListe = useId();
  const base = useBaseEspace(orgId); // décision D27 : /espace chez le propriétaire direct
  const actives = fils.filter((fil) => fil.non_lus > 0);
  const nonLus = fils.reduce((total, fil) => total + fil.non_lus, 0);
  const visibles = fils.filter((fil) => (!nonLuesSeulement || fil.non_lus > 0) && correspond(recherche, fil.nom, fil.prenom, fil.dernier));
  const ouverte = fils.find((fil) => fil.person_id === selection);
  return <main className={`mx-auto w-full p-4 sm:p-7 ${styles.page}`}>
    <header className={`entete-page ${styles.entete}`}>
      <div><TitreEcran rubrique="messages">Messages</TitreEcran><p>Gardez le fil de vos échanges avec vos locataires.</p></div>
      <Link href={`${base}/personnes`} className="btn-or"><PenLine size={16} aria-hidden="true" />Écrire un message</Link>
    </header>
    <div className={styles.resume}>
      <span><MessageCircle size={16} aria-hidden="true" /><strong>{fils.length}</strong> conversation{fils.length > 1 ? "s" : ""}</span>
      <span data-non-lu={nonLus > 0}>{nonLus > 0 ? <Mail size={16} aria-hidden="true" /> : <CheckCheck size={16} aria-hidden="true" />}{nonLus > 0 ? `${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}` : fils.length ? "Tout est lu" : "Aucun message reçu"}</span>
    </div>

    <div className={styles.messagerie} data-selection={Boolean(ouverte)} data-vide={fils.length === 0}>
      <section className={styles.annuaire} aria-label="Conversations">
        <header className={styles.enteteAnnuaire}><h2>Conversations</h2><span>{fils.length}</span></header>
        <div className={styles.outils}>
          <div className={styles.recherche}><Search size={17} aria-hidden="true" /><Label htmlFor={idRecherche} className="sr-only">Rechercher une conversation</Label>
            <Input id={idRecherche} type="search" placeholder="Nom ou message…" value={recherche} onChange={(event) => setRecherche(event.target.value)} aria-controls={idListe} />
            {recherche && <button type="button" onClick={() => setRecherche("")} aria-label="Effacer la recherche"><X size={15} /></button>}
          </div>
          <div className={styles.filtres} role="group" aria-label="Filtrer les conversations">
            <button type="button" aria-pressed={!nonLuesSeulement} aria-controls={idListe} onClick={() => setNonLuesSeulement(false)}>Toutes<span>{fils.length}</span></button>
            <button type="button" aria-pressed={nonLuesSeulement} aria-controls={idListe} onClick={() => setNonLuesSeulement(true)}>Non lues<span>{actives.length}</span></button>
          </div>
        </div>
        <div id={idListe} className={styles.liste}>
          {visibles.length ? <ul>{visibles.map((fil) => <li key={fil.person_id}>
            <Link href={`${base}/messages?personne=${encodeURIComponent(fil.person_id)}`} prefetch={false} scroll={false}
              aria-current={ouverte?.person_id === fil.person_id ? "page" : undefined} className={styles.fil} data-non-lu={fil.non_lus > 0}>
              <span className={styles.avatar} aria-hidden="true">{initiales(fil.nom, fil.prenom)}</span>
              <span className={styles.apercuFil}><strong>{[fil.prenom, fil.nom].filter(Boolean).join(" ")}</strong><span>{fil.dernier_auteur === "gerant" ? "Vous : " : ""}{fil.dernier || "Ouvrir la conversation"}</span>
                {fil.dernier_le && <time dateTime={fil.dernier_le}>{formaterDateHeure(fil.dernier_le)}</time>}
              </span>
              {fil.non_lus > 0 ? <span className={styles.badgeNonLu} aria-label={`${fil.non_lus} messages non lus`}>{fil.non_lus}</span> : <ChevronRight size={15} className={styles.chevron} aria-hidden="true" />}
            </Link>
          </li>)}</ul> : <div className={styles.listeVide} role="status"><Inbox size={28} strokeWidth={1.5} aria-hidden="true" />
            <strong>{recherche ? "Aucun résultat" : nonLuesSeulement ? "Aucune conversation non lue" : "Aucune conversation"}</strong>
            <p>{recherche ? "Essayez un autre nom ou mot-clé." : nonLuesSeulement ? "Vos conversations lues restent disponibles dans « Toutes »." : "Vos échanges apparaîtront ici après le premier message."}</p>
            {(recherche || nonLuesSeulement) && <button type="button" onClick={() => { setRecherche(""); setNonLuesSeulement(false); }}>Afficher toutes les conversations</button>}
          </div>}
        </div>
        <Link href={`${base}/personnes`} className={styles.annuaireLien}><UsersRound size={16} aria-hidden="true" />Locataires & garants<ArrowRight size={14} aria-hidden="true" /></Link>
      </section>

      <section className={styles.conversation} aria-label={ouverte ? `Conversation avec ${[ouverte.prenom, ouverte.nom].filter(Boolean).join(" ")}` : "Vos échanges"}>
        {ouverte ? <>
          <header className={styles.enteteConversation}>
            <Link href={`${base}/messages`} className={styles.retour} aria-label="Retour aux conversations"><ArrowLeft size={18} aria-hidden="true" /></Link>
            <span className={styles.avatar} aria-hidden="true">{initiales(ouverte.nom, ouverte.prenom)}</span>
            <div><h2>{[ouverte.prenom, ouverte.nom].filter(Boolean).join(" ")}</h2><p>Votre conversation</p></div>
            <Link href={`${base}/personnes/${ouverte.person_id}`} prefetch={false} className={styles.ficheLien}>Voir sa fiche<ArrowRight size={14} aria-hidden="true" /></Link>
          </header>
          <div className={styles.contenuConversation}>{conversation}</div>
        </> : <div className={styles.accueilConversation}>
          <div className={styles.illustration} aria-hidden="true"><span><MessageCircle size={38} strokeWidth={1.3} /></span><span><Mail size={26} strokeWidth={1.4} /></span><i /><i /></div>
          <span className={styles.surtitre}>Votre messagerie Gerimmo</span>
          <h2>{fils.length ? "Tous vos échanges, au même endroit" : "Votre première conversation commence ici"}</h2>
          <p>{fils.length ? "Choisissez une conversation pour lire les messages et y répondre directement." : "Une question, une information à transmettre ? Choisissez un locataire pour lui écrire depuis sa fiche."}</p>
          {!fils.length && <Link href={`${base}/personnes`} className="btn-or"><PenLine size={16} aria-hidden="true" />Choisir un locataire<ArrowRight size={15} aria-hidden="true" /></Link>}
          <div className={styles.noteAccueil}><CheckCheck size={18} aria-hidden="true" /><p>Les réponses arrivent dans l’espace du locataire.<br />L’historique reste regroupé dans une seule conversation.</p></div>
        </div>}
      </section>
    </div>
  </main>;
}
