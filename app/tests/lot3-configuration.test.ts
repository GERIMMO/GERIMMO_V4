import {it,expect} from 'vitest';
const {verifierEnvironnement}=await import(new URL('../scripts/deploiement/garde-environnement.mjs',import.meta.url).href);
const base={GERIMMO_PREPRODUCTION_VALIDEE:'1',VERCEL_ENV:'preview',VERCEL_TARGET_ENV:'preproduction',NEXT_PUBLIC_SUPABASE_URL:'https://hlkbvmfybxwqathchsdz.supabase.co',VERCEL_URL:'gerimmo-v4-recette.vercel.app'};
it('autorise uniquement la préparation isolée sans transport externe',()=>expect(verifierEnvironnement(base)).toBe('https://gerimmo-v4-recette.vercel.app'));
it.each(['STRIPE_SECRET_KEY','AR24_TOKEN','ZOHO_SIGN_CLIENT_SECRET','RESEND_API_KEY','OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET'])('refuse une clé %s en préproduction non raccordée',key=>expect(()=>verifierEnvironnement({...base,[key]:'fictif'})).toThrow('suspendue'));
it('refuse un autre projet Supabase',()=>expect(()=>verifierEnvironnement({...base,NEXT_PUBLIC_SUPABASE_URL:'https://autre-fictif.supabase.co'})).toThrow('isolée'));
it('refuse une origine qui pourrait renvoyer hors recette',()=>expect(()=>verifierEnvironnement({...base,NEXT_PUBLIC_SITE_URL:'https://ailleurs.invalid'})).toThrow('adresse'));
it('refuse le drapeau recette sur une cible production',()=>expect(()=>verifierEnvironnement({...base,VERCEL_ENV:'production'})).toThrow('production'));
it('ne modifie pas la configuration d’une production existante hors recette',()=>expect(verifierEnvironnement({VERCEL_ENV:'production'})).toBeUndefined());
