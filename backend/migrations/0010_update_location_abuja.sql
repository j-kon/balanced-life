-- Update default contact location from Lagos, Nigeria (or generic legacy Nigeria) to Abuja, Nigeria
UPDATE settings
SET value = 'Abuja, Nigeria'
WHERE key = 'contactAddress' AND value IN ('Lagos, Nigeria', 'Nigeria');

