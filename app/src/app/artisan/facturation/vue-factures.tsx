import type { ReactNode } from "react";
import Link from "next/link";
import { bilanReglements, activationModuleArtisan, type ActiviteArtisanPrivee } from "@/lib/artisan-prive";
import type { FactureVueParArtisan } from "@/lib/reglement-facture";
import { phraseEtatPourArtisan } from "@/lib/reglement-facture";
import { titreIncident } from "@/lib/incidents";
import type { LigneAgenda } from "../acces";
import { euros } from "../libelles";
import { Erreur } from "../ui";
import styles from "./facturation.module.css";

/** Agrégation de présentation : mêmes soldes que le registre, une seule fois par facture.
 * Les déclarations des clients ne sont jamais ajoutées à celles de l’artisan. */
export function preparerVueFactures(data: ActiviteArtisanPrivee, clients: FactureVueParArtisan[], lectureClientsEnEchec = false) {
  const uniques = [...new Map(data.factures.map(f => [`${f.origine}:${f.id}`, f])).values()];
  const lignes = uniques.map(f => {
    const bilan = bilanReglements(f, data.reglements, data.avoirs);
    const client = f.origine === "gerimmo" ? clients.find(c => c.facture_id === f.id) : undefined;
    const validationInconnue = f.origine === "gerimmo" && (lectureClientsEnEchec || !client);
    // Audit palier 1 (P1-03) : refusée par le client, elle n'est pas due ; elle reste au registre, sans geste de règlement.
    const statut = client?.etat === "refusee" ? "Refusée par votre client"
      : bilan.avoir ? "Annulée par avoir"
      : bilan.solde < 0 ? "Trop-perçu déclaré"
      : bilan.solde === 0 ? (bilan.declare > 0 ? "Réglée · déclaré" : "Solde nul")
      : bilan.declare > 0 ? "Partiellement réglée · déclaré"
      : client?.etat === "reglee" ? "Réception à confirmer"
      : validationInconnue ? "Validation à vérifier"
      : client?.etat === "deposee" ? "En attente de validation" : "À régler";
    return { f, bilan, client, statut };
  });
  const attendues = lignes.filter(l => l.bilan.solde > 0 && l.client?.etat !== "refusee");
  return { lignes, attendues: attendues.length, reste: attendues.reduce((s, l) => s + l.bilan.solde, 0), enValidation: attendues.filter(l => l.client?.etat === "deposee").length };
}

export function VueFactures({ data, erreur, clients, erreurClients, agenda, actions }: {
  data: ActiviteArtisanPrivee | null; erreur?: string; clients: FactureVueParArtisan[]; erreurClients: boolean; agenda: LigneAgenda[]; actions?: ReactNode;
}) {
  if (!data) return <Erreur>{erreur || "Vos factures n’ont pas pu être chargées. Le total est indisponible."}</Erreur>;
  const vue = preparerVueFactures(data, clients, erreurClients);
  const peutDeclarer = activationModuleArtisan("reglements") && data.activation.reglements;
  return <div className="space-y-4">
    <section className={styles.resume} aria-label="Sommes restant à recevoir">
      <div><p>Restant à recevoir</p><strong>{euros(vue.reste)}</strong><p>{vue.attendues} facture{vue.attendues > 1 ? "s" : ""} concernée{vue.attendues > 1 ? "s" : ""}{vue.enValidation > 0 && ` · dont ${vue.enValidation} en attente de validation`}</p></div>
      <p className={styles.precision}>Selon vos règlements déclarés, sans confirmation bancaire. Vérifiez la réception sur votre compte avant de déclarer un règlement.</p>
    </section>
    {erreurClients && <Erreur>Les déclarations de vos clients sont indisponibles. Votre registre reste visible ; aucune absence de règlement client n’est déduite de cette erreur.</Erreur>}
    {actions}
    {!vue.lignes.length ? <div className={styles.section}><div className={styles.vide}><h2>Aucune facture pour l’instant</h2><p>Retrouvez ici vos factures et les sommes restant à recevoir après vos interventions.</p><Link href="/artisan/agenda" className={styles.boutonPrincipal}>Voir mes interventions</Link></div></div> :
    <ul className={styles.facturesSimples} aria-label="Mes factures">
      {vue.lignes.map(({ f, bilan, client, statut }) => {
        const mission = agenda.find(l => l.intervention_id === f.intervention_id);
        const chantier = data.chantiers.find(l => l.id === f.chantier_id);
        const url = `/artisan/facturation/${f.id}`;
        return <li key={`${f.origine}:${f.id}`} className={styles.ligneSimple} data-facture={f.id}>
          <div className={styles.identiteFacture}><h2><Link href={url}>{f.client}</Link></h2><p>{chantier?.titre ?? (mission ? titreIncident(mission.categorie) : "Intervention facturée")}</p><small>Facture {f.numero}{f.origine === "externe" ? " · Client externe" : ""}</small></div>
          <dl className={styles.chiffres}><div><dt>Facturé TTC</dt><dd>{euros(Number(f.montant_ttc_cents))}</dd></div><div><dt>Reçu déclaré</dt><dd>{euros(bilan.declare)}</dd></div><div><dt>Solde</dt><dd>{euros(bilan.solde)}</dd></div></dl>
          <div className={styles.actionFacture}><span className={styles.etatSimple} data-soldee={bilan.solde === 0 && !bilan.avoir}>{statut}</span>
            {client && (client.etat !== "deposee" || bilan.declare > 0) && <small>{phraseEtatPourArtisan(client)}</small>}
            {bilan.solde > 0 && !bilan.avoir && peutDeclarer && client?.etat !== "refusee" ? <Link href={`${url}#declarer-reglement`} className={styles.actionReglement}>Déclarer un règlement reçu →</Link> : <Link href={url} className={styles.actionReglement}>Voir le détail et l’historique →</Link>}
          </div>
        </li>;
      })}
    </ul>}
  </div>;
}
