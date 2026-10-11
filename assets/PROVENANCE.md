# Asset provenance

Every file under `assets/` is derived only from brand assets that already existed in the repo. No new artwork,
text or photography was added. Entries are appended as steps add assets.

## E4: share image and static icons

Source: `index.html` at commit `a20e3de` (sha256 prefix `f2bdf5c0442b99c3`), the embedded base64 data URIs:

- hero image: the first `data:image/webp;base64,...` (class `h-respaldo`, 1536x1024, lossless WebP with alpha),
- favicon: the `data:image/svg+xml;base64,...` in `<link rel="icon">` (the NAVE "NV" monogram path data).

Tool: Node + `sharp` 0.35.5 (libvips), run from a scratch directory outside the repo. `sharp` writes no
EXIF, XMP, ICC or text chunks unless asked, so the outputs carry no metadata (verified, see below).

| File | Size | Derivation |
|------|------|------------|
| `og/nave-og-1200x630.jpg` | 1200x630 JPEG | Hero resized to height 630 (945x630), centered on a flat `#572333` (`--granate`) 1200x630 canvas, flattened, mozjpeg quality 82, 4:2:0. |
| `icons/favicon.svg` | vector | Path data copied unchanged from the data-URI favicon. Only change: `fill="currentColor"` became `fill="#572333"` (`--granate`), because a standalone SVG favicon has no surrounding text colour to inherit. |
| `icons/favicon-32x32.png` | 32x32 PNG, transparent | `favicon.svg` rasterised by librsvg at high density, fitted into 32x32. |
| `icons/apple-touch-icon.png` | 180x180 PNG, opaque | `favicon.svg` rasterised to 124 px height, centered on a flat `#F7F5F0` (`--blanco`) 180x180 canvas (iOS has no transparency). |

Generation (sketch; `extract` = base64-decode the data URIs from the `a20e3de` blob into `img1.webp` and
`favicon.svg`):

```js
const hero = await sharp('img1.webp').resize({ height: 630 }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#572333' } })
  .composite([{ input: hero, gravity: 'center' }])
  .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' })
  .toFile('assets/og/nave-og-1200x630.jpg');

const svg = fs.readFileSync('favicon.svg', 'utf8').replace('fill="currentColor"', 'fill="#572333"');
const iso = (h) => sharp(Buffer.from(svg), { density: 600 }).resize({ height: h, fit: 'inside' }).png().toBuffer();
await sharp(await iso(32)).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 }).toFile('assets/icons/favicon-32x32.png');
await sharp({ create: { width: 180, height: 180, channels: 3, background: '#F7F5F0' } })
  .composite([{ input: await iso(124), gravity: 'center' }])
  .png({ compressionLevel: 9 }).toFile('assets/icons/apple-touch-icon.png');
```

Checks run on the outputs: dimensions read with `sharp(...).metadata()`; no EXIF, XMP or ICC segment
reported; a raw byte scan for `Exif`, `XMP`, `tEXt`, `iTXt`, `zTXt`, `eXIf`, `iCCP`, `tIME`, `Photoshop`, `GPS`
found nothing. The OG image is well under the 200 KB budget.
