import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/lib/supabase/client',()=>({createClient:vi.fn()}));
describe('connexion pendant le chargement',()=>{
 it('empêche un envoi natif avant que le formulaire soit actif',async()=>{
 const {FormulaireConnexion}=await import('../src/app/connexion/formulaire-connexion');
 const html=renderToStaticMarkup(createElement(FormulaireConnexion));
 expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Chargement…<\/button>/);
 expect(html).toContain('La page finit de se charger.');
 expect(html).toMatch(/<input[^>]*id="email"[^>]*disabled=""/);
 expect(html).toMatch(/<input[^>]*id="mot-de-passe"[^>]*disabled=""/);
 expect(html).toContain('autoComplete="current-password"');
 });
});
