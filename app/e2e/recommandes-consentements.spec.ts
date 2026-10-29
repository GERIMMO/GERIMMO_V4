import { test,expect,type Page } from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {sansSyntheseAlertes,debordementHorizontal} from './aides';
const ORG='3c1d1e95-3570-400b-8012-44530be145b1';
async function rechargerApresFixture(page:Page){
 // Ces rechargements ne sont pas des gestes utilisateur : ils relisent les
 // fixtures SQL. Attendre la fin du préchargement Next avant de détruire le
 // document évite d'annuler ses requêtes RSC encore en vol dans WebKit.
 await page.waitForLoadState('networkidle');
 await page.reload();
}
async function connecter(page:Page,email:string,destination:string){
 // Les cookies de recette changent hors de l'interface. Ne pas retirer la
 // session pendant les préchargements du compte précédent dans WebKit.
 await page.waitForLoadState('networkidle');
 await page.context().clearCookies();await page.goto(`/connexion?suite=${encodeURIComponent(destination)}`);await page.locator('#email').fill(email);await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE??'Gerimmo-Demo-2026');
 // La connexion remet ce marqueur à zéro à son montage. Le rétablir après
 // la saisie évite un rechargement du tableau de bord encore en préchargement.
 await page.evaluate(()=>sessionStorage.setItem('gerimmo-synthese-alertes-vue','1'));
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(url=>url.pathname===destination);await expect(page.getByRole('heading').first()).toBeVisible();
}
for(const largeur of [390,1440]) test.describe(`${largeur}px`,()=>{
 test.use({viewport:{width:largeur,height:950},isMobile:largeur===390,hasTouch:largeur===390,deviceScaleFactor:largeur===390?2:1});
 test(`consentements et recommandé à ${largeur}px : retrait, configuration absente et suivi durable`,async({page},info)=>{
 test.setTimeout(180000);
 const url=process.env.SUPALOCAL_DB;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API locale fictive requise');
 const db=new Client({connectionString:url});await db.connect();
 const [bien,lot,personne,bail,appel,courrier]=Array.from({length:6},()=>randomUUID());const nom=`TEST AR24 ${largeur} ${lot.slice(0,6)}`;
 let compte:string|undefined;let adhesionCreee=false;const erreurs:string[]=[];page.on('pageerror',e=>erreurs.push(`${page.url()} : ${e.message}`));
 try{
  compte=(await db.query("select id from auth.users where email='locataire.alpha@example.com'")).rows[0].id;
  // Le compte de démo garde son espace Alpha ; seule une adhésion temporaire distincte est ajoutée ici.
  expect((await db.query('select 1 from memberships where account_id=$1 and organization_id=$2',[compte,ORG])).rowCount).toBe(0);
  await db.query('begin');
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[compte,ORG]);
  await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue TEST AR24','75001','Paris')",[bien,ORG,nom]);
  await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')",[lot,ORG,bien,nom]);
  await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email) values($1,$2,$3,'Test AR24','Camille','locataire.alpha@example.com')",[personne,ORG,compte]);
  await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-40,750,50,5)",[bail,ORG,lot,personne]);
  await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,$3,date_trunc('month',public.aujourdhui_paris()),public.aujourdhui_paris()-1,750,50,800)",[appel,ORG,bail]);await db.query('commit');adhesionCreee=true;
  await page.setViewportSize({width:largeur,height:950});await sansSyntheseAlertes(page);await connecter(page,'locataire.alpha@example.com',`/locataire/${ORG}/documents`);
  await page.getByText('Réception de mes documents',{exact:true}).click();
  const quittances=page.getByRole('form',{name:'Quittances et reçus de paiement'}),recommandes=page.getByRole('form',{name:'Recommandés électroniques'});
  await quittances.getByRole('button',{name:'J’accepte la réception électronique'}).click();await expect(quittances.getByText('Accord électronique enregistré',{exact:true})).toBeVisible();
  await recommandes.getByRole('button',{name:'J’accepte la réception électronique'}).click();await expect(recommandes.getByText('Accord électronique enregistré',{exact:true})).toBeVisible();
  await rechargerApresFixture(page);await page.getByText('Réception de mes documents',{exact:true}).click();await expect(quittances.getByRole('button',{name:'Retirer mon accord'})).toBeVisible();
  await quittances.getByRole('button',{name:'Retirer mon accord'}).click();await expect(quittances.getByText('Aucun accord électronique enregistré',{exact:true})).toBeVisible();
  expect((await db.query('select quittances_electroniques,recommandes_electroniques from consentements_documents_locataire where person_id=$1',[personne])).rows[0]).toEqual({quittances_electroniques:false,recommandes_electroniques:true});
  await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[compte,ORG]);await rechargerApresFixture(page);await page.getByText('Réception de mes documents',{exact:true}).click();
  await recommandes.getByRole('button',{name:'Retirer mon accord'}).click();await expect(recommandes.getByText('Aucun accord électronique enregistré',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'J’accepte la réception électronique'})).toHaveCount(0);
  expect((await db.query('select recommandes_electroniques from consentements_documents_locataire where person_id=$1',[personne])).rows[0].recommandes_electroniques).toBe(false);
  expect(await debordementHorizontal(page)).toBe(0);await page.screenshot({path:info.outputPath(`consentements-retires-${largeur}.png`),fullPage:true});
  await db.query("update memberships set status='active' where account_id=$1 and organization_id=$2",[compte,ORG]);
  await connecter(page,'proprietaire@example.com',`/espace/${ORG}`);
  await page.getByRole('region',{name:'Votre patrimoine en bref'}).getByRole('button',{name:/^(?:\d+ actions? prioritaires?|\d+ loyers? à confirmer|À vérifier) /}).click();
  const bloc=page.getByRole('region',{name:'Avez-vous reçu vos loyers ?'});const ligne=bloc.locator('li').filter({has:page.getByRole('link',{name:nom,exact:true})});
  await ligne.getByText('Gérer la relance et le recommandé',{exact:true}).click();await ligne.getByText('Préparer le recommandé',{exact:true}).click();await ligne.getByRole('button',{name:'Préparer l’envoi AR24',exact:true}).click();
  await expect(ligne.getByRole('alert')).toContainText('L’envoi AR24 n’est pas encore activé');
  await expect(ligne.getByRole('button',{name:/Confirmer l’envoi/})).toHaveCount(0);
  expect((await db.query('select 1 from recommandes_ar24 where bail_id=$1',[bail])).rowCount).toBe(0);
  expect(await debordementHorizontal(page)).toBe(0);expect((await new AxeBuilder({page}).include('[aria-labelledby="reception-loyers-titre"]').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath(`ar24-non-configure-${largeur}.png`),fullPage:true});
  // Une réponse fournisseur perdue est une fixture explicite, jamais un envoi simulé comme réussi.
  await db.query('begin');
  const proprietaire=(await db.query("select id from auth.users where email='proprietaire@example.com'")).rows[0].id;
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:proprietaire,role:'authenticated',aal:'aal2'})]);
  await db.query("insert into recommandes_ar24(id,organization_id,bail_id,personne_id,environnement,expediteur_id,tarif_ttc_centimes,destinataire,contenu,empreinte,dette,delai,statut) values($1,$2,$3,$4,'sandbox',42,100,$5,'<p>Courrier de recette uniquement</p>',$6,public.dette_recommande_ar24($3),15,'a_verifier')",[courrier,ORG,bail,personne,{email:'locataire.alpha@example.com',prenom:'Camille',nom:'Test AR24'},'a'.repeat(64)]);
  await db.query('commit');
  await page.goto(`/espace/${ORG}/baux/${bail}#loyers`);
  const historique=page.getByRole('region',{name:'Recommandés électroniques'});await expect(historique).toBeVisible();await historique.locator('summary').click();await historique.getByRole('button',{name:'Voir le courrier et son suivi'}).click();
  const fiche=historique.getByRole('region',{name:'Recommandé électronique'});await expect(fiche.getByText('Envoi à vérifier',{exact:true})).toBeVisible();await expect(fiche.getByText('800,00 €',{exact:true})).toBeVisible();await expect(fiche.getByText(new RegExp(courrier))).toBeVisible();await expect(fiche.getByRole('button',{name:/Confirmer l’envoi/})).toHaveCount(0);
  await fiche.getByText('Relire le courrier',{exact:true}).click();await expect(fiche.frameLocator('iframe').getByText('Courrier de recette uniquement')).toBeVisible();
  await fiche.getByRole('button',{name:'Actualiser le suivi'}).click();await expect(fiche.getByRole('alert')).toContainText('connexion AR24');
  expect((await db.query('select statut,ar24_id from recommandes_ar24 where id=$1',[courrier])).rows[0]).toEqual({statut:'a_verifier',ar24_id:null});
  expect(await debordementHorizontal(page)).toBe(0);await fiche.screenshot({path:info.outputPath(`ar24-suivi-${largeur}.png`)});expect(erreurs).toEqual([]);
  // L'attestation ci-dessous est une donnée fictive de recette, jamais une réponse fournisseur réelle.
  await db.query("update recommandes_ar24 set statut='echec',ar24_id=$2 where id=$1",[courrier,largeur]);
  await rechargerApresFixture(page);await historique.locator('summary').click();await historique.getByRole('button',{name:'Voir le courrier et son suivi'}).click();
  // Une absence de bouton ne prouve pas que la fiche a fini de charger.
  // Attendre l'échec lu du serveur avant de contrôler le droit de réessayer.
  await expect(fiche.getByText('AR24 signale un échec. Faites vérifier son caractère définitif avant toute nouvelle lettre, afin d’éviter un double envoi.',{exact:true})).toBeVisible();
  await expect(fiche.getByRole('button',{name:'Préparer une nouvelle lettre'})).toHaveCount(0);
  await db.query("select attester_echec_definitif_ar24($1,$2,'Attestation fictive de recette locale')",[ORG,courrier]);
  await rechargerApresFixture(page);await historique.locator('summary').click();await historique.getByRole('button',{name:'Voir le courrier et son suivi'}).click();
  await fiche.getByRole('button',{name:'Préparer une nouvelle lettre'}).click();await historique.getByRole('button',{name:'Préparer la nouvelle lettre'}).click();
  await expect(historique.getByRole('alert')).toContainText('L’envoi AR24 n’est pas encore activé');
  expect((await db.query('select id from recommandes_ar24 where bail_id=$1',[bail])).rowCount).toBe(1);expect(erreurs).toEqual([]);
 } finally {
  await db.query('rollback');
  try{
   await db.query('begin');await db.query('delete from recommandes_ar24 where bail_id=$1',[bail]);await db.query('delete from consentements_documents_locataire where person_id=$1',[personne]);await db.query('delete from appels_loyer where bail_id=$1',[bail]);await db.query('delete from automation_events where organization_id=$1 and dossier_id=$2',[ORG,bail]);await db.query('delete from baux where id=$1',[bail]);await db.query('delete from lots where id=$1',[lot]);await db.query('delete from biens where id=$1',[bien]);await db.query('delete from persons where id=$1',[personne]);
   if(compte&&adhesionCreee)await db.query("delete from memberships where account_id=$1 and organization_id=$2 and role='locataire'",[compte,ORG]);await db.query("delete from audit_log where organization_id=$1 and (details->>'bail_id'=$2 or details->>'lot_id'=$3 or details->>'bien_id'=$4 or details->>'person_id'=$5 or details->>'courrier_id'=$6)",[ORG,bail,lot,bien,personne,courrier]);await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
 }
});

});
