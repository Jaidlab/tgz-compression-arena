# tgz-compression-arena

```pwsh
bun run arena:run
bun run arena:report
```

`scripts/run.ts` picks up every `*.tar` in `assets/fixture`. Use filters when iterating on expensive candidates or large fixtures:

```pwsh
bun run arena:run -- --fixture npm_package_large --candidate gigapress
$env:FIXTURES = 'npm_package_large'; $env:CANDIDATES = 'gigapress'; bun run arena:run
```

Useful Gigapress knobs:

- `GIGAPRESS_ITERATIONS` – small-fixture optimization iterations, default `1000`.
- `GIGAPRESS_THOROUGH` – whether to run expensive split-point search, `true`, `false` or `auto`; default `auto`, which enables it up to `262144` bytes.
- `GIGAPRESS_LARGE_ITERATIONS` – large-fixture chunk optimization iterations, default `8`.
- `GIGAPRESS_LARGE_BLOCK_SIZE` – large-fixture chunk size in bytes, default `4194304` (4.19 mb).
