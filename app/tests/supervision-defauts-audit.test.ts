import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lirePage, numeroPage, rechercheIlike } from '@/lib/pagination-supervision';
import { etatPersonnalisation } from '@/lib/etat-personnalisation';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), user: vi.fn(), mail: vi.fn(), resultats: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mock.from, rpc: mock.rpc, auth: { getUser: mock.user } }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('404'); }, redirect: () => { throw Error('redirection'); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/lien-mot-de-passe', () => ({ envoyerLienMotDePasse: mock.mail }));
vi.mock('@/components/geste-controle', () => ({ GesteControle: ({ titre, confirmation }: { titre: string; confirmation: string }) => createElement('div', null, titre, confirmation) }));
vi.mock('@/app/admin/publications/[id]/editeur-publication', () => ({ EditeurPublication: () => createElement('form', null, 'Éditeur de test') }));
vi.mock('@/app/admin/clients/artisans/[artisanId]/bouton-entrer', () => ({ BoutonEntrerSession: () => null }));
vi.mock('@/app/admin/artisans/retour-decisions', () => ({ RetourDecisionsArtisan: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/app/admin/artisans/decision-artisan', () => ({ DecisionArtisan: () => null }));
vi.mock('@/app/admin/relais/alerte-email-relais', () => ({ AlerteEmailRelais: () => null }));
vi.mock('@/app/actions/consignes-vacances', () => ({ enregistrerVacances: vi.fn(), commanderRelais: vi.fn() }));
vi.mock('@/lib/marketing-meta', () => ({ depenseFacebookDuMois: async () => ({ cents: null }), santeFacebook: async () => ({ configure: false }), campagnesFacebook: async () => ({ configure: false, campagnes: [] }) }));
vi.mock('@/app/admin/publications/bouton-chercher-sujets', () => ({ BoutonChercherSujets: () => null }));
vi.mock('@/app/admin/marketing/actualisation-auto', () => ({ ActualisationAuto: () => null }));
vi.mock('@/app/admin/marketing/formulaire-campagne', () => ({ FormulaireCampagne: () => null }));
vi.mock('@/app/admin/marketing/reglages-automatiques', () => ({ ReglagesAutomatiques: () => null }));
vi.mock('@/app/admin/marketing/veto-post', () => ({ VetoPost: () => null }));

import Compte from '@/app/admin/comptes/[accountId]/page';
import Organisation from '@/app/admin/organisations/[orgId]/page';
import Publication from '@/app/admin/publications/[id]/page';
import Artisan from '@/app/admin/clients/artisans/[artisanId]/page';
import { Vacances } from '@/app/admin/relais/vacances';
import Articles from '@/app/admin/publications/page';
import { OrienterDemande } from '@/app/admin/devis/orienter-demande';
import Marketing from '@/app/admin/marketing/page';
import { ouvrirOrganisation } from '@/app/actions/organisations-admin';

const id = '11111111-1111-4111-8111-111111111111';
const ok = <T,>(data: T, count: number | null = null) => ({ data, error: null, count });
const panne = { data: null, error: { message: 'panne simulée' }, count: null };
function requete(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select','contains','eq','neq','is','in','or','order','limit','range','single','maybeSingle']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mock.resultats[table] ?? ok([])).then(resolve);
  return q;
}
const params = (cle: string) => ({ params: Promise.resolve({ [cle]: id }), searchParams: Promise.resolve({}) }) as never;
const html = renderToStaticMarkup;
beforeEach(() => {
  vi.clearAllMocks(); mock.resultats = {};
  mock.from.mockImplementation(requete);
  mock.rpc.mockImplementation(async (nom: string) => nom === 'is_super_admin' ? ok(true) : mock.resultats[nom] ?? ok([]));
  mock.user.mockResolvedValue({ data: { user: { id: 'moi' } }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('SA-07 : pages et totaux exhaustifs', () => {
  it('retrouve 1 051 fiches, y compris après le plafond implicite de 1 000', async () => {
    const fiches = Array.from({ length: 1051 }, (_, id) => ({ id }));
    const vues = [];
    for (let n = 1; n <= 43; n++) {
      const page = await lirePage(async (a,b) => ok(fiches.slice(a,b+1), fiches.length), n);
      expect(page.count).toBe(1051); vues.push(...page.data!);
    }
    expect(vues).toEqual(fiches);
  });
  it('revient à la dernière page si un filtre ou une suppression réduit le total', async () => {
    const lire = vi.fn(async (a: number,b: number) => ok(Array.from({ length: 26 }, (_,id) => id).slice(a,b+1), 26));
    expect(await lirePage(lire, 9)).toMatchObject({ page: 2, count: 26, data: [25] });
    expect(lire).toHaveBeenLastCalledWith(25,49);
  });
  it('revient au début si PostgREST refuse un offset hors limites', async () => {
    const lire = vi.fn().mockResolvedValueOnce({ data: null, count: null, error: { code: 'PGRST103' } }).mockResolvedValueOnce(ok([1],1));
    expect(await lirePage(lire,42)).toMatchObject({ page: 1, data: [1], count: 1 });
  });
  it('ne transforme pas une erreur de lecture en page vide', async () => {
    const lire = vi.fn(async () => panne);
    expect((await lirePage(lire,2)).error).toBe(panne.error); expect(lire).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, '-3', '1abc', ['2'], 'Infinity'])('normalise un numéro de page invalide %s', valeur => expect(numeroPage(valeur)).toBe(1));
  it('cite les recherches contenant virgules, guillemets et jokers sans ajouter de filtre', () => {
    expect(rechercheIlike('a,b)')).toBe('"%a,b)%"');
    expect(rechercheIlike('100%_')).toBe('"%100\\\\%\\\\_%"');
    expect(rechercheIlike('a"b')).toBe('"%a\\"b%"');
  });
});

describe('SA-04 : vérification de toutes les connexions configurées', () => {
  for (const site of [null, false, true]) for (const email of [null, false, true]) {
    it(`site=${site}, email=${email}`, () => {
      const etat = etatPersonnalisation({ domaine_personnalise: site === null ? null : 'exemple.fr', domaine_personnalise_verifie_le: site ? '2026-10-18' : null, email_expediteur: email === null ? null : 'contact@exemple.fr', email_expediteur_verifie_le: email ? '2026-10-18' : null });
      const attendu = site === null && email === null ? 'Aucune personnalisation' : site !== false && email !== false ? 'Vérifiée' : site === true || email === true ? 'Partiellement vérifiée' : 'À vérifier';
      expect(etat.libelle).toBe(attendu);
    });
  }
  it('ignore un ancien horodatage sans connexion configurée', () => expect(etatPersonnalisation({ domaine_personnalise: null, domaine_personnalise_verifie_le: 'ancien', email_expediteur: 'a@b.fr', email_expediteur_verifie_le: null }).libelle).toBe('À vérifier'));
});

describe('SA-03 : erreurs affichées au lieu de faux états vides', () => {
  it.each(['compte','organisation','article'])('%s : une panne ne devient pas une fiche introuvable', async nature => {
    mock.resultats[nature === 'compte' ? 'dossier_compte_supervision' : nature === 'organisation' ? 'organizations' : 'publications'] = panne;
    const rendu = html(await (nature === 'compte' ? Compte(params('accountId')) : nature === 'organisation' ? Organisation(params('orgId')) : Publication(params('id'))));
    expect(rendu).toContain('lecture indisponible'); expect(rendu).toContain('Réessayer'); expect(rendu).not.toContain('Éditeur de test');
  });
  it('conserve une vraie 404 pour un article réellement absent', async () => { mock.resultats.publications = ok(null); await expect(Publication(params('id'))).rejects.toThrow('404'); });
  it('une panne des rôles ou journaux ne dit ni aucun accès ni aucun événement', async () => {
    mock.resultats.dossier_compte_supervision = ok([{ email: 'fictif@example.test', est_super_admin: false, facteurs_mfa: 0 }]);
    mock.resultats.memberships = panne; mock.resultats.persons = panne; mock.resultats.audit_log = panne; mock.resultats.tech_log = panne;
    const rendu = html(await Compte(params('accountId')));
    expect(rendu).toContain('rôles indisponibles'); expect(rendu).not.toContain('Aucun rôle'); expect(rendu).toContain('Historique des contrôles'); expect(rendu).not.toContain('Aucune action enregistrée'); expect(rendu).not.toContain('Aucun événement technique'); expect(rendu).toContain('Journal technique : lecture indisponible');
  });
  it('ne propose pas de renvoyer une invitation quand les responsables sont illisibles', async () => {
    mock.resultats.organizations = ok({ id, name: 'Organisation fictive', status: 'active', type: 'agence' });
    mock.resultats.memberships = panne; mock.resultats.parrainages = panne; mock.resultats.supervision_abonnement = panne;
    const rendu = html(await Organisation(params('orgId')));
    expect(rendu).not.toContain('Aucun responsable'); expect(rendu).not.toContain('Aucun parrain'); expect(rendu).toContain('Abonnement et facturation : lecture indisponible');
    expect(rendu).toContain('Accès à l’espace client'); expect(rendu).toContain('ne résilient pas l’abonnement Stripe'); expect(rendu).not.toContain('Contrôle de l’abonnement');
  });
});

describe('SA-02 : un relais distinct du superviseur absent', () => {
  it('ne propose pas son propre compte et bloque la programmation sans autre superviseur', async () => {
    mock.resultats.accounts = ok([{ id: 'moi', email: 'superviseur-fictif@example.test' }]);
    mock.resultats.memberships = ok([{ account_id: 'moi' }]);
    const rendu = html(await Vacances());
    expect(rendu).not.toContain('<option value="moi"'); expect(rendu).toContain('Aucun autre superviseur habilité'); expect(rendu).toMatch(/<button[^>]+disabled[^>]*>Continuer →/);
  });
  it('propose un autre superviseur actif', async () => {
    mock.resultats.accounts = ok([{ id: 'moi', email: 'moi@example.test' }, { id: 'relais', email: 'relais@example.test' }, { id: 'non-habilite', email: 'hors@example.test' }]);
    mock.resultats.memberships = ok([{ account_id: 'moi' }, { account_id: 'relais' }]);
    const rendu = html(await Vacances());
    expect(rendu).toContain('<option value="relais"'); expect(rendu).not.toContain('<option value="moi"'); expect(rendu).not.toContain('<option value="non-habilite"'); expect(rendu).not.toContain('Aucun autre superviseur habilité');
  });
});

describe('SA-05 : assurances au jour de Paris', () => {
  it.each(['2026-10-17T22:30:00Z', '2026-10-24T22:30:00Z', '2026-10-25T23:30:00Z'])('ne prolonge pas une assurance expirée la veille à %s', async instant => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(instant));
    mock.resultats.artisans = ok({ id, raison_sociale: 'Artisan fictif', statut_plateforme: 'valide', siret_etat: 'verifie' });
    mock.resultats.artisan_pieces = ok([{ id: 'p1', type: 'decennale', expire_le: instant.slice(0,10) }, { id: 'p2', type: 'rc_pro', expire_le: null }]);
    const rendu = html(await Artisan(params('artisanId')));
    expect(rendu).toContain('Anomalie : validé sans ses deux assurances'); expect(rendu).toContain('décennale en cours');
  });
});

describe('SA-06 : ouverture seulement après qualification commerciale', () => {
  const formulaire = () => { const f = new FormData(); f.set('nom','Organisation fictive'); f.set('email','fictif@example.test'); f.set('demande_id', id); return f; };
  it('refuse une ouverture liée à un contact sans confirmation explicite, avant toute création ou invitation', async () => {
    expect((await ouvrirOrganisation({},formulaire())).erreur).toContain('Confirmez'); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.mail).not.toHaveBeenCalled();
  });
  it.each([panne, ok(null), ok({ id, traitee_le: '2026-10-18' })])('ne crée rien si la demande ne peut être confirmée', async resultat => {
    mock.resultats.demandes_devis = resultat; const f=formulaire(); f.set('demande_commerciale_confirmee','on');
    expect((await ouvrirOrganisation({},f)).erreur).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.mail).not.toHaveBeenCalled();
  });
});

describe('SA-08 : aucune promesse automatique sans configuration', () => {
  it.each([false,true])('préparation active=%s sans service IA', async actif => {
    vi.stubEnv('OPENAI_API_KEY',''); vi.stubEnv('OPEN_AI_KEY','');
    mock.resultats.marketing_reglages = ok({ actif, jours_semaine: [2,5], heure_paris: 9, heure_preparation_paris: 17, budget_mensuel_cents: 0, veille_mots_inclus: [], veille_mots_exclus: [] });
    const rendu=html(await Marketing());
    expect(rendu).toContain(actif ? 'Connexion IA à terminer' : 'Préparation en pause'); expect(rendu).not.toContain('La préparation est prévue la veille');
  });
});


describe('Articles et demandes de contact : actions et pages accessibles', () => {
  it('montre les articles programmés et reportés, auparavant absents de la liste', async () => {
    mock.resultats.publications = ok([{ id: 'p1', titre: 'Article programmé', statut: 'programmee' }, { id: 'p2', titre: 'Article reporté', statut: 'reportee' }], 2);
    const rendu=html(await Articles({searchParams:Promise.resolve({})}));
    expect(rendu).toContain('Article programmé'); expect(rendu).toContain('Article reporté'); expect(rendu).not.toContain('Prêt à paraître');
  });
  it('la suite conserve le filtre et utilise le total global des articles', async () => {
    mock.resultats.publications = ok([{ id: 'p25', titre: 'Proposition', statut: 'proposition' }], 1051);
    const rendu=html(await Articles({searchParams:Promise.resolve({statut:'proposition',page:'2'})}));
    expect(rendu).toContain('sur 1051 articles'); expect(rendu).toContain('Page 2 sur 43');
    expect(rendu).toContain('/admin/publications?statut=proposition&amp;page=3');
  });
  it('ne présente aucune ouverture commerciale avant qualification', () => {
    const rendu=html(createElement(OrienterDemande,{id}));
    expect(rendu).toContain('Données personnelles et confidentialité'); expect(rendu).not.toContain('/organisations/nouvelle');
  });
  it('annonce l’heure de préparation configurée seulement avec ses prérequis', async () => {
    vi.stubEnv('OPENAI_API_KEY','fictif-test-jamais-envoye');
    mock.resultats.marketing_reglages=ok({actif:true,jours_semaine:[2,5],heure_paris:9,heure_preparation_paris:17,budget_mensuel_cents:0,veille_mots_inclus:[],veille_mots_exclus:[]});
    const rendu=html(await Marketing());
    expect(rendu).toContain('Préparation activée'); expect(rendu).toContain('à 17 h, sous réserve');
  });
});
