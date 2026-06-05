CREATE TABLE IF NOT EXISTS classification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matcher TEXT NOT NULL UNIQUE,
    categoria TEXT NOT NULL CHECK (categoria IN ('Vida', 'Placeres', 'Futuro')),
    subcategoria TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS classification_preferences_updated_at_idx
    ON classification_preferences (updated_at DESC);
