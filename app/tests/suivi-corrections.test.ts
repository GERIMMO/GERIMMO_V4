import {describe,it,expect} from 'vitest';
import {recueillirCorrection,lienDemonstration} from '../src/lib/suivi-corrections';
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',revision='b'.repeat(40),branche=`gerimmo/proposition-${id}-123`,repo={full_name:'GERIMMO/GERIMMO_V4'};
function preuves(){return {
 branches:[{ref:`refs/heads/${branche}`,object:{sha:revision}}],
 run:{id:123,path:'.github/workflows/atelier-code.yml',head_branch:'main',event:'workflow_dispatch',display_title:`Amélioration ${id}`,repository:repo,status:'completed',conclusion:'success'},
 prs:[{number:42,state:'open',head:{sha:revision,ref:branche,repo},base:{ref:'main',repo}}],
 ci:{workflow_runs:[{id:456,head_sha:revision,path:'.github/workflows/ci.yml',event:'pull_request',head_branch:branche,repository:repo,head_repository:repo,pull_requests:[{number:42}],status:'completed',conclusion:'success'}]},
 vercel:{deployments:[{projectId:'prj_test',meta:{githubCommitSha:revision,githubCommitRef:branche},target:'preview',state:'READY',url:'gerimmo-test.vercel.app',created:100}]}
};}
function tester(p=preuves()){return recueillirCorrection(id,async path=>path.startsWith('git/')?p.branches:path.startsWith('actions/runs/')?p.run:path.startsWith('pulls?')?p.prs:p.ci,async()=>p.vercel,'prj_test');}
describe('Suivi vérifiable des corrections',()=>{
 it('ne demande un accord que pour les contrôles et la démonstration de la même version',async()=>{expect(await tester()).toMatchObject({statut:'autorisation',revision,rapport:{resultat:'reussi',tests:456,demonstration:'https://gerimmo-test.vercel.app'}});});
 it('ne masque pas un contrôle récent en échec derrière un ancien succès',async()=>{const p=preuves();p.ci.workflow_runs.push({...p.ci.workflow_runs[0],id:457,conclusion:'failure'});expect((await tester(p)).rapport.resultat).toBe('echec');});
 it('ne réutilise pas une ancienne démonstration après un nouvel échec',async()=>{const p=preuves();p.vercel.deployments.push({...p.vercel.deployments[0],created:101,state:'ERROR'});expect((await tester(p)).statut).toBe('en_test');});
 it('refuse un atelier non terminé ou une origine étrangère',async()=>{const p=preuves();p.run.repository={full_name:'autre/projet'};await expect(tester(p)).rejects.toThrow(/origine/);});
 it('refuse une préparation liée à une autre demande',async()=>{const p=preuves();p.run.display_title='Amélioration autre';await expect(tester(p)).rejects.toThrow(/origine/);});
 it('refuse une proposition issue d’un dépôt tiers',async()=>{const p=preuves();p.prs[0].head.repo={full_name:'autre/projet'};await expect(tester(p)).rejects.toThrow(/correspond/);});
 it('refuse une branche ambiguë et une proposition fermée',async()=>{const p=preuves();p.branches.push({...p.branches[0]});await expect(tester(p)).rejects.toThrow(/Plusieurs/);p.branches.pop();p.prs[0].state='closed';await expect(tester(p)).rejects.toThrow(/fermée/);});
 it.each(['revision','projet','branche'])('écarte une démonstration d’un autre %s',async champ=>{const p=preuves();const d=p.vercel.deployments[0];if(champ==='revision')d.meta.githubCommitSha='a'.repeat(40);if(champ==='projet')d.projectId='autre';if(champ==='branche')d.meta.githubCommitRef='autre';expect((await tester(p)).rapport.demonstration).toBeNull();});
 it('écarte les contrôles d’une autre proposition',async()=>{const p=preuves();p.ci.workflow_runs[0].pull_requests=[{number:43}];expect((await tester(p)).rapport.resultat).toBe('en_cours');});
 it.each(['http://test.vercel.app','https://vercel.app.evil.com','https://example.com','https://a:b@test.vercel.app','https://test.vercel.app/?token=secret','javascript:alert(1)'])('refuse le lien non sûr %s',u=>expect(lienDemonstration(u)).toBeNull());
});
