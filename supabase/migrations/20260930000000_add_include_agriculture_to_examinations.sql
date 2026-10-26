-- Migration: Add optional include_agriculture configuration to examinations table
ALTER TABLE public.examinations ADD COLUMN IF NOT EXISTS include_agriculture BOOLEAN DEFAULT NULL;
