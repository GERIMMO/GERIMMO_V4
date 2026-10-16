import { describe,expect,it } from 'vitest';
import { transactionsInterdites } from '../scripts/verifier-transactions-migration.mjs';
describe('une migration ne peut pas valider une simulation',()=>{
 it.each(['begin;','COMMIT;','rollback;','end work;','start transaction;','prepare transaction \'x\';','select 1; commit;'])('refuse %s',sql=>{expect(transactionsInterdites(sql).length).toBeGreaterThan(0);});
 it('ignore les corps de fonctions, chaînes et commentaires sans perdre les commandes suivantes',()=>{
  expect(transactionsInterdites("-- commit;\nDO $abc$ begin perform 1; end $abc$; select 'commit;'; /* début /* imbriqué */ fin */")).toEqual([]);
  expect(transactionsInterdites("DO $$ begin null; end $$; /* note */ COMMIT;")).toEqual(['COMMIT']);
 });
 it('refuse de valider un texte SQL tronqué',()=>{expect(()=>transactionsInterdites('do $$ begin')).toThrow();});
 it.each(["SET standard_conforming_strings=off;","set local standard_conforming_strings to 'off';",'SET SESSION "standard_conforming_strings" = DEFAULT;','RESET standard_conforming_strings;','RESET ALL;'])('refuse de changer le mode des chaînes : %s',sql=>{
  expect(transactionsInterdites(sql).length).toBeGreaterThan(0);
 });
 it('ne confond pas une donnée ni un commentaire avec un changement de mode',()=>{
  expect(transactionsInterdites("select 'SET standard_conforming_strings=off;'; -- RESET standard_conforming_strings;\n/* SET standard_conforming_strings=on */ select 1;")).toEqual([]);
 });
 it('une barre oblique dans une chaîne SQL ordinaire ne masque pas COMMIT',()=>{
  // PostgreSQL standard_conforming_strings=on : cette chaîne contient une barre, pas une apostrophe.
  expect(transactionsInterdites(String.raw`select '\'; COMMIT; -- '
select 1;`)).toEqual(['COMMIT']);
 });
 it('un dollar présent dans un identifiant ne commence pas un corps cité',()=>{
  expect(transactionsInterdites('select 1 as nom$tag$; COMMIT; -- $tag$\nselect 1;')).toEqual(['COMMIT']);
 });
 it('les tags Unicode sont aussi des corps cités PostgreSQL',()=>{
  expect(transactionsInterdites("select $é$'$é$; COMMIT; -- '\nselect 1;")).toEqual(['COMMIT']);
 });
 it('les chaînes explicitement échappées gardent leur sens, sans faux COMMIT',()=>{
  expect(transactionsInterdites(String.raw`select E'\'; COMMIT; -- '; select 1;`)).toEqual([]);
  expect(transactionsInterdites(String.raw`select E'\''; COMMIT;`)).toEqual(['COMMIT']);
 });
});
