import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({acces:vi.fn(),rpc:vi.fn(),service:vi.fn(),config:vi.fn(),assembler:vi.fn(),preparer:vi.fn(),activer:vi.fn(),lire:vi.fn(),annuler:vi.fn(),stop:vi.fn(),download:vi.fn(),circuit:{} as Record<string,unknown>}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:m.acces}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:m.service}));
vi.mock('@/lib/signature-bail',()=>({assemblerSignatureBail:m.assembler,configurationSignatureBail:m.config,configurationSuiviSignatureBail:m.config}));
vi.mock('@/lib/signature-prestataire',async(importer)=>({...await importer<typeof import('@/lib/signature-prestataire')>(),preparerCircuitSignature:m.preparer,activerDemandeSignature:m.activer,lireDemandeSignature:m.lire,annulerDemandeSignature:m.annuler,supprimerBrouillonSignature:vi.fn()}));
vi.mock('@/lib/controle-effets',()=>({verifierAvantEffet:m.stop}));
import {envoyerSignatureBail,annulerSignatureBail,activerBailApresSignature} from '@/app/actions/signature-bail';
beforeEach(()=>{
 vi.resetAllMocks();m.circuit={id:'circuit',bail_id:'11111111-1111-4111-8111-111111111111',prestataire:'youtrust',etat:'pret',environnement:'production',empreinte:'actuelle',pdf_hash:'invalide',signataires:[],annexes:[],document_id:'doc',expire_le:new Date(Date.now()+30*86400000).toISOString(),external_request_id:'req'};
 m.rpc.mockResolvedValue({data:true,error:null});m.service.mockReturnValue({rpc:m.rpc});
 const db={rpc:m.rpc,storage:{from:()=>({download:m.download})},from:(table:string)=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='bail_signature_circuits'?m.circuit:{storage_path:'org/doc.pdf',mime_type:'application/pdf'},error:null})};return q;}};
 m.acces.mockResolvedValue({supabase:db,user:{id:'owner'}});m.config.mockReturnValue({environnement:'production'});
 m.assembler.mockResolvedValue({empreinte:'actuelle',manquants:[]});m.download.mockResolvedValue({data:new Blob(['%PDF-fictif']),error:null});
});
afterEach(()=>vi.unstubAllEnvs());
const envoyer=()=>envoyerSignatureBail('org','11111111-1111-4111-8111-111111111111','circuit');
const aucunEnvoi=()=>{expect(m.preparer).not.toHaveBeenCalled();expect(m.activer).not.toHaveBeenCalled();expect(m.rpc.mock.calls.some(c=>c[0]==='reserver_envoi_signature_bail')).toBe(false);};
describe('Garde avant tout envoi du bail',()=>{
 it('réserve la recette au marqueur serveur du compte permanent, pas aux métadonnées modifiables',async()=>{
  const org='11111111-1111-4111-8111-111111111111';vi.stubEnv('SIGNATURE_BAIL_ORGS_ESSAI',org);
  m.acces.mockResolvedValue({user:{id:'owner',user_metadata:{gerimmo_recette:'permanente-v1'}}});
  expect((await envoyerSignatureBail(org,'bail','circuit')).erreur).toContain('compte de recette permanent');
  expect(m.rpc).not.toHaveBeenCalled();aucunEnvoi();
 });
 it('un compte permanent reste soumis à son rôle propriétaire',async()=>{
  const org='11111111-1111-4111-8111-111111111111';vi.stubEnv('SIGNATURE_BAIL_ORGS_ESSAI',org);
  const g=await m.acces();g.user.app_metadata={gerimmo_recette:'permanente-v1'};m.acces.mockResolvedValue(g);m.rpc.mockResolvedValue({data:false,error:null});
  expect((await envoyerSignatureBail(org,'bail','circuit')).erreur).toContain('propre espace');aucunEnvoi();
 });
 it('un essai ne peut pas activer le bail après signature',async()=>{
  const org='11111111-1111-4111-8111-111111111111';vi.stubEnv('SIGNATURE_BAIL_ORGS_ESSAI',org);
  expect((await activerBailApresSignature(org,'bail','circuit')).erreur).toContain('ne met pas');expect(m.rpc).not.toHaveBeenCalled();
 });
 it('une session absente ne lit aucun dossier',async()=>{m.acces.mockResolvedValue({user:null});expect((await envoyer()).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();aucunEnvoi();});
 it('un rôle de supervision seul ne permet pas d’envoyer',async()=>{m.rpc.mockResolvedValue({data:false,error:null});expect((await envoyer()).erreur).toContain('propre espace');aucunEnvoi();});
 it('une configuration absente reste sans effet externe',async()=>{m.config.mockReturnValue(null);expect((await envoyer()).erreur).toContain('pas encore activée');aucunEnvoi();});
 it('un acte de caution ne part jamais chez un prestataire sans champ de mention personnelle',async()=>{m.circuit.modele='cautionnement';vi.stubEnv('ZOHO_SIGN_DOCUMENTS_ACTIF','true');expect((await envoyer()).erreur).toContain('signé avec Zoho');aucunEnvoi();});
 // Lot B7 — ZOHO_SIGN_CAUTIONNEMENT_FERME=1 : fermeture du seul envoi de l’acte de cautionnement.
 it('la fermeture du cautionnement bloque l’envoi avant toute lecture, réservation et appel, même avec Zoho actif',async()=>{
  m.circuit.modele='cautionnement';m.circuit.prestataire='zoho';vi.stubEnv('ZOHO_SIGN_DOCUMENTS_ACTIF','true');vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','1');
  const vue=await envoyer();
  expect(vue.erreur).toBe('L’envoi en signature électronique de l’acte de cautionnement est suspendu pour le moment. Vous pouvez préparer le document et le faire signer hors ligne.');
  aucunEnvoi();expect(m.download).not.toHaveBeenCalled();expect(m.stop).not.toHaveBeenCalled();
 });
 it('la fermeture du cautionnement s’applique aussi à une organisation d’essai',async()=>{
  const org='11111111-1111-4111-8111-111111111111';vi.stubEnv('SIGNATURE_BAIL_ORGS_ESSAI',org);vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','1');
  const g=await m.acces();g.user.app_metadata={gerimmo_recette:'permanente-v1'};m.acces.mockResolvedValue(g);
  m.circuit.modele='cautionnement';m.circuit.prestataire='zoho';
  expect((await envoyerSignatureBail(org,'11111111-1111-4111-8111-111111111111','circuit')).erreur).toContain('cautionnement est suspendu');aucunEnvoi();expect(m.download).not.toHaveBeenCalled();
 });
 it('la fermeture du cautionnement ne touche pas le bail',async()=>{vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','1');expect((await envoyer()).erreur).toContain('correspond plus au PDF préparé');aucunEnvoi();});
 it('la fermeture du cautionnement ne ferme pas un autre acte',async()=>{m.circuit.modele='avenant';vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','1');vi.stubEnv('ZOHO_SIGN_DOCUMENTS_ACTIF','true');expect((await envoyer()).erreur).toContain('signé avec Zoho');aucunEnvoi();});
 it('« true » (décision du 19/10) ferme aussi l’envoi du cautionnement',async()=>{m.circuit.modele='cautionnement';m.circuit.prestataire='zoho';vi.stubEnv('ZOHO_SIGN_DOCUMENTS_ACTIF','true');vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','true');expect((await envoyer()).erreur).toContain('cautionnement est suspendu');aucunEnvoi();expect(m.download).not.toHaveBeenCalled();});
 it('une valeur autre que « 1 » ou « true » laisse le cautionnement suivre son parcours habituel',async()=>{m.circuit.modele='cautionnement';vi.stubEnv('ZOHO_SIGN_DOCUMENTS_ACTIF','true');vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','oui');expect((await envoyer()).erreur).toContain('signé avec Zoho');aucunEnvoi();});
 it('un circuit de caution déjà envoyé reste annulable malgré la fermeture',async()=>{
  m.circuit.modele='cautionnement';m.circuit.etat='en_cours';vi.stubEnv('ZOHO_SIGN_CAUTIONNEMENT_FERME','1');m.lire.mockResolvedValue({id:'req',external_id:'autre',status:'ongoing'});
  expect((await annulerSignatureBail('org','11111111-1111-4111-8111-111111111111','circuit')).erreur).toContain('correspond pas');expect(m.lire).toHaveBeenCalled();
 });
 it('une préparation production ne part pas dans une sandbox',async()=>{m.config.mockReturnValue({environnement:'sandbox'});expect((await envoyer()).erreur).toContain('environnement');aucunEnvoi();});
 it('le mode essai exige une organisation explicitement autorisée',async()=>{m.circuit.environnement='sandbox';m.config.mockReturnValue({environnement:'sandbox'});vi.stubEnv('ZOHO_SIGN_ORGS_TEST','autre');expect((await envoyer()).erreur).toContain('pas autorisé');aucunEnvoi();});
 it('un dossier modifié doit être relu avant tout appel prestataire',async()=>{m.assembler.mockResolvedValue({empreinte:'nouvelle',manquants:[]});expect((await envoyer()).erreur).toContain('dossier a changé');aucunEnvoi();});
 it('une préparation expirée ne peut pas déclencher d’invitation',async()=>{m.circuit.expire_le=new Date(Date.now()-86400000).toISOString();expect((await envoyer()).erreur).toContain('trop ancienne');aucunEnvoi();});
 it('un remplacement du PDF est détecté même si ses métadonnées semblent valides',async()=>{expect((await envoyer()).erreur).toContain('correspond plus au PDF préparé');aucunEnvoi();});
 it('un contrôle métier refusé empêche le chargement et l’envoi du PDF',async()=>{m.rpc.mockImplementation(async(name:string)=>name==='has_org_role'?{data:true,error:null}:{error:{message:'Dossier incomplet'}});expect((await envoyer()).erreur).toBeTruthy();expect(m.download).not.toHaveBeenCalled();aucunEnvoi();});
 it('une annulation ne touche jamais une autre référence de contrat',async()=>{m.circuit.etat='en_cours';m.lire.mockResolvedValue({id:'req',external_id:'autre',status:'ongoing'});expect((await annulerSignatureBail('org','11111111-1111-4111-8111-111111111111','circuit')).erreur).toContain('correspond pas');expect(m.annuler).not.toHaveBeenCalled();});
});
// Décision du 24/10 : le garant du bail ne signe plus avec le numéro de sa fiche, qui sort donc de l'empreinte. Un bail
// préparé et signé avant ce changement (son garant sans numéro confirmé) reste activable avec l'ancien calcul ; un bail
// préparé après n'a que le nouveau.
describe('Activation d’un bail préparé avant la confirmation du mobile par le garant',()=>{
 const garant=(confirme:boolean)=>({personId:'g',qualite:'Garant',prenom:'G',nom:'G',email:'g@example.invalid',telephone:'+33611223344',...(confirme?{telephoneConfirmeLe:'2026-10-24T08:00:00Z'}:{})});
 beforeEach(()=>{
  Object.assign(m.circuit,{modele:'bail',etat:'termine',empreinte:'ancienne'});
  m.assembler.mockImplementation(async(_db:unknown,_org:string,_bail:string,options?:{telephoneGarantDuDossier?:boolean})=>({empreinte:options?.telephoneGarantDuDossier?'ancienne':'nouvelle',manquants:[]}));
 });
 it('l’ancien calcul (numéro de la fiche) vaut pour un garant qui n’a pas confirmé son numéro',async()=>{
  m.circuit.signataires=[garant(false)];
  expect((await activerBailApresSignature('org','11111111-1111-4111-8111-111111111111','circuit')).erreur).toBeUndefined();
  expect(m.rpc).toHaveBeenCalledWith('activer_bail_signature_electronique',{p_circuit:'circuit'});
 });
 it('un bail dont le garant a confirmé son numéro n’accepte que le nouveau calcul',async()=>{
  m.circuit.signataires=[garant(true)];
  expect((await activerBailApresSignature('org','11111111-1111-4111-8111-111111111111','circuit')).erreur).toContain('ont changé');
  expect(m.rpc.mock.calls.some(c=>c[0]==='activer_bail_signature_electronique')).toBe(false);
 });
});
