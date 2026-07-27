-- GERIMMO V3 Sprint 10 - Premium transactional email templates.

insert into public.email_templates (code, name, subject_template, html_template, text_template, variables)
values
  ('welcome', 'Bienvenue', 'Bienvenue sur GERIMMO', '<h1>Bienvenue {{name}}</h1><p>Votre espace GERIMMO est prêt.</p>', 'Bienvenue {{name}}. Votre espace GERIMMO est prêt.', '["name"]'),
  ('trial_started', 'Essai commencé', 'Votre essai GERIMMO a commencé', '<h1>14 jours pour découvrir GERIMMO</h1><p>Votre essai complet est actif jusqu’au {{trial_end_date}}.</p>', 'Votre essai complet est actif jusqu’au {{trial_end_date}}.', '["trial_end_date"]'),
  ('trial_ended', 'Essai terminé', 'Votre essai GERIMMO est terminé', '<h1>Vos données restent protégées</h1><p>Votre espace est suspendu. Choisissez une offre pour reprendre sans perte de données.</p>', 'Votre espace est suspendu. Vos données sont conservées.', '[]'),
  ('payment_succeeded', 'Paiement réussi', 'Paiement GERIMMO confirmé', '<h1>Paiement reçu</h1><p>Votre paiement de {{amount}} a été confirmé.</p>', 'Votre paiement de {{amount}} a été confirmé.', '["amount"]'),
  ('payment_failed', 'Paiement refusé', 'Action requise pour votre abonnement GERIMMO', '<h1>Paiement non abouti</h1><p>Mettez à jour votre moyen de paiement depuis votre espace sécurisé.</p>', 'Votre paiement n’a pas abouti. Mettez à jour votre moyen de paiement.', '[]'),
  ('invoice', 'Facture', 'Votre facture GERIMMO {{invoice_number}}', '<h1>Votre facture est disponible</h1><p>Montant : {{amount}}</p>', 'Facture {{invoice_number}}. Montant : {{amount}}.', '["invoice_number","amount"]'),
  ('renewal', 'Renouvellement', 'Renouvellement de votre abonnement GERIMMO', '<h1>Prochain renouvellement</h1><p>Votre abonnement sera renouvelé le {{renewal_date}}.</p>', 'Renouvellement prévu le {{renewal_date}}.', '["renewal_date"]'),
  ('suspension', 'Suspension', 'Votre espace GERIMMO est suspendu', '<h1>Accès suspendu</h1><p>Vos données restent intégralement conservées.</p>', 'Votre accès est suspendu. Vos données sont conservées.', '[]'),
  ('reactivation', 'Réactivation', 'Votre espace GERIMMO est réactivé', '<h1>Bienvenue à nouveau</h1><p>Votre abonnement est de nouveau actif.</p>', 'Votre abonnement GERIMMO est de nouveau actif.', '[]')
on conflict (code) do update set
  name = excluded.name,
  subject_template = excluded.subject_template,
  html_template = excluded.html_template,
  text_template = excluded.text_template,
  variables = excluded.variables,
  is_active = true,
  updated_at = now();
