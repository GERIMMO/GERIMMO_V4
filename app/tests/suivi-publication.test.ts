import {describe,it,expect} from 'vitest';
import {recueillirPublication} from '@/lib/suivi-publication';
const revision='a'.repeat(40),fusion='b'.repeat(40),repo={full_name:'GERIMMO/GERIMMO_V4'};
function preuves(){return {pr:{number:42,head:{sha:revision,repo},base:{ref:'main',repo},merged:true,merged_at:'2026-10-18T05:00:00Z',merge_commit_sha:fusion},deploiements:{deployments:[{uid:'dpl_Test123',projectId:'prj_test',target:'production',meta:{githubCommitSha:fusion,githubCommitRef:'main'},created:100,state:'READY',readySubstate:'PROMOTED'}]}};}
function tester(p=preuves()){return recueillirPublication(revision,42,async()=>p.pr,async()=>p.deploiements,'prj_test');}
describe('Preuves de publication',()=>{
 it('relie la version autorisée à la fusion puis à la mise en service',async()=>expect(await tester()).toMatchObject({revision,fusion,deploiement:'dpl_Test123',proposition:42}));
 it('ne confond pas version prête et publiée',async()=>{const p=preuves();p.deploiements.deployments[0].readySubstate='STAGED';await expect(tester(p)).rejects.toThrow(/mise en service/);});
 it('refuse une proposition non fusionnée',async()=>{const p=preuves();p.pr.merged=false;await expect(tester(p)).rejects.toThrow(/intégrée/);});
 it('refuse un changement après l’accord',async()=>{const p=preuves();p.pr.head.sha='c'.repeat(40);await expect(tester(p)).rejects.toThrow(/autorisée/);});
 it.each(['projectId','target','sha','ref'])('refuse une preuve d’une autre origine : %s',async champ=>{const p=preuves(),d=p.deploiements.deployments[0];if(champ==='sha')d.meta.githubCommitSha='c'.repeat(40);else if(champ==='ref')d.meta.githubCommitRef='autre';else d[champ as 'projectId'|'target']='autre';await expect(tester(p)).rejects.toThrow(/mise en service/);});
 it('ne cache pas un dernier déploiement en échec',async()=>{const p=preuves();p.deploiements.deployments.push({...p.deploiements.deployments[0],created:101,state:'ERROR'});await expect(tester(p)).rejects.toThrow(/mise en service/);});
 it('refuse un dépôt tiers',async()=>{const p=preuves();p.pr.base.repo={full_name:'autre/depot'};await expect(tester(p)).rejects.toThrow(/autorisée/);});
});
