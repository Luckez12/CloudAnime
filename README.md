# CloudAnime

Repo provider anime untuk VUEO/Nuvio. Setup awal ini belum mengandungi provider.

## Skop

- Anime dengan audio Jepun sahaja; tiada dub.
- Sari kata English, Malay atau Indonesian apabila tersedia.
- Setiap provider baharu perlu diuji untuk padanan tajuk, musim, episod dan playback.

## Manifest

Untuk repo `kurato-svg/CloudAnime` pada branch `main`:

`https://raw.githubusercontent.com/kurato-svg/CloudAnime/main/manifest.json`

Manifest kosong adalah disengajakan; belum ada sumber untuk dimainkan.

## Struktur

- `manifest.json`: senarai provider.
- `providers/`: fail JavaScript provider.
- `scripts/validate.mjs`: semakan manifest dan sintaks provider.

## Workflow

Fail `apply-zip-patch.yml` diberikan berasingan dan diletakkan di
`.github/workflows/apply-zip-patch.yml`.
Workflow menerima satu ZIP pada branch `main`, mengekstrak ke root,
menjalankan validation, kemudian commit perubahan dan membuang ZIP yang sudah diproses.
Untuk run manual, isi `zip_file` jika terdapat lebih daripada satu ZIP.
GitHub Actions memerlukan kebenaran menulis kandungan repository.

Jalankan semakan tempatan dengan `npm run validate`.
