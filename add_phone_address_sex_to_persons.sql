-- Migration: Add phone_number, address, and sex to persons table
ALTER TABLE public.persons
ADD COLUMN phone_number text null,
ADD COLUMN address text null,
ADD COLUMN sex text null;