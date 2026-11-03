# Guider (`/guider/<slug>`)

Hver guide er én fil her: `content/guider/<slug>.md`. Filnavnet er adressen (`fordeling-av-innbo.md` blir
`https://www.arvklart.no/guider/fordeling-av-innbo`). Det er det eneste stedet en guide legges inn.

Ved bygging (`npm run build`, `src/seo/vitePlugin.js`) blir hver **publiserte** guide automatisk:
- en forhåndsrendret side med teksten i HTML-en (`dist/guider/<slug>.html`), med H1, forfatter, datoer, kilder,
  relaterte sider, brødsmulesti og strukturerte data (`Article` og `BreadcrumbList`)
- en oppføring i `sitemap.xml` (med `lastmod` = `updated`, ellers `published`)
- kjent for appen i nettleseren (tittel og canonical ved navigering)

Ingen endring i `vercel.json`, sitemap eller andre lister. Utkast (`status: draft`) bygges aldri og gir 404.

## Metadata øverst i filen

| Felt | Påkrevd | Beskrivelse |
|---|---|---|
| `title` | ja | Tittel (H1 og `<title>`) |
| `description` | ja | Meta description, høyst 200 tegn |
| `status` | ja | `draft` eller `published` |
| `author` | ja | Forfatter (`Arvklart` gir organisasjon i strukturerte data, ellers person) |
| `published` | ved `published` | Publiseringsdato `ÅÅÅÅ-MM-DD` |
| `updated` | nei | Dato for siste **innholdsendring** (ikke retting av skrivefeil). Gir `lastmod` |
| `canonical` | nei | Bare hvis en annen adresse på `https://www.arvklart.no` er den kanoniske |
| `og_image` | nei | Delingsbilde, sti på nettstedet (standard `/hero-bg.jpg`) |
| `schema` | nei | `article` (standard) eller `none` (ingen strukturerte data) |
| `sources` | nei | Liste: `  - Tittel | https://…` |
| `related` | nei | Liste med interne stier som skal lenkes til nederst |

## Tekst (Markdown)
Avsnitt, `##` og `###` overskrifter (H1 er tittelen), punktlister (`-`), nummererte lister (`1.`), sitat (`>`),
`**fet**`, `*kursiv*` og lenker `[tekst](/intern-sti)` eller `[tekst](https://…)`. Rå HTML vises som tekst.
Interne lenker må gå til en publisert side; ellers stopper bygget.

## Forhåndsvisning
Sett `status: published` på en egen gren og åpne Vercel-forhåndsvisningen (`/guider/<slug>`). Først når grenen
flettes til `main`, er guiden publisert. Feil i metadata eller lenker stopper bygget med en tydelig melding.
