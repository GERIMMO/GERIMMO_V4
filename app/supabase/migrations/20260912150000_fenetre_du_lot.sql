-- LA FENÊTRE DU LOT — un objet, une fenêtre, une portée par regard.
--
-- LA DEMANDE (humain, 12/09, en deux temps).
--   « Pour l'agent immobilier, il n'y a plus de page document ou comptabilité.
--     Lorsqu'il clique sur le lot, ça ouvre une fenêtre sur la page pour donner
--     directement toutes les infos du lot : locataire, propriétaire, les infos
--     utiles pour un agent immo, un bouton pour dérouler les documents, un
--     bouton pour dérouler la comptabilité, et la possibilité d'envoyer un
--     rapport au propriétaire par mail. »
--   « J'aimerais que la vision soit similaire pour tous ceux qui ont accès au
--     lot, et que tu utilises cette logique pour le site. »
--
-- POURQUOI C'EST JUSTE, ET PAS SEULEMENT PLUS COURT. Une page « Documents » de
-- l'agence oblige à chercher un document au milieu de ceux des quatre-vingts
-- autres lots ; une page « Comptabilité » oblige à filtrer. Or un agent ne se
-- demande jamais « quels documents avons-nous ? » : il se demande « qu'est-ce
-- que j'ai sur CE lot ? ». L'index s'efface donc au profit de l'objet.
--
-- UNE FONCTION, UNE PORTÉE. `fiche_lot` rend une colonne `portee` qui dit à
-- quel titre l'appelant regarde ce lot, et TAIT le reste. Ce n'est pas l'écran
-- qui masque : l'écran ne peut pas masquer ce qu'on ne lui a pas donné.
--
--   gerant     admin d'agence, agent (dans son portefeuille, RM-18.1.3),
--              propriétaire direct : tout. C'est lui qui gère.
--   locataire  le sien : son logement, son bail, ce qu'il doit, ses documents.
--              JAMAIS le mandant, son e-mail, le taux d'honoraires de l'agence,
--              ni la liste de ce qui bloque une remise en location.
--
-- ET L'ARTISAN ? Il n'entre pas ici, et c'est délibéré. Son portail ne lit
-- AUCUNE table du produit (aucune politique RLS ne nomme son rôle) : il ne
-- connaît que des RPC qui déduisent son identité de `auth.uid()` et ne rendent
-- que ses missions. Lui ouvrir une fonction qui prend un `p_lot` en paramètre
-- rouvrirait la porte que le socle du 11/09 a condamnée. Sa « fenêtre » à lui
-- existe déjà : sa fiche de mission, avec l'adresse, l'accès et le contact de
-- la visite — et pas le loyer de quelqu'un.
--
-- TROIS LECTURES, PAS UNE. La fiche se charge à l'ouverture ; les documents et
-- la comptabilité ne se chargent que si on déroule leur volet. Tout ramener
-- d'un coup ferait payer à chaque clic sur un lot le prix de ce qu'on ne
-- regarde presque jamais — et sur trois cents lots, ce prix se paie trois cents
-- fois par jour.

-- ── 1. La fiche, avec sa portée ──────────────────────────────────────────
-- Le type de retour porte une colonne de plus que la version du matin :
-- Postgres impose de déposer la fonction avant de la recréer.

drop function if exists public.fiche_lot(uuid);

create function public.fiche_lot(p_lot uuid)
returns table (
  portee text,
  lot_id uuid, lot_nom text, lot_etat public.lot_etat,
  surface_m2 numeric, pieces integer, etage text, meuble boolean,
  bien_id uuid, bien_nom text, bien_type public.bien_type,
  adresse text, code_postal text, ville text, copropriete boolean,
  bail_id uuid, bail_etat public.bail_etat, bail_type public.bail_type,
  locataire text, locataire_email text, locataire_telephone text,
  loyer_hc numeric, charges numeric, depot_garantie numeric,
  date_debut date, date_fin date, jour_echeance smallint,
  mandat_id uuid, mandat_etat public.mandat_etat, mandant text,
  mandant_email text, taux_honoraires numeric, jour_rapport smallint,
  proprietaires text,
  blocages text[], incidents_ouverts integer,
  impaye_echu numeric, termes_impayes integer, diagnostics_manquants integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with relation as (
    -- À QUEL TITRE cet appelant regarde-t-il ce lot ? La question est posée
    -- une fois, ici, et tout le reste en découle. `portee is null` = il ne le
    -- regarde à aucun titre, et la fonction ne rend rien.
    select
      l.id as lot, l.organization_id as org,
      case
        when l.organization_id in (select public.org_ids_avec_roles(
               array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
             and not public.lot_hors_portefeuille(l.organization_id, l.id)
          then 'gerant'
        when exists (
          select 1
          from public.baux b
          join public.persons p
            on p.organization_id = b.organization_id
           and p.account_id = (select auth.uid())
          where b.lot_id = l.id
            and b.etat in ('actif','preavis')
            and exists (select 1 from public.memberships m
                        where m.account_id = (select auth.uid())
                          and m.organization_id = b.organization_id
                          and m.role = 'locataire' and m.status = 'active')
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire'))
        ) then 'locataire'
      end as portee
    from public.lots l
    where l.id = p_lot
  )
  select
    r.portee,
    l.id, l.nom, l.etat, l.surface_m2, l.pieces, l.etage, l.meuble,
    b.id, b.nom, b.type, b.address_line1, b.postal_code, b.city, b.copropriete,
    ba.id, ba.etat, ba.type,
    case when ba.id is not null then btrim(coalesce(pl.prenom,'') || ' ' || pl.nom) end,
    -- Le contact de l'occupant n'est rendu que tant que le bail vit : on ne
    -- laisse pas le téléphone de quelqu'un qui n'habite plus là.
    case when ba.etat in ('actif','preavis') then pl.email end,
    case when ba.etat in ('actif','preavis') then pl.telephone end,
    ba.loyer_hc, ba.charges, ba.depot_garantie,
    ba.date_debut, ba.date_fin, ba.jour_echeance,
    -- ── Ce qui appartient au propriétaire et à son gestionnaire ──
    case when r.portee = 'gerant' then m.id end,
    case when r.portee = 'gerant' then m.etat end,
    case when r.portee = 'gerant' then btrim(coalesce(pm.prenom,'') || ' ' || pm.nom) end,
    case when r.portee = 'gerant' then pm.email end,
    case when r.portee = 'gerant' then ml.taux_honoraires end,
    case when r.portee = 'gerant' then m.date_rapport end,
    case when r.portee = 'gerant' then
      (select string_agg(btrim(coalesce(p2.prenom,'') || ' ' || p2.nom)
                         || ' (' || round(d.quote_part) || ' %)', ', ' order by d.quote_part desc)
         from public.detentions d
         join public.persons p2 on p2.id = d.person_id
        where d.lot_id = l.id and d.date_fin is null)
    end,
    -- Ce qui bloque une MISE EN LOCATION est la liste de tâches de l'agence :
    -- un locataire en place n'a rien à en faire, et la lui montrer serait lui
    -- dire que son logement n'est pas louable.
    case when r.portee = 'gerant' then public.lot_blocages_location(l.id) end,
    case
      when r.portee = 'gerant' then
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos')
      else
        -- Le locataire ne compte que SES signalements — pas ceux des voisins
        -- de palier, ni ceux que l'agence a ouverts de son côté.
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos'
            and i.declarant_person_id = public.ma_personne_locataire(l.organization_id))
    end,
    -- CE QUI RESTE DÛ SUR LES TERMES ÉCHUS, et pas un calcul de plus.
    -- `etat_loyers_bail_brut` est la source que le produit utilise déjà pour
    -- poser l'alerte d'impayé et pour l'échéancier du locataire. En refaire une
    -- somme à partir des écritures donnerait un second chiffre qui divergerait
    -- du premier — et c'est le chiffre dont on se sert pour relancer quelqu'un.
    coalesce((select sum(x.montant_du - x.montant_couvert)
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    coalesce((select count(*)::integer
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    case when r.portee = 'gerant' then
      (select count(*)::integer from unnest(public.lot_blocages_location(l.id)) x
        where x ilike '%diagnostic%' or x ilike '%dpe%' or x ilike '%erp%')
    else 0 end
  from relation r
  join public.lots l on l.id = r.lot
  join public.biens b on b.id = l.bien_id
  left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis','brouillon')
  left join public.persons pl on pl.id = ba.locataire_principal
  left join public.mandat_lignes ml on ml.lot_id = l.id and ml.date_fin is null
  left join public.mandats m on m.id = ml.mandat_id and m.etat in ('actif','preavis')
  left join public.persons pm on pm.id = m.person_id
  where r.portee is not null
  order by case ba.etat when 'actif' then 0 when 'preavis' then 1 else 2 end
  limit 1;
$$;
comment on function public.fiche_lot(uuid) is
  'Le lot vu par celui qui le regarde : « gerant » voit tout, « locataire » voit son logement, son bail et ce qu''il doit — jamais le mandant ni les honoraires. Rend zéro ligne à qui n''a aucun titre sur ce lot.';
revoke execute on function public.fiche_lot(uuid) from public, anon;

-- ── 2. Les documents, à la portée de chacun ──────────────────────────────
-- Le gérant voit ceux du lot, de son bail et de son mandat. Le locataire voit
-- CE QUE LE PRODUIT LUI MONTRE DÉJÀ : `mes_pieces_locataire` est la règle de
-- visibilité du locataire, écrite une fois et éprouvée. En réécrire une
-- deuxième ici, c'est se donner deux règles à tenir d'accord — et c'est la
-- seconde qui, un jour, laissera passer une pièce de trop.
create or replace function public.documents_du_lot(p_lot uuid)
returns table (
  document_id uuid, titre text, type public.document_type,
  depose_le timestamptz, expire_le date, taille_octets bigint,
  rattachement text
)
language sql
stable
security definer
set search_path = ''
as $$
  with contexte as (
    select l.id as lot, l.organization_id as org,
           ba.id as bail, ml.mandat_id as mandat,
           (l.organization_id in (select public.org_ids_avec_roles(
              array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
            and not public.lot_hors_portefeuille(l.organization_id, l.id)) as gerant
    from public.lots l
    left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis','brouillon')
    left join public.mandat_lignes ml on ml.lot_id = l.id and ml.date_fin is null
    where l.id = p_lot
    limit 1
  )
  select d.id, d.titre, d.type, d.created_at, d.expire_le, d.taille_octets,
         case dl.entite when 'lot' then 'ce lot'
                        when 'bail' then 'le bail'
                        when 'mandat' then 'le mandat'
                        else dl.entite::text end
  from public.document_liens dl
  join public.documents d on d.id = dl.document_id
  cross join contexte c
  where c.gerant
    and d.purged_at is null
    and ((dl.entite = 'lot' and dl.entite_id = c.lot)
      or (dl.entite = 'bail' and dl.entite_id = c.bail)
      or (dl.entite = 'mandat' and dl.entite_id = c.mandat))
  union all
  select p.document_id, p.titre, p.type, p.depose_le, p.expire_le, null::bigint, p.source
  from contexte c
  cross join lateral public.mes_pieces_locataire(c.org) p
  where not c.gerant
    -- La portée « locataire » se vérifie ici comme dans `fiche_lot` : être
    -- locataire DE CE LOT, pas seulement locataire quelque part dans l'agence.
    and exists (
      select 1 from public.baux b
      where b.lot_id = c.lot and b.etat in ('actif','preavis')
        and (b.locataire_principal = public.ma_personne_locataire(c.org)
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id
                          and bp.person_id = public.ma_personne_locataire(c.org)
                          and bp.role = 'colocataire'))
    )
  order by 4 desc;
$$;
comment on function public.documents_du_lot(uuid) is
  'Les pièces d''un lot, à la portée de celui qui demande : le gérant voit celles du lot, du bail et du mandat ; le locataire voit exactement ce que `mes_pieces_locataire` lui montre déjà.';
revoke execute on function public.documents_du_lot(uuid) from public, anon;

-- ── 3. La comptabilité de CE lot ─────────────────────────────────────────
-- Les écritures du lot, les plus récentes d'abord, avec le sens rendu en
-- SIGNE plutôt qu'en mot : un agent lit une colonne de montants, pas deux
-- colonnes qu'il doit mentalement soustraire.
create or replace function public.comptabilite_du_lot(
  p_lot uuid, p_depuis date default null
)
returns table (
  ecriture_id uuid, date_piece date, libelle text, categorie text,
  montant_signe numeric, systeme boolean, contre_passee boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.date_piece, e.libelle, e.categorie,
         case when e.sens = 'recette' then e.montant else -e.montant end,
         e.systeme,
         exists (select 1 from public.ecritures c where c.contre_ecriture_de = e.id)
  from public.ecritures e
  join public.lots l on l.id = e.lot_id
  where e.lot_id = p_lot
    and (p_depuis is null or e.date_piece >= p_depuis)
    and l.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.lot_hors_portefeuille(l.organization_id, l.id)
  order by e.date_piece desc, e.created_at desc
  limit 200;
$$;
revoke execute on function public.comptabilite_du_lot(uuid, date) from public, anon;

-- ── 4. Le rapport du mois, vu depuis le lot ──────────────────────────────
-- L'agent envoie « le rapport au propriétaire » depuis un lot. Le rapport,
-- lui, porte sur le MANDAT — qui couvre peut-être plusieurs lots. On rend donc
-- de quoi le dire honnêtement à l'écran : le mandat, son mandant, combien de
-- lots il couvre, et où en est le rapport du mois.
create or replace function public.rapport_du_lot(p_lot uuid, p_mois date default null)
returns table (
  mandat_id uuid, mandant text, mandant_email text,
  lots_du_mandat integer, mois date,
  rapport_id uuid, statut text, net numeric, envoye_le timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select ml.mandat_id, ma.person_id,
           coalesce(p_mois, date_trunc('month', current_date - interval '1 month')::date) as mois
    from public.mandat_lignes ml
    join public.mandats ma on ma.id = ml.mandat_id and ma.etat in ('actif','preavis')
    join public.lots l on l.id = ml.lot_id
    where ml.lot_id = p_lot and ml.date_fin is null
      and l.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.lot_hors_portefeuille(l.organization_id, l.id)
    limit 1
  )
  select m.mandat_id,
         btrim(coalesce(p.prenom,'') || ' ' || p.nom), p.email,
         (select count(*)::integer from public.mandat_lignes x
           where x.mandat_id = m.mandat_id and x.date_fin is null),
         m.mois,
         r.id, r.statut::text, r.net, r.envoye_le
  from m
  join public.persons p on p.id = m.person_id
  left join public.rapports_gestion r on r.mandat_id = m.mandat_id and r.mois = m.mois;
$$;
comment on function public.rapport_du_lot(uuid, date) is
  'Le rapport de gestion du mois vu depuis un lot. Rend le NOMBRE de lots du mandat : le rapport les couvre tous, et l''écran doit le dire.';
revoke execute on function public.rapport_du_lot(uuid, date) from public, anon;

-- ── 5. Le lot du locataire, pour que son espace puisse ouvrir la fenêtre ──
-- `mon_bail_locataire` rend le NOM du lot, pas son identifiant : l'espace
-- locataire n'avait jamais eu besoin de l'un, seulement de l'autre. Plutôt que
-- de changer le type de retour d'une fonction que six écrans appellent, on
-- ajoute la seule chose qui manque.
create or replace function public.mon_lot_locataire(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.lot_id
  from public.baux b
  where b.organization_id = p_org
    and b.etat in ('actif','preavis')
    and (b.locataire_principal = public.ma_personne_locataire(p_org)
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id
                      and bp.person_id = public.ma_personne_locataire(p_org)
                      and bp.role = 'colocataire'))
  order by b.created_at desc
  limit 1;
$$;
comment on function public.mon_lot_locataire(uuid) is
  'Le lot du bail en cours de l''appelant, pour que son espace puisse ouvrir la fenêtre du lot.';
revoke execute on function public.mon_lot_locataire(uuid) from public, anon;

-- Les quatre fonctions sont fermées à `anon` une bonne fois : la garde
-- rejoue l'inventaire complet et rend le compte des fonctions restées
-- ouvertes (zéro attendu).
select public.fermer_fonctions_a_anon();
