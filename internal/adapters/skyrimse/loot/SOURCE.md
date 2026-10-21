# Dados do LOOT empacotados

Cópia dos dados do LOOT que vai com o app (D141). Licença: CC0 1.0 (domínio público).

| Arquivo | Repositório | Branch | Commit | Data do commit |
|---|---|---|---|---|
| `masterlist.yaml` | https://github.com/loot/skyrimse | `v0.29` | `4a3a51a2166f40b5e6a05c220407291dbfb07c3c` | 2026-10-19T18:16:11-07:00 |
| `prelude.yaml` | https://github.com/loot/prelude | `v0.29` | `3ae09f060500468d937f38bf23ffc40b2c950d13` | 2026-08-19T10:45:43+02:00 |

Para atualizar antes de uma versão: baixar os dois arquivos da branch, trocar aqui, atualizar esta tabela e `lootDate` em `../loot.go` (data do commit da masterlist, em UTC), e rodar `go test ./internal/adapters/skyrimse/ ./internal/core/application/loot/` (o teste do adapter lê esta cópia).
