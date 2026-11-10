import {it,expect} from 'vitest';
import {bloquerPendantTransition} from '../src/lib/transition-livraison';
const maintenance={GERIMMO_TRANSITION_LOTS:'maintenance'};
it.each(['/api/stripe/webhook','/api/zoho-sign/webhook','/api/resend/suivi','/api/sante','/espace/fictif/abonnement'])('la transition préserve le chemin financier/retour %s',p=>expect(bloquerPendantTransition(p,'POST',null,maintenance)).toBe(false));
it.each(['/api/cron/factures','/api/cron/orchestrateur','/espace/fictif/loyers','/espace/fictif/incidents'])('ancien ou nouveau serveur suspend les traitements %s',p=>expect(bloquerPendantTransition(p,'POST',null,maintenance)).toBe(true));
it('seule la mission abonnements continue et les écrans restent lisibles',()=>{expect(bloquerPendantTransition('/api/cron/equipes','GET','abonnements',maintenance)).toBe(false);expect(bloquerPendantTransition('/api/cron/equipes','GET','quittances',maintenance)).toBe(true);expect(bloquerPendantTransition('/espace/fictif','GET',null,maintenance)).toBe(false);expect(bloquerPendantTransition('/espace/fictif','POST',null,{})).toBe(false);});
