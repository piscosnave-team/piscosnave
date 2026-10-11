# Vendored third-party files

Nothing here is edited by hand. Every file is a byte-for-byte copy of an upstream release artefact, and the
tests (`tests/static/vendor-checksum.spec.js`) fail if a file changes or is added without a row below.

| File | Source URL | Version | SHA-256 | Registry integrity | License |
|------|------------|---------|---------|--------------------|---------|
| `three/three.module.min.js` | https://registry.npmjs.org/three/-/three-0.160.0.tgz (`package/build/three.module.min.js`) | three 0.160.0 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` | `sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==` (of the tarball) | MIT |
| `three/LICENSE` | same tarball (`package/LICENSE`) | three 0.160.0 | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` | same tarball | MIT |

## How three was vendored

1. `npm view three@0.160.0 dist.integrity` returned the registry value above.
2. `npm pack three@0.160.0`, then `openssl dgst -sha512 -binary three-0.160.0.tgz | base64` produced the same
   `sha512-...` value, so the tarball is the one the registry published.
3. `package/build/three.module.min.js` (670,681 bytes, self-contained ES module with no `import` statements) and
   `package/LICENSE` were copied unchanged. The version stays pinned to 0.160.0.

`index.html` loads the module through its inline import map:
`{"imports":{"three":"./vendor/three/three.module.min.js"}}`.

## What is deliberately not here

GSAP and ScrollTrigger stay on the cdnjs CDN (with SRI). Their licence is an open owner question, so no GSAP
bytes are committed.

## Page images

The images under `assets/img/` are not vendored libraries. They were extracted from the previous inline base64
data URIs with `tools/extract-assets.mjs` (`node tools/extract-assets.mjs --verify` proves the extracted files
are byte-identical to the decoded originals). See `assets/PROVENANCE.md`.
