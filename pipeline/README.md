# pipeline

Ingestão anual: lê os brutos da SME em `dados/` (symlink, fora do git), agrega, calibra e grava no Supabase.

```
go run ./pipeline
```

Importa `back/modelo` e `back/db`. Detalhes nas Tasks 1–4 de `docs/PLAN.md`.
