/** Régressions produit de l’audit du 28 octobre : états affichés conformes aux données. */
import { createElement } from 'react';
import type { LigneAgenda } from '@/app/artisan/acces';
import type { DemandeRdvArtisan } from '@/lib/rendez-vous-locataire';
import type { FactureVueParArtisan } from '@/lib/reglement-facture';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
const b = vi.hoisted(() => ({ agenda: { lignes: [] as LigneAgenda[], erreur: false }, reglements: { lignes: [] as FactureVueParArtisan[], erreur: false }, demandes: { lignes: [] as DemandeRdvArtisan[], erreur: false }, lireDemandes: vi.fn() }));
vi.mock('@/lib/use-action-state-protegee', () => ({ useActionStateProtegee: (_: unknown, initial: unknown) => [initial, () => {}] }));
vi.mock('@/app/actions/incidents', () => ({ contesterImputation: vi.fn(), signalerProblemePersiste: vi.fn() }));
vi.mock('@/app/locataire/[orgId]/demandes/suivi-intervention', () => ({ SuiviInterventionLocataire: () => null, etapeCourte: () => null }));
vi.mock('@/components/ui/bouton-envoi', () => ({ BoutonEnvoi: () => null }));
vi.mock('@/app/artisan/acces', () => ({
 verifierAccesArtisan: async () => ({ fiche: { statut_plateforme: 'valide', visibilite: 'public' }, supabase: { rpc: async () => ({data:null,error:null}) } }),
 chargerAgenda: async () => b.agenda,
 chargerReglementsFactures: async () => b.reglements,
 chargerDemandesRdv: () => { b.lireDemandes(); return Promise.resolve(b.demandes); },
 chargerCreneauxMission: async () => ({ lignes: [], erreur: false }),
 chargerPhotosDemande: async () => ({ photos: [], erreur: false }),
 chargerSollicitations: async () => ({ lignes: [], erreur: false }),
 chargerPieces: async () => ({ lignes: [], erreur: false }),
}));
vi.mock('@/app/artisan/clients/resumes', () => ({ ReglementsDansFacturation: () => null }));
vi.mock('@/app/artisan/photos-demande', () => ({ PhotosDeLaDemande: () => null }));
vi.mock('@/app/artisan/missions/[interventionId]/accuse-annulation', () => ({ AccuseAnnulation: () => null }));
vi.mock('@/app/artisan/missions/[interventionId]/accepter-refuser', () => ({ AccepterOuRefuser: () => null }));
vi.mock('@/app/artisan/missions/[interventionId]/avertissement-rendez-vous', () => ({ AvertissementRendezVousAnticipe: () => null }));
vi.mock('@/app/artisan/missions/[interventionId]/bouton-demarrer', () => ({ BoutonDemarrer: () => null }));
vi.mock('@/app/artisan/missions/[interventionId]/dates-locataire', () => ({ DatesLocataire: () => null }));
import { IncidentsLocataire, type IncidentLocataire } from '@/app/locataire/[orgId]/incidents-locataire';
import PageFacturation from '@/app/artisan/facturation/page';
import PageMission from '@/app/artisan/missions/[interventionId]/page';
import PageAccueil from '@/app/artisan/page';
const mission = (extra: Record<string,unknown> = {}) => ({ intervention_id:'mission', statut:'terminee', compte_rendu_depose:true, photo_apres_deposee:true, facture_deposee:true, montant_ttc_cents:60000, montant_plafond_cents:60000, agence_nom:'Agence fictive', categorie:'plomberie_canalisation', incident_numero:'AUDIT-001', creneaux_en_attente:0, dates_locataire_en_attente:0, ...extra } as LigneAgenda);
const demande = (statut: DemandeRdvArtisan['statut']): DemandeRdvArtisan => ({demande_id:'demande',intervention_id:'mission',type:'report',statut,motif_code:'indisponible',motif_texte:null,demandee_le:'2026-10-28T10:00:00Z',expire_le:null,rdv_debut:'2099-01-01T10:00:00Z',rdv_fin:null,tardive:false});
beforeEach(() => { b.agenda={lignes:[],erreur:false}; b.reglements={lignes:[],erreur:false}; b.demandes={lignes:[],erreur:false}; vi.clearAllMocks(); });
test('PROD-01 : le rendu inactif ne propose ni contester ni rouvrir', () => {
 const commun={categorie:'plomberie_canalisation',est_declarant:true,imputation_contestee_le:null,declare_le:'2026-10-01',nb_photos:0};
 const html=renderToStaticMarkup(createElement(IncidentsLocataire,{ orgId:'org',peutAgir:false,peutSignaler:false,incidents:[{...commun,id:'ouvert',etat:'qualifie',imputation:'locataire'},{...commun,id:'clos',etat:'clos',imputation:'proprietaire'}] as IncidentLocataire[] }));
 expect(html).not.toContain('Contester qui paie'); expect(html).not.toContain('Le problème persiste');
});
test('PROD-03 : une panne agenda propose de réessayer, sans faux 404', async () => {
 b.agenda={lignes:[],erreur:true};
 const html=renderToStaticMarkup(await PageMission({ params:Promise.resolve({interventionId:'mission'}),searchParams:Promise.resolve({}) } as Parameters<typeof PageMission>[0])); expect(html).toContain('Réessayer');
});
test('PROD-04 : facture réelle 800 EUR et référence devis 600 EUR distinctes', async () => {
 b.agenda.lignes=[mission()]; b.reglements.lignes=[{facture_id:'facture',intervention_id:'mission',organization_id:'org',numero:'F800',montant_ttc_cents:80000,validee_le:null,etat:'deposee',reglee_le:null,reglements:[]}];
 const html=renderToStaticMarkup(await PageFacturation({params:Promise.resolve({}),searchParams:Promise.resolve({})} as Parameters<typeof PageFacturation>[0])).replace(/[\u00a0\u202f]/g,' ');
 expect(html).toContain('600,00'); expect(html).toContain('800,00'); expect(html).toContain('F800');
});
test('PROD-05a : paramètre facture=1 ne crée pas un succès sans facture', async () => {
 const html=renderToStaticMarkup(await PageFacturation({params:Promise.resolve({}),searchParams:Promise.resolve({facture:'1'})} as Parameters<typeof PageFacturation>[0]));
 expect(html).not.toContain('Facture déposée.'); expect(html).not.toContain('enregistrée.'); expect(b.agenda.lignes).toHaveLength(0);
});
test('PROD-05b : paramètre termine=1 ne termine pas une mission planifiée', async () => {
 b.agenda.lignes=[mission({statut:'planifiee',compte_rendu_depose:false,photo_apres_deposee:false,facture_deposee:false,debut_prevu:'2099-01-01T10:00:00Z',fin_prevue:'2099-01-01T12:00:00Z'})];
 const html=renderToStaticMarkup(await PageMission({params:Promise.resolve({interventionId:'mission'}),searchParams:Promise.resolve({termine:'1'})} as Parameters<typeof PageMission>[0]));
 expect(html).not.toContain('Compte rendu envoyé.'); expect(html).not.toContain('Compte rendu enregistré.');
});
test('PROD-06 : accueil présente le report demandé sur mission planifiée', async () => {
 b.agenda.lignes=[mission({statut:'planifiee',compte_rendu_depose:false,photo_apres_deposee:false,facture_deposee:false,debut_prevu:'2099-01-01T10:00:00Z',fin_prevue:'2099-01-01T12:00:00Z'})];
 b.demandes.lignes=[demande('en_attente')];
 const html=renderToStaticMarkup(await PageAccueil());
 expect(html).not.toContain('Aucune mission à traiter maintenant'); expect(b.lireDemandes).toHaveBeenCalled(); expect(html).toContain('Répondre à la demande de report');
});

test.each([true, false])('PROD-01 : droits du titulaire actif=%s', actif => {
 const incident={id:'i',categorie:'plomberie_canalisation',est_declarant:actif,etat:'qualifie',imputation:'locataire',imputation_contestee_le:null,declare_le:'2026-10-01',nb_photos:0};
 const html=renderToStaticMarkup(createElement(IncidentsLocataire,{orgId:'org',peutAgir:true,peutSignaler:true,incidents:[incident] as IncidentLocataire[]}));
 expect(html.includes('Contester qui paie')).toBe(actif);
});
test('PROD-03 : une lecture réussie sans dossier reste un 404', async () => {
 await expect(PageMission({params:Promise.resolve({interventionId:'inconnu'}),searchParams:Promise.resolve({})} as Parameters<typeof PageMission>[0])).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});
test('PROD-04 : montant illisible ne devient pas celui du devis', async () => {
 b.agenda.lignes=[mission()]; b.reglements.erreur=true;
 const html=renderToStaticMarkup(await PageFacturation({params:Promise.resolve({}),searchParams:Promise.resolve({})} as Parameters<typeof PageFacturation>[0]));
 expect(html).toContain('Montant indisponible'); expect(html).toContain('role="alert"');
});
test('PROD-05 : confirmation liée à la facture réellement lue', async () => {
 b.agenda.lignes=[mission()]; b.reglements.lignes=[{facture_id:'facture',intervention_id:'mission',numero:'F800',organization_id:'org',validee_le:null,reglee_le:null,montant_ttc_cents:80000,etat:'deposee',reglements:[]}];
 const html=renderToStaticMarkup(await PageFacturation({params:Promise.resolve({}),searchParams:Promise.resolve({facture:'mission'})} as Parameters<typeof PageFacturation>[0]));
 expect(html).toContain('Facture n° F800 enregistrée.');
 b.reglements.erreur=true;
 const erreur=renderToStaticMarkup(await PageFacturation({params:Promise.resolve({}),searchParams:Promise.resolve({facture:'mission'})} as Parameters<typeof PageFacturation>[0]));
 expect(erreur).not.toContain('Facture n° F800 enregistrée.');
});
test.each(['acceptee','refusee','retiree','expiree'] as const)('PROD-06 : demande %s ne reste pas à traiter', async statut => {
 b.agenda.lignes=[mission({statut:'planifiee',debut_prevu:'2099-01-01T10:00:00Z',fin_prevue:'2099-01-01T12:00:00Z'})];
 b.demandes.lignes=[demande(statut)];
 const html=renderToStaticMarkup(await PageAccueil());
 expect(html).not.toContain('Répondre à la demande de report'); expect(html).toContain('Aucune mission à traiter maintenant');
});
test('PROD-06 : lecture des demandes en échec ne signifie pas rien à faire', async () => {
 b.demandes.erreur=true;
 const html=renderToStaticMarkup(await PageAccueil());
 expect(html).toContain('Connexion instable'); expect(html).not.toContain('Aucune mission à traiter maintenant');
});
