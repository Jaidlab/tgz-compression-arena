# tgz-compression-arena

```pwsh
bun run arena:run
bun run arena:report
```

`scripts/run.ts` picks up every file in `assets/fixture`. Use filters when iterating on expensive candidates or large fixtures:

```pwsh
bun run arena:run -- --fixture npm_package_large --candidate gigapress
$env:FIXTURES = 'npm_package_large'; $env:CANDIDATES = 'gigapress'; bun run arena:run
```

Useful Gigapress knobs:

- `GIGAPRESS_ITERATIONS` – small-fixture (≤ 256 kb) optimization iterations, default `1000`.
- `GIGAPRESS_THOROUGH` – whether to use full-input thorough compression before chunking; accepts `true`, `false` or `auto`; default `true`. The arena candidate retries with `false` only when the thorough worker crashes with an OOM-style failure.
- `GIGAPRESS_LARGE_ITERATIONS` – per-block optimization iterations for inputs > 256 kb, default `150`.
- `GIGAPRESS_LARGE_BLOCK_SIZE` – chunk size for inputs > 16 mb, default `16777216` (16.78 mb).
