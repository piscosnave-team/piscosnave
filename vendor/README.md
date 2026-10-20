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

| CDN file | Version | SHA-512 SRI |
|----------|---------|-------------|
| `gsap.min.js` | GSAP 3.12.5 | `sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==` |
| `ScrollTrigger.min.js` | GSAP 3.12.5 | `sha512-onMTRKJBKz8M1TnqqDuGBlowlH0ohFzMXYRNebz+yOcc5TQr/zAKsthzhuv0hiyUKEiQEQXEynnXCvNTOk50dg==` |

The SRI values were checked against both the cdnjs API and the downloaded CDN bytes on 2026-10-20. `index.html`
also uses a CSP that permits only the pinned cdnjs GSAP directory, same-origin scripts, and hashes for its two
small executable inline blocks (the import map and age-gate boot script). Run `npm run csp -- --check` to verify
those CSP hashes after editing either inline block.

### Owner-approved GSAP self-hosting only

`node tools/vendor-gsap.mjs --write` downloads the two pinned CDN files into the gitignored `vendor/gsap/`
directory, verifies the values above, and prints the two tag and CSP changes to apply. It is never run in CI and
commits no GSAP bytes. **Do not run it until the owner has answered the GSAP commercial-use and redistribution
licence question.**

## Page images

The images under `assets/img/` are not vendored libraries. They were extracted from the previous inline base64
data URIs with `tools/extract-assets.mjs` (`node tools/extract-assets.mjs --verify` proves the extracted files
are byte-identical to the decoded originals). See `assets/PROVENANCE.md`.
