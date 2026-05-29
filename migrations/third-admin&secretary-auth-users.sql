-- =====================================================
-- Create first admin & secretary auth users manually before run this schema

UPDATE auth.users
SET raw_user_meta_data =
  COALESCE(raw_user_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'
WHERE email = 'multifactors-sales@gmail.com';

update auth.users
set raw_user_meta_data =
  coalesce(raw_user_meta_data, '{}'::jsonb)
  || '{"role":"secretary"}'
where email = 'attendance@gmail.com';