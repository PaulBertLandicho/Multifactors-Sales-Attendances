-- Migration: Allow department to be NULL for global holidays
ALTER TABLE public.holidays ALTER COLUMN department DROP NOT NULL;