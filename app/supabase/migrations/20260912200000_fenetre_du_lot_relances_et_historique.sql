-- La fenêtre du lot, seconde passe : l'échelle de relance et l'historique.
--
-- LA DEMANDE (humain, 12/09) : un gabarit d'écran, « exactement ce que je veux
-- sur le bouton lot ». Il porte deux choses que la fenêtre du matin n'avait
-- pas — l'état de la relance d'impayé, et un historique de ce qui s'est passé
-- sur ce lot.
--
-- DEUX ENDROITS OÙ LE GABARIT ALLAIT PLUS VITE QUE LE PRODUIT, et qu'on ne
-- suit donc pas :
--
-- 1. IL DESSINE QUATRE ÉTAPES DE RELANCE — relance amiable, courrier J+15,
--    mise en demeure, commandement de payer. Le produit en connaît TROIS
--    (`relances.niveau` : relance_1, relance_2, mise_en_demeure), et c'est
--    juste : le commandement de payer est un acte d'huissier, que ni l'agence
--    ni la plateforme ne délivrent. Dessiner un bouton qui ne peut rien
--    déclencher serait promettre un pouvoir qu'on n'a pas.
--
-- 2. IL AFFICHE UN HISTORIQUE COMME S'IL EXISTAIT UN JOURNAL D'ÉVÉNEMENTS.
--    Il n'en existe pas : `audit_log` ne consigne que les consultations
--    d'organisation. Plutôt que d'en inventer un — qui ne dirait rien du
--    passé, puisqu'il démarrerait aujourd'hui — l'historique est ASSEMBLÉ à
--    partir des faits que le produit enregistre déjà : le bail, les termes
--    appelés, les encaissements, les quittances et reçus, les relances, les
--    états des lieux, les incidents. Il est donc complet dès la première
--    ouverture, y compris sur un lot géré depuis deux ans.

-- ── 0. Le détenteur principal, pour que « Proposer un mandat » vise juste ─
-- La fiche rendait les détenteurs en TEXTE (« Alice Dupont (100 %) ») : bon à
-- lire, inutilisable pour ouvrir sa page. Sur un lot hors mandat, le geste qui
-- compte est justement d'en proposer un — et il se prépare depuis la fiche du
-- propriétaire. Une colonne de plus, et le bouton vise la bonne personne au
-- lieu de la liste de toutes.
create or replace function public.detenteur_principal_du_lot(p_lot uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.person_id
  from public.detentions d
  join public.lots l on l.id = d.lot_id
  where d.lot_id = p_lot
    and d.date_fin is null
    and l.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.lot_hors_portefeuille(l.organization_id, l.id)
  order by d.quote_part desc
  limit 1;
$$;
revoke execute on function public.detenteur_principal_du_lot(uuid) from public, anon;

-- ── 1. L'échelle de relance du bail de ce lot ────────────────────────────
-- Rend les TROIS niveaux du produit, chacun avec sa date d'envoi quand il a
-- été franchi. L'écran peut ainsi dessiner l'échelle entière — franchie,
-- courante, à venir — au lieu de la seule dernière étape.
create or replace function public.relances_du_lot(p_lot uuid)
returns table (
  niveau text, rang integer, libelle text,
  envoye_le date, premiere_presentation date, recommande text
)
language sql
stable
security definer
set search_path = ''
as $$
  with acces as (
    select l.id as lot, ba.id as bail
    from public.lots l
    left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis')
    where l.id = p_lot
      and l.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.lot_hors_portefeuille(l.organization_id, l.id)
    limit 1
  ),
  echelle(niveau, rang, libelle) as (
    values ('relance_1', 1, 'Relance simple'),
           ('relance_2', 2, 'Seconde relance'),
           ('mise_en_demeure', 3, 'Mise en demeure (LRAR)')
  )
  select e.niveau, e.rang, e.libelle,
         r.date_envoi, r.date_premiere_presentation, r.numero_recommande
  from acces a
  cross join echelle e
  -- La DERNIÈRE de chaque niveau : on peut relancer deux fois au même niveau,
  -- et c'est la date la plus récente qui dit où en est le dossier.
  left join lateral (
    select x.date_envoi, x.date_premiere_presentation, x.numero_recommande
    from public.relances x
    where x.bail_id = a.bail and x.niveau = e.niveau
    order by x.date_envoi desc
    limit 1
  ) r on true
  where a.bail is not null
  order by e.rang;
$$;
comment on function public.relances_du_lot(uuid) is
  'Les TROIS niveaux de relance du produit pour le bail en cours d''un lot, franchis ou non. Le commandement de payer n''y figure pas : c''est un acte d''huissier, que la plateforme ne délivre pas.';
revoke execute on function public.relances_du_lot(uuid) from public, anon;

-- ── 2. L'historique du lot, assemblé depuis les faits ────────────────────
-- Le montant sort en colonne : Postgres impose de déposer la fonction avant de
-- changer son type de retour.
drop function if exists public.historique_du_lot(uuid, integer);

create function public.historique_du_lot(p_lot uuid, p_limite integer default 40)
returns table (
  survenu_le date, nature text, titre text, detail text, montant numeric, code text
)
language sql
stable
security definer
set search_path = ''
as $$
  with relation as (
    select l.id as lot, l.organization_id as org,
           (l.organization_id in (select public.org_ids_avec_roles(
              array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
            and not public.lot_hors_portefeuille(l.organization_id, l.id)) as gerant
    from public.lots l
    where l.id = p_lot
  ),
  -- Les baux du lot, vivants ou terminés : l'historique porte sur le LOT, et
  -- un lot qui a changé d'occupant garde la trace du précédent.
  baux_du_lot as (
    select b.id, b.type, b.etat, b.date_debut, b.date_fin,
           btrim(coalesce(p.prenom,'') || ' ' || p.nom) as locataire
    from relation r
    join public.baux b on b.lot_id = r.lot
    left join public.persons p on p.id = b.locataire_principal
    where r.gerant
       or (b.etat in ('actif','preavis')
           and (b.locataire_principal = public.ma_personne_locataire(r.org)
                or exists (select 1 from public.bail_personnes bp
                           where bp.bail_id = b.id
                             and bp.person_id = public.ma_personne_locataire(r.org)
                             and bp.role = 'colocataire')))
  ),
  evenements as (
    -- NI LES MONTANTS NI LES LIBELLÉS DE CODE NE SONT MIS EN FORME ICI. La
    -- catégorie d'un incident sort en CODE (`plomberie_joint`) dans `code` :
    -- ses mots français vivent dans `src/lib/incidents.ts`, et les recopier ici
    -- se donnerait deux tables de libellés à tenir d'accord.
    --
    -- LES MONTANTS NE SONT PAS MIS EN FORME ICI. `to_char` suit la locale du
    -- serveur : sur une base anglophone, « 300.00 € » au lieu de « 300,00 € »
    -- (constaté au premier essai). Le montant sort donc NU, et l'écran le met
    -- en forme avec la même fonction que partout ailleurs dans le produit.
    select b.date_debut as survenu_le, 'bail' as nature,
           'Bail ' || b.type::text || ' pris d''effet' as titre,
           coalesce(b.locataire, 'locataire non désigné') as detail,
           null::numeric as montant, null::text as code
    from baux_du_lot b
    where b.date_debut is not null

    union all
    select b.date_fin, 'bail', 'Fin de bail', coalesce(b.locataire, ''), null, null
    from baux_du_lot b
    where b.date_fin is not null and b.date_fin <= current_date

    union all
    select a.date_echeance, 'appel', 'Terme appelé',
           to_char(a.periode, 'TMMonth YYYY'), a.montant_du, null
    from baux_du_lot b
    join public.appels_loyer a on a.bail_id = b.id

    union all
    select e.date_paiement, 'encaissement', 'Encaissement',
           coalesce(e.mode, ''), e.montant, null
    from baux_du_lot b
    join public.encaissements e on e.bail_id = b.id

    union all
    -- RM-3.4.2 : une quittance atteste un terme SOLDÉ ; un paiement partiel
    -- ne produit qu'un reçu. La distinction est portée par `est_quittance`, et
    -- l'historique la dit plutôt que de tout appeler « quittance ».
    select q.date_emission, 'quittance',
           case when q.est_quittance then 'Quittance émise' else 'Reçu de paiement partiel émis' end,
           case when q.email_envoye_at is not null then 'envoyée par e-mail' else 'non envoyée' end,
           q.montant, null
    from baux_du_lot b
    join public.quittances q on q.bail_id = b.id

    union all
    select r2.date_envoi, 'relance',
           case r2.niveau
             when 'relance_1' then 'Relance simple envoyée'
             when 'relance_2' then 'Seconde relance envoyée'
             when 'mise_en_demeure' then 'Mise en demeure envoyée (LRAR)'
             else 'Relance envoyée'
           end,
           coalesce('recommandé ' || r2.numero_recommande, ''), null, null
    from baux_du_lot b
    join public.relances r2 on r2.bail_id = b.id

    union all
    select coalesce(edl.signe_le::date, edl.date_edl), 'edl',
           'État des lieux ' || case edl.type::text when 'sortie' then 'de sortie' else 'd''entrée' end
             || case when edl.signe_le is not null then ' signé' else ' préparé' end,
           '', null, null
    from baux_du_lot b
    join public.etats_des_lieux edl on edl.bail_id = b.id

    union all
    select i.created_at::date, 'incident', 'Incident déclaré',
           coalesce(i.description, ''), null, i.categorie::text
    from relation r
    join public.incidents i on i.lot_id = r.lot
    where r.gerant
       or i.declarant_person_id = public.ma_personne_locataire(r.org)

    union all
    select i.clos_le::date, 'incident', 'Incident clos', coalesce(i.cloture_motif::text, ''), null, i.categorie::text
    from relation r
    join public.incidents i on i.lot_id = r.lot
    where i.clos_le is not null
      and (r.gerant or i.declarant_person_id = public.ma_personne_locataire(r.org))
  )
  select ev.survenu_le, ev.nature, ev.titre, nullif(btrim(ev.detail), ''), ev.montant, ev.code
  from evenements ev, relation r
  where ev.survenu_le is not null
    and ev.survenu_le <= current_date
    and (r.gerant or public.ma_personne_locataire(r.org) is not null)
  order by ev.survenu_le desc, ev.titre
  limit greatest(1, least(coalesce(p_limite, 40), 200));
$$;
comment on function public.historique_du_lot(uuid, integer) is
  'Ce qui s''est passé sur un lot, ASSEMBLÉ depuis les faits (bail, termes, encaissements, quittances, relances, EDL, incidents) — il n''existe pas de journal d''événements, et un journal créé aujourd''hui ne dirait rien du passé.';
revoke execute on function public.historique_du_lot(uuid, integer) from public, anon;

select public.fermer_fonctions_a_anon();
