# Voorstel-migrations

Migrations in deze map zijn **niet toegepast** en draaien niet mee met
`supabase db reset`. Ze staan hier omdat ze data weggooien, of omdat er eerst
een beslissing over genomen moet worden.

Wil je er een uitvoeren, lees hem dan eerst helemaal door en verplaats hem naar
`supabase/migrations/` met een tijdstempel die na de laatste toegepaste
migration ligt. Maak een back-up voor je een `DROP` uitvoert.

| Bestand | Wat het doet | Waarom het hier staat |
| --- | --- | --- |
| `drop_face_verification.sql` | Verwijdert de tabel, het enum, de storage-bucket en de kolommen van de gezichtsverificatie | Onomkeerbaar, en er kan nog data van gebruikers in zitten |
