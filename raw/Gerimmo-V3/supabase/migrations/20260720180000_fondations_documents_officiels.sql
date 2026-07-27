-- Fondations des documents officiels (quittances, relances, mises en demeure).
--
-- Trois manques empêchaient de produire un document valable :
--
-- 1. LA QUITTANCE NE POUVAIT PAS ÊTRE CONFORME. L'article 21 de la loi du 6 juillet 1989
--    impose de détailler séparément le loyer et les charges. Les échéances ne stockaient
--    qu'un montant global : une quittance émise ainsi serait irrégulière.
--
-- 2. LE BAILLEUR N'AVAIT PAS D'IDENTITÉ. La table organizations ne portait ni raison
--    sociale, ni adresse postale, ni SIREN. Un courrier officiel sans l'identité et
--    l'adresse de son auteur n'a aucune valeur.
--
-- 3. Les montants restaient figés au moment de la génération : on conserve désormais le
--    détail sur l'échéance elle-même, pour qu'une quittance rééditée des années plus tard
--    reflète ce qui était réellement dû à l'époque, et non le loyer actuel du bien.

-- 1) Détail loyer / charges sur chaque échéance.
alter table public.rent_periods
  add column if not exists rent_cents integer,
  add column if not exists charges_cents integer not null default 0;

comment on column public.rent_periods.rent_cents is
  'Loyer hors charges de la période. Doit figurer séparément sur la quittance (loi du 6 juillet 1989, art. 21).';
comment on column public.rent_periods.charges_cents is
  'Provision pour charges de la période, détaillée séparément sur la quittance.';

-- Les échéances existantes n'avaient qu'un total : on le reporte sur le loyer, charges à 0.
-- C'est exact pour les biens sans charges, et au pire conservateur (aucune charge inventée).
update public.rent_periods set rent_cents = amount_cents where rent_cents is null;

-- 2) Identité légale du bailleur (ou de son mandataire), portée par l'organisation.
alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists siren text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text not null default 'France',
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

comment on column public.organizations.legal_name is
  'Raison sociale exacte, telle qu''elle doit figurer sur les courriers officiels. À défaut, `name` est utilisé.';
comment on column public.organizations.siren is 'SIREN/SIRET, mention attendue sur les courriers d''une personne morale.';
