# Second Brain — shared work memory across projects

Local-first memory hub untuk semua kerjaan Anda (HRM, CRM, Inventory, dll).
Terpasang global — tidak perlu membuka repo ini untuk memakainya.

## Yang sudah jadi

- CLI global: `secondbrain` (terpasang di `~/.local/bin/secondbrain`)
- Wrapper agent: `sb` (`~/.local/bin/sb`) — untuk claude / opencode / hermes / perintah lain
- MCP server: `python3 -m secondbrain.mcp_server` — sudah terdaftar di Hermes (`secondbrain`)
- Database: `~/.secondbrain/brain.db` (SQLite, local-only)
- Skill Hermes: `second-brain` (auto-load per sesi baru)
- Tests: 22 passing (`python3 -m pytest -q`)

## Perintah CLI

```bash
secondbrain context                     # project aktif + recent + cross-project
secondbrain context --json              # untuk agent / script
secondbrain capture "judul" \
  --content "isi" \
  --project hrm-apps \
  --type bug_fix \
  --tags flutter,getx \
  --agent hermes \
  --files lib/a.dart,lib/b.dart
secondbrain search "firebase pod"       # cari di semua project
secondbrain search "form" --project crm-apps
secondbrain list --project hrm-apps -v
secondbrain show <id>
secondbrain link <from_id> <to_id> --kind reuses_pattern
secondbrain projects
secondbrain stats
secondbrain auto-capture --agent hermes # capture commit terakhir sebagai memory
secondbrain export --out backup.json
```

## Wrapper agent

```bash
sb claude          # context sebelum, auto-capture sesudah
sb opencode
sb hermes
sb wrap "pytest -q"   # perintah bebas
```

## MCP (Hermes / Claude Code / OpenCode)

Sudah terpasang dan terverifikasi di Hermes:
```bash
hermes mcp test secondbrain
```

Untuk memasang ke Claude Code secara global:
```bash
claude mcp add --scope user secondbrain -- /usr/bin/python3 -m secondbrain.mcp_server
```

Untuk memasang ke OpenCode, jalankan `opencode mcp add` lalu pilih server
stdio dengan command `/usr/bin/python3 -m secondbrain.mcp_server`.

Catatan: wrapper `sb claude` dan `sb opencode` berbeda dari MCP. Wrapper
hanya menampilkan context sebelum agent bekerja dan menjalankan auto-capture
setelahnya; MCP harus dikonfigurasi di masing-masing agent.

Tools: `search_memories`, `project_context`, `create_memory`, `capture_latest_commit`

Recommended agent behavior: after meaningful work is complete and verified,
the agent must call `create_memory` before its final response. The summary
should include problem, root cause, solution, verification, changed files,
technologies, and a reusable lesson. `capture_latest_commit` is only the
fallback when the agent cannot produce a structured summary.

## Keamanan

- Secret (api key, token, password) otomatis di-redact jadi `[REDACTED]` saat capture
- Jangan pernah capture isi `.env`, kredensial, atau data customer sensitif

## Struktur

```
src/secondbrain/core.py        # Brain: storage, detect_project, search, redact
src/secondbrain/cli.py         # CLI argparse
src/secondbrain/mcp_server.py  # MCP stdio server
bin/sb                         # wrapper agent
tests/                         # pytest (22 tests)
```

## Pengembangan

```bash
python3 -m pip install -e . --user   # install editable
python3 -m pytest -q                 # jalankan tests
```

Env: `SECONDBRAIN_HOME` (default `~/.secondbrain`) untuk pindah lokasi database.

## Roadmap

- Fase 3: web UI (list, filter, graph 2D)
- Fase 4: semantic search + AI chat
- Fase 5: visualisasi globe 3D
