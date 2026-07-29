-- Mastra was removed from the production architecture. Its isolated schema
-- contained only framework metadata and had no dependencies from Virafi.
drop schema if exists mastra cascade;
