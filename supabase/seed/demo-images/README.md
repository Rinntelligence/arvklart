# Bilder til demoboet

Bildene til gjenstandene i `seed/demo_estate.sql`, lagret i repoet så demoen ikke henter bilder fra andre nettsteder (innholdsreglene i `vercel.json` tillater bare bilder fra Supabase-prosjektet).

- Filnavnet er gjenstandens id-prefiks (`face0001.jpg` → `face0001-0000-0000-0000-000000000001`, `db1836d7.jpg` → gitaren).
- Ingen bilder kan ha EXIF/GPS, XMP, IPTC eller kommentarer; `test/lib/demoContent.test.js` sjekker det, og at hver fil står i tabellen under med kilde.
- De lastes opp til den private bøtten `item-images` som `deed0001-0000-0000-0000-000000000001/demo__<gjenstand>.jpg` med `upload_demo_images.mjs` (se toppen av skriptet), og vises med signerte URL-er som alle andre bilder.
- Kilde: Unsplash (lastet ned 2026-10-25, 600 px bredde, uten EXIF). Brukt etter [Unsplash-lisensen](https://unsplash.com/license), som tillater gratis bruk uten kreditering.

| Fil | Unsplash-bilde |
|---|---|
| `face0001.jpg` | `photo-1506439773649-6e0eb8cfb237` |
| `face0002.jpg` | `photo-1555041469-a586c61ea9bc` |
| `face0003.jpg` | `photo-1481627834876-b7833e8f5570` |
| `face0004.jpg` | `photo-1579783902614-a3fb3927b6a5` |
| `face0006.jpg` | `photo-1606800052052-a08af7148866` |
| `face0008.jpg` | `photo-1593305841991-05c297ba4575` |
| `face0010.jpg` | `photo-1560472354-b33ff0c44a43` |
| `face0012.jpg` | `photo-1558618666-fcd25c85cd64` |
| `db1836d7.jpg` | Familiens eget bilde av gitaren, gitt til demoen av Bård 2026-11-09. Skalert til 600 px og lagret på nytt uten metadata (ingen EXIF/GPS, XMP, ICC eller kommentarer). Ingen personer eller private detaljer. |

Gjenstandene `face0005`, `face0007`, `face0009` og `face0011` har ikke bilde: Unsplash-bildene de pekte på, finnes ikke lenger (404) eller viste noe annet.

**Gitaren (`db1836d7`, «Sigma akustisk gitar»):** bildet over lastes opp som `deed0001-…/demo__db1836d7.jpg` (med
`upload_demo_images.mjs db1836d7 --apply`, eller i Supabase-dashbordet under Storage → item-images → `deed0001-…`, med
nøyaktig det filnavnet). `20261109210000_demo_content_fixes.sql` kobler bildet til gitaren bare når fila finnes i
bøtten, så last opp først og kjør migreringen etterpå (eller kjør den på nytt). Den slettede originalfila brukes ikke.
