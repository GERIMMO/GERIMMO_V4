import type { SupabaseClient } from '@supabase/supabase-js';
import { ArretSupervision, verifierAvantEffet } from './controle-effets';
import { envoyerEmail } from './email';
import { echapperMarque } from './marque-organisation';
import { instantRdv } from './rendez-vous-locataire';
import { adresseDuSite } from './site';

type Relance = { demande_id: string; reservation_id: string; intervention_id: string; organization_id: string; adresse: string; expire_le: string; rdv_debut: string; rdv_fin: string | null };
export type BilanRelancesReports = { envoyees: number; echecs: number; incertaines: number; ignorees: number; non_notees: number; restantes?: number };

/** Une tentative durable par demande. Une réponse perdue n'est jamais retentée automatiquement :
 * elle est comptée « incertaine », pour éviter un doublon même après les 24 h du prestataire. */
export async function envoyerRelancesReportsRdv(db: SupabaseClient, options: {echeanceMs?:number;horloge?:()=>number} = {}): Promise<BilanRelancesReports> {
  const bilan: BilanRelancesReports = { envoyees:0, echecs:0, incertaines:0, ignorees:0, non_notees:0 };
  const horloge=options.horloge??Date.now;
  const fin=options.echeanceMs??Infinity;
  if(horloge()>=fin)return bilan;
  await verifierAvantEffet(db, 'rappels');
  if(horloge()>=fin)return bilan;
  const lecture = await db.rpc('reports_rdv_a_relancer', {p_limite:10});
  if (lecture.error) return {...bilan,echecs:1};
  // Dix appels bornés et parallèles ; chacun revérifie l'arrêt et réserve atomiquement sa demande.
  const resultats = await Promise.allSettled(((lecture.data ?? []) as {demande_id:string}[]).map(async ({demande_id}) => {
    if(horloge()>=fin){bilan.restantes=(bilan.restantes??0)+1;return;}
    await verifierAvantEffet(db, 'rappels');
    if(horloge()>=fin){bilan.restantes=(bilan.restantes??0)+1;return;}
    const reservation = await db.rpc('reserver_relance_report_rdv', {p_demande:demande_id});
    if (reservation.error) { bilan.echecs++; return; }
    const relance = reservation.data as Relance | null;
    if (!relance) { bilan.ignorees++; return; }
    // On ne rend que NOTRE réservation et seulement si le contrôle avant fournisseur a refusé.
    // Un timeout, une réponse perdue ou une exception après ce contrôle garde toujours la réservation.
    const rendre = async () => {
      try {
        const r = await db.rpc('liberer_relance_report_rdv', {p_demande:demande_id,p_reservation:relance.reservation_id});
        if(r.error || r.data !== true)bilan.non_notees++;
      } catch { bilan.non_notees++; }
    };
    const compterNonPartie = () => {
      if(horloge()>=fin)bilan.restantes=(bilan.restantes??0)+1;
      else bilan.ignorees++;
    };
    if(horloge()>=Math.min(fin,new Date(relance.expire_le).getTime())) {
      await rendre();compterNonPartie();return;
    }
    let nonPartie = false;
    let envoyee = false;
    try {
      const r = await envoyerEmail({
        avantEnvoi: async () => {
          try {
            await verifierAvantEffet(db, 'rappels');
            if (horloge() >= Math.min(fin,new Date(relance.expire_le).getTime())) throw new Error('Le délai de réponse est écoulé : aucune relance envoyée.');
          } catch(e) { nonPartie=true;throw e; }
        },
        get delaiMaxMs(){return Math.max(1,Math.floor(Math.min(15_000,fin-horloge())));},
        organisation:{db,id:relance.organization_id},
        to:relance.adresse,
        cleIdempotence:`rdv-report:relance:${demande_id}`,
        subject:'Un report de rendez-vous attend votre réponse',
        html:`<p>Le locataire vous a demandé de reporter son rendez-vous. Répondez avant ${echapperMarque(instantRdv(relance.expire_le))}.</p><p>Le rendez-vous actuel reste valable tant que vous n’avez pas accepté une nouvelle date.</p><p><a href="${echapperMarque(`${adresseDuSite()}/artisan/missions/${relance.intervention_id}`)}">Voir la demande de report</a></p>`,
      });
      if(nonPartie && !r.incertain) { await rendre();compterNonPartie();return; }
      if (r.incertain) bilan.incertaines++;
      else if (r.erreur) bilan.echecs++;
      else { bilan.envoyees++; envoyee=true; }
    } catch (e) {
      if (e instanceof ArretSupervision) {
        if(nonPartie)await rendre();
        throw e;
      }
      bilan.incertaines++;
    }
    // Cette trace ne provoque aucun nouvel envoi. Un échec laisse la réservation en place.
    const note = await db.rpc('noter_relance_report_rdv', {p_demande:demande_id,p_envoyee:envoyee});
    if (note.error) bilan.non_notees++;
  }));
  // Une passe ne se termine pas pendant qu'une autre branche libère encore sa réservation.
  const arret=resultats.find(r=>r.status==='rejected' && r.reason instanceof ArretSupervision);
  if(arret?.status==='rejected')throw arret.reason;
  const erreur=resultats.find(r=>r.status==='rejected');
  if(erreur?.status==='rejected')throw erreur.reason;
  return bilan;
}
