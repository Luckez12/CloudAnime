# CloudAnime

Repo provider anime untuk VUEO/Nuvio: audio Jepun + sub sahaja, tiada dub.

Manifest: https://raw.githubusercontent.com/Luckez12/CloudAnime/main/manifest.json

## Migrasi v1.1.0

16 provider khusus anime disalin dari Cloudbank v1.20.11. Cloudbank tidak diubah.
Mapping TMDB, musim/episod, extractor, header, timeout dan format paparan PlayIMDb sedia ada dikekalkan.

Hasil ditapis sebelum format paparan: dub, dual/multi audio dan audio yang tidak dapat dikenal pasti dikecualikan.
HiAnime dipaksa menggunakan sub; Reanime hanya meminta laluan sub.
Provider lain mungkin masih meminta sub/dub upstream tetapi hanya hasil sub/audio Jepun yang dikenal pasti boleh dipaparkan.
Sari kata luaran ditapis kepada English, Malay dan Indo. Hardsub sedia ada tidak boleh diubah atau ditapis melalui senarai sari kata.

Ini boleh mengurangkan link daripada provider yang tidak melabel audio. Label sub upstream bukan pemeriksaan track audio video.
Sintaks, pemuatan modul, filter dan struktur diuji; playback sebenar belum diuji dalam VUEO.

## Workflow

`.github/workflows/apply-zip-patch.yml` mengurus ekstrak ZIP dan commit.
`.github/workflows/validate-cloudanime.yml` menjalankan validation selepas apply berjaya.
YML dikekalkan berasingan; patch provider tidak mengandungi YML.

## Semakan

`npm ci --ignore-scripts`, `npm run validate`, `npm test`.

## Attribution

Lihat sourceRepository/sourceCommit dalam manifest dan docs/migration-sources.json.
Lesen GPL-3.0 upstream disertakan. Komen sumber asal dikekalkan.
