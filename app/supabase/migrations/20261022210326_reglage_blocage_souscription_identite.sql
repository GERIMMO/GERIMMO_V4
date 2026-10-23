-- Réglage réservé au superadmin permanent, avec le même contrôle de révision
-- et le même historique que l'identité. L'ajout ne lève aucun blocage existant.
alter table public.supervision_identite
  add column if not exists blocage_souscription_identite boolean not null default true;

comment on column public.supervision_identite.blocage_souscription_identite is
  'Exiger une identité complète avant souscription/hausse. Le superadmin peut lever cette règle ; les autres contrôles de paiement sont conservés.';

-- La RLS identite_admin exige déjà is_permanent_super_admin() en USING ET
-- WITH CHECK ; aucun droit nouveau pour anon ni clé de service côté client.
grant select(blocage_souscription_identite), update(blocage_souscription_identite)
  on public.supervision_identite to authenticated;

select public.fermer_fonctions_a_anon();
