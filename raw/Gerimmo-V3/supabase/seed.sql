-- GERIMMO V3 foundation role seeds
-- Minimal system roles only. No business data is inserted here.

insert into public.roles (key, name, description, scope, is_system)
values
  ('super_admin', 'Super Admin', 'Acces global a toute la plateforme GERIMMO V3.', 'global', true),
  ('administrateur_agence', 'Administrateur Agence', 'Administration d une organisation GERIMMO.', 'organization', true),
  ('agent_immobilier', 'Agent Immobilier', 'Gestion operationnelle dans une organisation GERIMMO.', 'organization', true),
  ('proprietaire', 'Proprietaire', 'Acces proprietaire limite a son perimetre autorise.', 'organization', true),
  ('artisan', 'Artisan', 'Acces artisan limite aux donnees qui lui sont partagees.', 'organization', true),
  ('locataire', 'Locataire', 'Acces locataire limite a son logement et ses demandes autorisees.', 'organization', true)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  scope = excluded.scope,
  is_system = excluded.is_system,
  updated_at = now(),
  archived_at = null,
  archived_by = null;
