-- Suite du correctif propriétaire : autoriser le rôle 'proprietaire' à gérer les
-- incidents et documents de SON organisation. Les fonctions can_manage_incidents /
-- can_manage_documents (utilisées par toutes les policies incident_*/document_*)
-- n'incluaient que les rôles agence → un propriétaire ne pouvait rien y créer/modifier
-- depuis le dashboard. Même classe de bug que 20260718130000/140000.
-- Périmètre inchangé : ces fonctions restent scopées à l'organisation (un propriétaire
-- ne peut agir que sur SES données).

create or replace function public.can_manage_incidents(target_organization_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select public.is_super_admin()
    or public.has_organization_role(target_organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']);
$function$;

create or replace function public.can_manage_documents(target_organization_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select public.is_super_admin()
    or public.has_organization_role(target_organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']);
$function$;
