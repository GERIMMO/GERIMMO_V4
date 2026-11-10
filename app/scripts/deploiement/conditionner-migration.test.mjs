import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {commerciales,conditionner,verifierLot} from './conditionner-migration.mjs';
for(const m of commerciales)test(m.fichier,()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/'+m.fichier,import.meta.url),'utf8');
 const rendu=conditionner(sql,m.fichier);assert.ok(!/^begin;/i.test(rendu));assert.ok(!/\ncommit;\s*$/i.test(rendu));assert.throws(()=>conditionner(sql+'\n--modifie',m.fichier));
});
test('sept fichiers exacts et ordre strict',()=>{const n=commerciales.map(m=>m.fichier);assert.doesNotThrow(()=>verifierLot(n));assert.throws(()=>verifierLot(n.slice(1)));assert.throws(()=>verifierLot([...n].reverse()));});
test('aucun verrou pilote renommé ni enveloppe arbitraire',()=>{assert.throws(()=>conditionner('select * from securite_instance_pilote;','20261111_autre.sql'));assert.throws(()=>conditionner('begin;select 1;commit;','20261111_autre.sql'));assert.throws(()=>conditionner('select 1;','20261110053019_verrou_paiements_pilote.sql'));});

test("le verrou pilote est absent des migrations commerciales mais conservé intact pour les tests",()=>{assert.equal(existsSync(new URL("../../supabase/migrations/20261110053019_verrou_paiements_pilote.sql",import.meta.url)),false);assert.match(readFileSync(new URL("../../supabase/profils-locaux/20261110053019_verrou_paiements_pilote.sql",import.meta.url),"utf8"),/securite_instance_pilote/);});
