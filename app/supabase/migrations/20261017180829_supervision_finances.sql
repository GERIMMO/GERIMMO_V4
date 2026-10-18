-- Lecture seule : miroir des souscriptions, sans identifiant Stripe ni charge
-- de webhook. Aucun droit direct supplémentaire sur abonnements.
create or replace function public.supervision_finances()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_super_admin(), false) then
    raise exception 'Réservé à la supervision' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.organizations),
    'organisations', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.name, l.id), '[]'::jsonb)
      from (
        select o.id, o.name, o.type, o.status, o.essai_fin, o.created_at,
          o.grille_tarifaire, a.stripe_statut, a.periodicite, a.formule,
          a.montant_periode_cents, a.periode_fin, a.periodicite_suivante,
          public.unites_a_couvrir(o.id) as unites_a_couvrir, a.unites_souscrites,
          coalesce(a.annulation_demandee, false) as annulation_demandee,
          a.paiement_en_defaut_depuis, a.derniere_synchro,
          coalesce(a.a_resynchroniser, false) as a_resynchroniser,
          nullif(a.derniere_erreur, '') is not null as synchro_en_erreur,
          coalesce(a.premiere_facture_payee, false) as premiere_facture_payee,
          (select count(*) from public.avantages_parrainage ap
            where ap.beneficiaire_organization_id = o.id and ap.etat = 'en_attente') as avantages_en_attente
        from public.organizations o
        left join public.abonnements a on a.organization_id = o.id
        order by o.name, o.id limit 5000
      ) l
    )
  );
end;
$$;
revoke execute on function public.supervision_finances() from public, anon;
grant execute on function public.supervision_finances() to authenticated;
comment on function public.supervision_finances() is
  'Vue financière superadmin en lecture seule. Total exact et 5000 organisations au maximum : le client doit signaler toute vue partielle. Montants du miroir Stripe, pas des encaissements comptables.';
