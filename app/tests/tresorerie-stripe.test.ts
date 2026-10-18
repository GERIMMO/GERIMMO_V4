import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('stripe',()=>({default:class{balanceTransactions={list:mocks.list};}}));
import {lireTresorerieStripe} from '@/lib/tresorerie-stripe';
const periode={gte:1,lt:100};
describe('Lecture Stripe sans action financière',()=>{
 beforeEach(()=>{mocks.list.mockReset();vi.stubEnv('STRIPE_SECRET_KEY','sk_test_valeur-fictive');});
 afterEach(()=>vi.unstubAllEnvs());
 it('ne fabrique pas zéro sans connexion',async()=>{vi.stubEnv('STRIPE_SECRET_KEY','');expect(await lireTresorerieStripe(periode)).toMatchObject({lignes:null,complet:false});expect(mocks.list).not.toHaveBeenCalled();});
 it('lit toutes les pages et ne renvoie ni client ni données personnelles',async()=>{mocks.list.mockResolvedValueOnce({data:[{id:'txn_1',created:2,type:'charge',currency:'eur',amount:100,fee:1,net:99,status:'available',description:'À ne pas transmettre'}],has_more:true}).mockResolvedValueOnce({data:[{id:'txn_2'}],has_more:false});const r=await lireTresorerieStripe(periode);expect(r).toMatchObject({complet:true,test:true});expect(r.lignes).toHaveLength(2);expect(r.lignes?.[0]).not.toHaveProperty('description');expect(mocks.list).toHaveBeenLastCalledWith({created:periode,limit:100,starting_after:'txn_1'});});
 it('ne présente pas un total incomplet comme exact',async()=>{mocks.list.mockResolvedValue({data:[{id:'txn_1'}],has_more:true});expect(await lireTresorerieStripe(periode)).toMatchObject({complet:false});expect(mocks.list).toHaveBeenCalledTimes(100);});
 it('ne divulgue pas l’erreur du prestataire ni une clé',async()=>{mocks.list.mockRejectedValue(new Error('secret sk_test_valeur-fictive'));const r=await lireTresorerieStripe(periode);expect(r.lignes).toBeNull();expect(JSON.stringify(r)).not.toContain('sk_test_');});
});
