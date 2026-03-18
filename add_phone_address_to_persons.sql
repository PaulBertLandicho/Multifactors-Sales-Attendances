-- Migration: Add phone_number and address to persons table
ALTER TABLE public.persons
ADD COLUMN phone_number text null,
ADD COLUMN address text null;