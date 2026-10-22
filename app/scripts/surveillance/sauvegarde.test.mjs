import { test } from "node:test";
import assert from "node:assert/strict";
import { analyserSauvegardes, confirmerCopieDistante, verifierSauvegarde } from "./sauvegarde.mjs";
const now=Date.parse("2026-10-22T10:00:00Z");
const run=(age,conclusion="success")=>({id:1,run_attempt:2,status:"completed",conclusion,updated_at:new Date(now-age*3600000).toISOString()});
const travail=(age=1)=>({name:"sauvegarder",status:"completed",conclusion:"success",steps:[{name:"Vérifier la copie distante",status:"completed",conclusion:"success",completed_at:new Date(now-age*3600000).toISOString()}]});
test("une copie récente confirme le seuil réel, indépendamment de l'heure planifiée",()=>{
  assert.equal(analyserSauvegardes([run(25.9)],now).ok,true);
  assert.equal(analyserSauvegardes([run(26.1)],now).motif,"copie_trop_ancienne");
});
test("un échec récent ne se cache pas derrière la réussite précédente",()=>{
  assert.equal(analyserSauvegardes([run(1,"failure"),run(2)],now).ok,false);
  assert.equal(analyserSauvegardes([run(1),run(2,"failure")],now).ok,true);
});
test("absence, horodatage futur et passage en cours ne donnent pas de fausse réussite",()=>{
  assert.equal(analyserSauvegardes([],now).ok,false);
  assert.equal(analyserSauvegardes([run(-1)],now).ok,false);
  assert.equal(analyserSauvegardes([{...run(0),status:"in_progress",conclusion:null}],now).ok,false);
});
test("pas de secret ni d'erreur brute dans le bilan",async()=>{
  assert.equal((await verifierSauvegarde()).ok,false);
  const r=await verifierSauvegarde({jeton:"prive",requete:async()=>{throw Error("secret prive");}});
  assert.equal(JSON.stringify(r).includes("secret"),false);
});
test("API indisponible ou réponse mal formée : contrôle indisponible",async()=>{
  assert.equal((await verifierSauvegarde({jeton:"prive",requete:async()=>new Response("",{status:403})})).ok,false);
  assert.equal((await verifierSauvegarde({jeton:"prive",requete:async()=>Response.json({})})).motif,"historique_incomplet");
});
test("une exécution verte sans relecture distante ne confirme aucune copie",()=>{
  for(const jobs of [undefined,[],[{...travail(),conclusion:"skipped"}],[{...travail(),steps:[]}],[{...travail(),steps:[{...travail().steps[0],conclusion:"skipped"}]}]]) {
    assert.equal(confirmerCopieDistante(jobs,now).ok,false);
  }
  assert.equal(confirmerCopieDistante([travail(27)],now).motif,"copie_trop_ancienne");
  assert.equal(confirmerCopieDistante([travail(-1)],now).motif,"horodatage_incoherent");
  assert.equal(confirmerCopieDistante([travail()],now).ok,true);
});
test("la preuve appartient à la même tentative et son heure détermine la fraîcheur",async()=>{
  const urls=[];
  const r=await verifierSauvegarde({jeton:"prive",maintenant:now,requete:async(url,options)=>{
    urls.push(url);assert.equal(options.redirect,"error");
    return Response.json(urls.length===1?{workflow_runs:[run(0.5)]}:{jobs:[travail(2)]});
  }});
  assert.match(urls[1],/\/runs\/1\/attempts\/2\/jobs\?per_page=100$/);
  assert.equal(r.ok,true);assert.equal(r.age_heures,2);
});
test("une preuve inaccessible ne laisse pas le bilan au vert",async()=>{
  let appels=0;
  const r=await verifierSauvegarde({jeton:"prive",maintenant:now,requete:async()=>++appels===1?Response.json({workflow_runs:[run(1)]}):new Response("",{status:403})});
  assert.equal(r.ok,false);assert.equal(r.motif,"preuve_indisponible");
});
