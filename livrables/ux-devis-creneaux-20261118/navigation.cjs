const fs=require('fs'),path=require('path');
const app=path.resolve(__dirname,'../../app');
if(!process.env.GERIMMO_SESSION_FICTIVE) throw new Error('Une session fictive locale est requise.');
const {chromium,expect}=require(app+'/node_modules/@playwright/test');
const routes={devis:'/artisan/devis/35c64080-537d-48c2-b6ed-37b6fec53402',creneaux:'/artisan/missions/e84ee8d9-8252-4054-ae65-501a7a3e7452/creneaux'};
(async()=>{const b=await chromium.launch();const rows=[],errors=[],blocked=[];try{
 for(const width of [390,1440])for(const [nom,url] of Object.entries(routes)){
  const c=await b.newContext({baseURL:'http://localhost:3100',storageState:process.env.GERIMMO_SESSION_FICTIVE,locale:'fr-FR',timezoneId:'Europe/Paris',viewport:{width,height:1000}});
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname)||r.request().method()!=='GET'){blocked.push({path:u.pathname,method:r.request().method()});return r.abort()}return r.continue()});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url,{waitUntil:'networkidle'});
  if(nom==='devis'){
   const totals=p.locator('[data-totaux-devis]');
   await p.getByLabel('Ligne 1 : prestation',{exact:true}).fill('Remplacement du joint');
   await p.getByLabel('Ligne 1 : prix unitaire HT',{exact:true}).fill('65');
   await expect(totals).toContainText(/Total HT : 65,00/);await expect(totals).toContainText('Total TTC : À compléter');
   await expect(totals).not.toContainText('Total TTC : 0,00');expect(JSON.parse(await p.locator('input[name=lignes_devis]').inputValue())[0].tva_bps).toBeNull();
   const prochain=p.getByRole('button',{name:'Suivant →',exact:true});
   expect(await prochain.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
   const couleur=await prochain.evaluate(e=>({fond:getComputedStyle(e).backgroundColor,encre:getComputedStyle(e).getPropertyValue('--encre').trim()}));
   expect(couleur.fond).toBe(await prochain.evaluate(e=>{const s=document.createElement('span');s.style.color='var(--encre)';e.append(s);const v=getComputedStyle(s).color;s.remove();return v}));
   await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.screenshot({path:path.join(__dirname,'apres-devis-sans-tva-'+width+'.png'),fullPage:true});
   await p.getByLabel('Ligne 1 : TVA',{exact:true}).selectOption('2000');await expect(totals).toContainText(/Total TTC : 78,00/);
   await p.getByLabel('Ligne 1 : quantité',{exact:true}).fill('2');await expect(totals).toContainText(/Total TTC : 156,00/);
   await p.getByRole('button',{name:'Ajouter une prestation ou fourniture',exact:true}).click();
   await p.getByLabel('Ligne 2 : prestation',{exact:true}).fill('Fourniture');await p.getByLabel('Ligne 2 : prix unitaire HT',{exact:true}).fill('12,34');await p.getByLabel('Ligne 2 : quantité',{exact:true}).fill('1,5');
   await expect(totals).toContainText(/Total HT : 148,51/);await expect(totals).toContainText('Total TTC : À compléter');
   await p.getByLabel('Ligne 2 : TVA',{exact:true}).selectOption('0');await expect(totals).toContainText(/Total TTC : 174,51/);
   await p.getByLabel('Ligne 2 : prix unitaire HT',{exact:true}).fill('incorrect');await expect(totals).toContainText('Total HT : À compléter');
   await p.getByLabel('Ligne 2 : prix unitaire HT',{exact:true}).fill('12,34');
   await p.locator('textarea[name=diagnostic]').fill('Joint usé ; remplacement proposé pour ce dossier fictif.');
   await prochain.click();await expect(p.locator('[data-panneau="1"]')).toBeVisible();await p.getByRole('button',{name:'Précédent',exact:true}).click();
   await expect(p.getByLabel('Ligne 2 : prix unitaire HT',{exact:true})).toHaveValue('12,34');
   await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.screenshot({path:path.join(__dirname,'apres-devis-tva-'+width+'.png'),fullPage:true});
   rows.push({ecran:nom,width,ht:14851,ttc:17451,tvaVideSansFauxZero:true,saisiesConservees:true,boutonBleuNuit:true});
  } else {
   const form=p.locator('form:has(input[name=creneaux])');const cards=form.locator('fieldset');const send=form.getByRole('button',{name:'Envoyer les créneaux',exact:true});
   await expect(cards).toHaveCount(3);await expect(form.locator('input[type=date]:visible')).toHaveCount(3);await expect(form.locator('input[type=time]:visible')).toHaveCount(0);await expect(send).toBeDisabled();await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.screenshot({path:path.join(__dirname,'apres-creneaux-vides-'+width+'.png'),fullPage:true});
   const min=await cards.nth(0).locator('input[type=date]').getAttribute('min');const dates=[0,1,2].map(i=>{const d=new Date(min+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
   for(let i=0;i<3;i++){await cards.nth(i).locator('input[type=date]').fill(dates[i]);await cards.nth(i).getByRole('button',{name:i===1?/Après-midi/:/^Matin/}).click()}
   await expect(send).toBeEnabled();const summary=form.getByRole('region',{name:'Récapitulatif des propositions'});await expect(summary.getByRole('listitem')).toHaveCount(3);
   await expect(summary).toContainText('09:00 – 11:00');await expect(summary).toContainText('14:00 – 16:00');
   const payload=()=>form.locator('input[name=creneaux]').inputValue().then(JSON.parse);
   let sent=await payload();expect(sent).toHaveLength(3);expect(sent[0].debut).toBe(new Date(dates[0]+'T09:00:00+01:00').toISOString());
   await cards.nth(0).locator('summary').click();await cards.nth(0).getByLabel('De',{exact:true}).fill('10:15');await cards.nth(0).getByLabel('À',{exact:true}).fill('12:30');await cards.nth(0).locator('summary').click();
   await expect(summary).toContainText('10:15 – 12:30');await expect(form.locator('input[type=time]:visible')).toHaveCount(0);
   await cards.nth(1).getByRole('button',{name:'Effacer ce créneau'}).click();await expect(send).toBeDisabled();await expect(cards.nth(1).locator('input[type=date]')).toHaveValue('');
   await cards.nth(1).locator('input[type=date]').fill(dates[2]);await cards.nth(1).getByRole('button',{name:/^Matin/}).click();await expect(summary).toContainText('Deux propositions sont identiques');await expect(send).toBeDisabled();
   await cards.nth(1).locator('input[type=date]').fill(dates[1]);await cards.nth(1).getByRole('button',{name:/Après-midi/}).click();await expect(send).toBeEnabled();
   await cards.nth(2).locator('summary').click();await cards.nth(2).getByLabel('À',{exact:true}).fill('08:00');await expect(send).toBeDisabled();await expect(cards.nth(2)).toContainText('L’heure de fin doit être après');await cards.nth(2).getByLabel('À',{exact:true}).fill('11:00');await cards.nth(2).locator('summary').click();
   await cards.nth(2).locator('input[type=date]').fill('2020-01-01');await expect(send).toBeDisabled();await cards.nth(2).locator('input[type=date]').fill(dates[2]);await expect(send).toBeEnabled();
   await form.getByRole('button',{name:'Ajouter un créneau',exact:true}).click();await expect(cards).toHaveCount(4);await cards.nth(3).getByRole('button',{name:'Retirer ce créneau'}).click();await expect(cards).toHaveCount(3);
   sent=await payload();expect(sent).toHaveLength(3);expect(sent[0].debut).toBe(new Date(dates[0]+'T10:15:00+01:00').toISOString());
   await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.screenshot({path:path.join(__dirname,'apres-creneaux-'+width+'.png'),fullPage:true});
   await p.locator('summary').filter({hasText:'Et si aucun créneau ne convient ?'}).click();await expect(p.getByText(/un chevauchement avec un rendez-vous déjà confirmé/)).toBeVisible();await expect(p.getByText(/Au sixième refus/)).toBeVisible();
   rows.push({ecran:nom,width,troisPropositions:true,modification:true,effacement:true,doublonsRefuses:true,passeRefuse:true,ordreHeuresControle:true,instantsISO:sent,aucunEnvoi:true});
  }
  expect(await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))).toBe(0);await c.close();console.log('OK',nom,width);
 }
 expect(errors).toEqual([]);fs.writeFileSync(path.join(__dirname,'navigation-resultats.json'),JSON.stringify({rows,errors,blocked},null,2));
}finally{fs.writeFileSync(path.join(__dirname,'navigation-partiel.json'),JSON.stringify({rows,errors,blocked},null,2));await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
