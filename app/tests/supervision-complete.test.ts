import {describe,it,expect,vi,beforeEach} from 'vitest';
import {bilanMouvements,montantEnCentimes,periodeFinanciere,type MouvementStripe} from '@/lib/tresorerie-supervision';
import {lireProspect} from '@/lib/prospects-supervision';
import {CHAMPS_EDITEUR,CHAMPS_MULTILIGNES,validerIdentite} from '@/lib/identite-editeur';
import {CHAMPS_PRESTATAIRES} from '@/lib/editeur';
const mouvement=(v:Partial<MouvementStripe>):MouvementStripe=>({id:'txn_test',created:0,type:'charge',currency:'eur',amount:10000,fee:300,net:9700,status:'available',...v});
describe('Trésorerie réelle',()=>{
 it('ne compte pas un virement bancaire comme un second revenu',()=>expect(bilanMouvements([mouvement({}),mouvement({type:'payout',amount:-9700,fee:0,net:-9700})])).toMatchObject({encaissements:10000,frais:300,virements:9700,variation:0}));
 it('rapproche remboursements, annulations et frais autonomes sans double compte',()=>expect(bilanMouvements([mouvement({}),mouvement({type:'refund',amount:-2000,fee:0,net:-2000}),mouvement({type:'refund_failure',amount:500,fee:0,net:500}),mouvement({type:'stripe_fee',amount:-100,fee:0,net:-100})])).toMatchObject({encaissements:10000,remboursements:1500,frais:400,variation:8100}));
 it('isole les devises étrangères',()=>expect(bilanMouvements([mouvement({currency:'usd'})])).toMatchObject({encaissements:0,autresDevises:1}));
 it('conserve les litiges et ajustements sans les appeler paiements',()=>expect(bilanMouvements([mouvement({type:'adjustment',amount:-500,fee:150,net:-650})])).toMatchObject({encaissements:0,autres:-500,frais:150,variation:-650}));
 it('utilise les limites du mois à Paris incluant le changement d’heure',()=>{const r=periodeFinanciere('2026-10','2026-10-18');expect(new Date(r.gte*1000).toISOString()).toBe('2026-09-30T22:00:00.000Z');expect(new Date(r.lt*1000).toISOString()).toBe('2026-10-31T23:00:00.000Z');});
 it('rejette un mois injecté',()=>expect(periodeFinanciere('2026-13','2026-10-18').mois).toBe('2026-10'));
 it.each([['12,34',1234],['-12.30',-1230],['0',null],['1.234',null],['1e5',null],['abc',null],['99999999',null]])('montant %s', (v,n)=>expect(montantEnCentimes(String(v))).toBe(n));
});
const form=(values:Record<string,string>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};
const base={nom:'Prospect test',email:'essai@example.test',origine:'Contact',etape:'nouveau',prochaine_action:'Appeler',echeance:'2026-10-20',notes:''};
describe('Suivi commercial',()=>{
 it('exige une prochaine action pour les prospects ouverts',()=>expect(lireProspect(form({...base,prochaine_action:''})).erreur).toBeTruthy());
 it('exige une date réelle',()=>expect(lireProspect(form({...base,echeance:'2026-02-31'})).erreur).toBeTruthy());
 it('refuse une fausse conversion sans espace',()=>expect(lireProspect(form({...base,etape:'gagne'})).erreur).toBeTruthy());
 it('exige un motif de perte',()=>expect(lireProspect(form({...base,etape:'perdu'})).erreur).toBeTruthy());
 it('accepte une perte expliquée sans prochaine action',()=>expect(lireProspect(form({...base,etape:'perdu',notes:'Projet abandonné',echeance:'',prochaine_action:''})).champs).toBeTruthy());
 it('refuse une étape arbitraire',()=>expect(lireProspect(form({...base,etape:'publier'})).erreur).toBeTruthy());
 it('conserve une action en retard pour le suivi',()=>expect(lireProspect(form({...base,echeance:'2020-01-01'})).champs?.echeance).toBe('2020-01-01'));
});
describe('Paramètres publics',()=>{
 it('ne sauvegarde aucun champ inconnu',()=>expect(validerIdentite(form({secret:'interdit',denomination:'Gerimmo'})).valeurs).not.toHaveProperty('secret'));
 it('ne fabrique pas une valeur pour un champ vide',()=>expect(validerIdentite(form({})).valeurs?.denomination).toBeNull());
 it('refuse les liens exécutables',()=>expect(validerIdentite(form({mediateurSite:'javascript:alert(1)'})).erreur).toBeTruthy());
 it('refuse un SIRET incomplet',()=>expect(validerIdentite(form({siret:'123'})).erreur).toBeTruthy());
 // 19/10 : la localisation de la Base Adresse Nationale et les coordonnées des prestataires se saisissent ici aussi.
 it('écrit une clé par champ du formulaire, prestataires compris, et rien d’autre',()=>{expect(Object.keys(validerIdentite(form({})).valeurs!)).toEqual(Object.keys(CHAMPS_EDITEUR));expect(Object.keys(CHAMPS_EDITEUR)).toEqual(expect.arrayContaining(Object.keys(CHAMPS_PRESTATAIRES)));expect(Object.keys(CHAMPS_EDITEUR)).toHaveLength(25);});
 it('normalise les fins de ligne des coordonnées saisies en zone multiligne',()=>{expect(CHAMPS_MULTILIGNES.has('coordonneesSupabase')).toBe(true);expect(CHAMPS_MULTILIGNES.has('localisationBan')).toBe(false);expect(CHAMPS_MULTILIGNES.has('siege')).toBe(false);expect(validerIdentite(form({coordonneesSupabase:'Ligne 1\r\nLigne 2\r'})).valeurs?.coordonneesSupabase).toBe('Ligne 1\nLigne 2');});
 it('garde la limite de 1 000 caractères sur les coordonnées',()=>{expect(validerIdentite(form({coordonneesVercel:'a'.repeat(1001)})).erreur).toBe('Un champ dépasse 1 000 caractères.');expect(validerIdentite(form({coordonneesVercel:'a'.repeat(1000)})).erreur).toBeUndefined();});
});
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>mock}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {ajouterCout} from '@/app/actions/supervision-couts';
import {enregistrerIdentite} from '@/app/actions/identite-editeur';
import {enregistrerProspect} from '@/app/actions/prospects-supervision';
describe('Autorisations des nouvelles écritures',()=>{
 beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:false,error:null});});
 it.each(['2026-02-31','2999-01-01'])('refuse une date de paiement impossible ou future : %s',async jour=>{mock.rpc.mockResolvedValue({data:true,error:null});expect((await ajouterCout({},form({jour,montant:'12',fournisseur:'Test fictif',categorie:'ia',reference:'TEST',preuve:'Test local'}))).erreur).toMatch(/date réelle/);expect(mock.from).not.toHaveBeenCalled();});
 it.each([ajouterCout,enregistrerIdentite,enregistrerProspect])('refuse avant toute écriture sans supervision permanente',async action=>{expect((await action({},new FormData())).erreur).toBeTruthy();expect(mock.from).not.toHaveBeenCalled();});
});
// 19/10 : le message de succès disait « reprise sur les trois pages légales » sans dire que des faits manquaient encore
// ni que l'encadré « Document en cours de finalisation » restait affiché. Il dit désormais ce qui reste à compléter.
const ecriture=(reponse:{data:unknown;error:unknown})=>({update:()=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>reponse})})})})});
const toutFourni=()=>{const v:Record<string,string>={revision:'0'};for(const k of Object.keys(CHAMPS_EDITEUR))v[k]=k==='email'?'contact@example.test':k==='siret'?'00000000000000':k==='mediateurSite'?'https://mediateur.example':`Valeur fictive ${k}`;return v;};
describe('Message de succès véridique (19/10)',()=>{
 beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:true,error:null});mock.from.mockReturnValue(ecriture({data:{revision:1},error:null}));});
 it('dit ce qui reste à compléter, faits d’éditeur et prestataires',async()=>{const r=await enregistrerIdentite({},form({revision:'0',denomination:'Éditeur fictif'}));expect(r.erreur).toBeUndefined();expect(r.revision).toBe(1);expect(r.succes).toContain('Il reste à compléter : ');expect(r.succes).toContain('la forme juridique');expect(r.succes).toContain('la localisation de Base Adresse Nationale');expect(r.succes).toContain('les coordonnées de 11 prestataires sur 11');expect(r.succes).not.toContain('la dénomination sociale');expect(r.succes).toContain('Document en cours de finalisation');});
 it('dit que rien ne reste à compléter quand tout est fourni',async()=>{const r=await enregistrerIdentite({},form(toutFourni()));expect(r.erreur).toBeUndefined();expect(r.succes).toBe('Identité enregistrée et reprise sur les trois pages légales de cet environnement ; rien ne reste à compléter.');});
 it('nomme la migration à appliquer quand la base refuse une clé (check_violation)',async()=>{mock.from.mockReturnValue(ecriture({data:null,error:{code:'23514'}}));const r=await enregistrerIdentite({},form(toutFourni()));expect(r.succes).toBeUndefined();expect(r.erreur).toMatch(/migration/);});
 it('garde le message générique pour les autres refus',async()=>{mock.from.mockReturnValue(ecriture({data:null,error:null}));expect((await enregistrerIdentite({},form(toutFourni()))).erreur).toMatch(/Rechargez avant de réessayer/);});
});
