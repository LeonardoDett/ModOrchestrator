# Patched copy of github.com/nwaples/rardecode/v2 v2.4.1

Unmodified upstream source (BSD-2-Clause, see `LICENSE`) except for
`decode_reader.go`. Wired in by the `replace` directive in the app's `go.mod`
(decision D098 in `mod-orchestrator-spec-v2/docs-ia/decisoes.md`). Drop the
copy and the `replace` once upstream ships equivalent fixes.

Both bugs only show up when an entry is larger than the decode window (the
dictionary size, at least 256 KiB). Archives that hit them extract with
`rardecode: bad file checksum`, and in solid archives every later file
fails too, often as `rardecode: invalid filter`.

1. **Match crossing the end of the window** (`copyBytes`): the copy stopped
   at `d.size` and dropped the rest of the match, so the output came out
   short and everything after it was shifted. The remainder is now kept in
   `pendLen`/`pendOff` and copied by `fill` right after the window wraps.
2. **Filter queued while a filter block is gathered** (`bufBytes` /
   `queueFilter`): when a filter block crosses the end of the window,
   `bufBytes` takes the bytes before the end and calls `fill`, which wraps
   and decodes further, reading new filters. Their offsets were taken from
   the moved read index while the queue is still relative to the start of
   the block being gathered, so they landed too early (overlapping filters,
   `invalid filter`). `bufRead` now carries the bytes already taken.

Regression fixture: `internal/infrastructure/archive/testdata/rar5-wrap.rar`
(built by `testdata/gen`), checked by `TestRar5WindowWrap`. It fails with
upstream v2.4.1, and also fails if either fix is left out on its own.
