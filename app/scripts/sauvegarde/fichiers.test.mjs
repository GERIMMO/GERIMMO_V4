import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {sauvegarder,verifier,extraire,cheminSur,lireCle} from './fichiers.mjs';

const stockage = (nombre=205) => ({listBuckets:async()=>({data:[{id:'documents',public:false}]}),from:()=>({
  list:async(prefixe,{offset,limit})=>({data:prefixe===''?[{name:'dossier',id:null}]:Array.from({length:nombre},(_,i)=>({id:`id-${i}`,name:`fichier-${String(i).padStart(4,'0')}.pdf`,metadata:{size:9,mimetype:'application/pdf'},updated_at:'2026-09-25'})).slice(offset,offset+limit)}),
  download:async()=>({data:new Blob(['FICTIF123'])}),
})});
test('export chiffré paginé puis restauration byte pour byte, sans écrasement',async()=>{
  const racine=await fs.mkdtemp(path.join(os.tmpdir(),'gerimmo-backup-test-')),cle=randomBytes(32),archive=path.join(racine,'archive'),sortie=path.join(racine,'restaure');
  try {
    assert.deepEqual(await sauvegarder(stockage(),archive,cle,'http://localhost'),{fichiers:205,octets:1845});
    assert.equal((await verifier(archive,cle)).objets.length,205);
    assert.ok(!(await fs.readFile(path.join(archive,'00000000.gcm'))).includes(Buffer.from('FICTIF123')));
    await assert.rejects(verifier(archive,randomBytes(32)),/Clé incorrecte/);
    assert.equal((await extraire(archive,cle,sortie)).fichiers,205);
    assert.equal(await fs.readFile(path.join(sortie,'documents/dossier/fichier-0204.pdf'),'utf8'),'FICTIF123');
    await assert.rejects(extraire(archive,cle,sortie),/EEXIST/);
    const octets=await fs.readFile(path.join(archive,'00000000.gcm'));octets[40]^=1;await fs.writeFile(path.join(archive,'00000000.gcm'),octets);
    await assert.rejects(extraire(archive,cle,path.join(racine,'altere')),/altérée/);
    await assert.rejects(fs.stat(path.join(racine,'altere')),/ENOENT/);
  }finally{await fs.rm(racine,{recursive:true,force:true});}
});
test('refuse les chemins sortants, les mauvaises clés et les écritures pendant la copie',async()=>{
  for(const nom of ['../x','/absolu','a/../b','a\\b','a//b','a\u0000b'])assert.throws(()=>cheminSur(nom));
  assert.throws(()=>lireCle('courte'));assert.equal(lireCle('aa'.repeat(32)).length,32);
  const racine=await fs.mkdtemp(path.join(os.tmpdir(),'gerimmo-backup-test-'));
  try {
    const s=stockage(1);let appels=0;const liste=s.listBuckets;s.listBuckets=async()=>{appels++;return appels===1?liste():{data:[]};};
    await assert.rejects(sauvegarder(s,path.join(racine,'instable'),randomBytes(32),'http://localhost'),/stockage a changé/);
    await assert.rejects(fs.stat(path.join(racine,'instable/manifeste.gcm')),/ENOENT/);
  }finally{await fs.rm(racine,{recursive:true,force:true});}
});
