-- Une nouvelle demande de renvoi s'appuie sur le dernier envoi effectivement
-- confirmé au propriétaire. Les clics sur la même version du carnet partagent
-- la réservation durable, y compris lorsque la réponse du fournisseur est perdue.
create function public.preparer_renvoi_invitation_artisan(
  p_org uuid, p_id uuid, p_dernier_envoi timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.invitations_artisans; preparation jsonb;
begin
  if not public.invitation_artisan_par_proprietaire(p_org) then
    raise exception 'Accès refusé';
  end if;
  select * into invitation from public.invitations_artisans
  where id=p_id and organization_id=p_org for update;
  if not found then raise exception 'Accès refusé'; end if;
  if invitation.envoye_le is distinct from p_dernier_envoi then
    return jsonb_build_object('erreur', 'Le suivi de cette invitation a changé. Rechargez votre carnet avant de demander un nouvel envoi.');
  end if;

  -- Une tentative a pu atteindre le fournisseur avant que sa confirmation ne
  -- revienne. Une nouvelle décision ne doit pas lui substituer une autre clé.
  if exists(select from public.courriels_durables m where m.organization_id=p_org
      and m.contexte_metier->>'type'='invitation_artisan' and m.contexte_metier->>'id'=p_id::text
      and (m.etat in ('en_cours','inconnu') or (m.etat in ('accepte','livre') and m.finalisation_etat <> 'terminee'))) then
    return jsonb_build_object('erreur', 'Un envoi est en cours de vérification. Consultez son suivi avant de le renouveler.');
  end if;

  -- Conserver le contrôle des droits, de l'échéance, de l'état et des limites
  -- d'envoi de la procédure existante. Le repère est fourni par la base.
  preparation := public.renvoyer_invitation_artisan(p_id);
  return preparation || jsonb_build_object('envoi_precedent',
    (extract(epoch from invitation.envoye_le) * 1000000)::bigint::text);
end $$;
revoke all on function public.preparer_renvoi_invitation_artisan(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.preparer_renvoi_invitation_artisan(uuid,uuid,timestamptz) to authenticated;

-- Cette fonction interne finalise les invitations dans la chaîne de traitement
-- actuelle. Une acceptation déjà constatée ne fait jamais reculer l'horodatage.
create or replace function public.finaliser_metier_avant_reconduction(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if not found or m.etat not in ('accepte','livre') then return false; end if;
 if m.contexte_metier->>'type' not in ('acces','invitation_artisan','notification') then return public.finaliser_courriel_metier_lot1(p_id); end if;
 if m.finalisation_etat='terminee' then return true; end if;
 -- Constate seulement une acceptation prouvée. Ne redonne jamais de droits, ne réactive jamais une invitation.
 if m.contexte_metier->>'type'='invitation_artisan' then
  update public.invitations_artisans set envoye_le=greatest(envoye_le,m.accepte_le),erreur_envoi=false
   where id=(m.contexte_metier->>'id')::uuid and organization_id=m.organization_id
   and encode(sha256(convert_to(email,'UTF8')),'hex')=m.contexte_metier->>'destinataire';
  if not found then
   update public.courriels_durables set finalisation_etat='a_verifier',motif='Invitation modifiée après acceptation du message : vérifier le destinataire' where id=p_id;
   return false;
  end if;
 elsif m.contexte_metier->>'type'='acces' and m.contexte_metier ? 'invitation' then
  update public.invitations_locataires set envoye_le=greatest(envoye_le,m.accepte_le),erreur_envoi=false
   where id=(m.contexte_metier->>'invitation')::uuid and organization_id=m.organization_id
   and encode(sha256(convert_to(email,'UTF8')),'hex')=m.contexte_metier->>'destinataire';
  if not found then
   update public.courriels_durables set finalisation_etat='a_verifier',motif='Invitation modifiée après acceptation du message : vérifier le destinataire' where id=p_id;
   return false;
  end if;
 end if;
 update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 return true;
end $$;
