// Demoinnholdet i «Fam. Hansen sitt bo»: tekstene skal passe til gjenstanden og bildet, og bildene i repoet skal være
// uten personopplysninger (EXIF/GPS, XMP, IPTC). Rettelsene står både i seed-fila og i den siste migreringen med
// reset_demo_estate(), så de overlever nye demoinnlogginger.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const read = p => readFileSync(new URL(p, root), 'utf8')
const SEED = read('supabase/seed/demo_estate.sql')
const MIGRATIONS = readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort()
// Den siste migreringen som lager reset_demo_estate(), er den som gjelder
const resetFile = [...MIGRATIONS].reverse().find(f => read(`supabase/migrations/${f}`).includes('create or replace function public.reset_demo_estate()'))
const RESET = (() => {
  const s = read(`supabase/migrations/${resetFile}`)
  const start = s.indexOf('create or replace function public.reset_demo_estate()')
  return s.slice(start, s.indexOf('$$;', start))
})()

// Ønskene i nullstillingen: (gjenstand, hvem, begrunnelse)
const resetWishes = [...RESET.matchAll(/\('([0-9a-f]{8})-[0-9a-f-]+'::uuid, '(\w+)'\s*,\s+'([^']+)'\)/g)].map(m => ({ item: m[1], who: m[2], reason: m[3] }))
const seedItem = id => {
  const i = SEED.indexOf(`('${id}-`)
  return SEED.slice(i, SEED.indexOf('),', i))
}

describe('demoinnholdet', () => {
  test('nullstillingen er den nyeste og har ønskene', () => {
    assert.equal(resetFile, '20261109210000_demo_content_fixes.sql')
    assert.ok(resetWishes.length >= 12, `fant ${resetWishes.length} ønsker`)
    // Sikkerheten fra 20261109190000 er beholdt: bare demomerket, sperre mot kontoer i andre bo
    assert.match(RESET, /raw_app_meta_data ->> 'arvklart_demo' = v_role/)
    assert.match(RESET, /er medlem eller eier i et annet bo; den røres ikke/)
    assert.doesNotMatch(RESET, /heirsplit/)
  })

  test('sofaen beskrives som en sofa, ikke et spisebord, i seed og i ønskene', () => {
    const sofa = seedItem('face0002')
    assert.match(sofa, /'Grønn 3-seters sofa'/)
    assert.match(sofa, /sofa i mørkegrønn velur/)
    assert.doesNotMatch(sofa, /spisebord|eik|bord/i)
    for (const w of resetWishes.filter(w => w.item === 'face0002')) assert.doesNotMatch(w.reason, /spisebord|bord/i, w.reason)
    assert.equal(resetWishes.filter(w => w.item === 'face0002').length, 1)
    assert.doesNotMatch(read('src/pages/LandingPage.jsx'), /eiketresbord/i)
  })

  test('serviset har ingen oppdiktet antall deler, produsent eller modell', () => {
    const servise = seedItem('face0009')
    assert.match(servise, /'Middagsservise'/)
    assert.doesNotMatch(servise, /\d+\s*deler|stavangerflint|flint blue|figgjo|porsgrund/i)
    for (const w of resetWishes.filter(w => w.item === 'face0009')) assert.doesNotMatch(w.reason, /stavangerflint|flint|\d+ deler/i, w.reason)
  })

  test('gifteringene, maleriet og albumet har tekst som passer til gjenstanden', () => {
    assert.match(seedItem('face0006'), /'Gifteringer i gull, 2 stk\.'/)
    for (const w of resetWishes.filter(w => w.item === 'face0006')) assert.doesNotMatch(w.reason, /\bur\b|klokke/i, w.reason)
    assert.doesNotMatch(seedItem('face0004'), /Andreassen|80×120|Fjord/)
    assert.match(seedItem('face0012'), /'Familiealbum 1954–1959'/)
    assert.match(read('supabase/seed/demo-images/README.md'), /`db1836d7\.jpg`/)
    assert.doesNotMatch(seedItem('face0012'), /Singer|sykmaskin/i)
  })

  test('eksempelsvarene: Kari og Lars har svart med minner, flere ønsker det samme, og Mona (den besøkende) svarer selv', () => {
    const per = {}
    for (const w of resetWishes) (per[w.item] ||= new Set()).add(w.who)
    assert.deepEqual(new Set(resetWishes.map(w => w.who)), new Set(['kari', 'lars']), 'Mona skal ikke ha forhåndsutfylte ønsker')
    const both = Object.entries(per).filter(([, s]) => s.size === 2).map(([i]) => i).sort()
    assert.ok(['face0001', 'face0004', 'face0012'].every(i => both.includes(i)), `gyngestolen, maleriet og albumet ønskes av begge: ${both}`)
    assert.ok(Object.values(per).filter(s => s.size === 1).length >= 4, 'flere gjenstander som bare én ønsker')
    assert.ok(resetWishes.filter(w => /mamma|pappa|bestemor|barndom|barna|minne/i.test(w.reason)).length >= 6, 'begrunnelser med minner')
    assert.ok(resetWishes.some(w => /tar vi en prat|snakke sammen|bli enige/i.test(w.reason)), 'samarbeid')
    for (const w of resetWishes) {
      assert.ok(w.reason.length <= 120, `for lang: ${w.reason}`)
      assert.doesNotMatch(w.reason, /\bkr\b|kroner|arvklart|juridisk|rett til/i, w.reason) // ingen priser, løfter eller påstander om fordelingen
    }
  })

  test('banneret sier hvem den besøkende er, og forsiden viser utgangspunktet, ikke en ferdig fordeling', () => {
    assert.match(read('src/App.jsx'), /Du er Mona, en av tre arvinger og administrator; Kari og Lars har allerede svart\./)
    const landing = read('src/pages/LandingPage.jsx')
    const at = landing.indexOf('className="demo-mockup"')
    const mock = landing.slice(at, landing.indexOf('</section>', at))
    assert.match(mock, /10 gjenstander · 3 arvinger/)
    assert.doesNotMatch(mock, /Tildelt|ble enige|Avklart|eiketresbord|Erik/, 'illustrasjonen viser noe nullstillingen fjerner eller som ikke finnes i demoen')
  })

  test('seed og nullstilling har de samme ønsketekstene', () => {
    for (const w of resetWishes.filter(w => w.item !== 'db1836d7')) {
      assert.ok(SEED.includes(`'${w.reason}'`), `seed mangler «${w.reason}»`)
    }
  })

  test('migreringen retter bare feltene med feil tekst, og kobler gitarbildet bare når fila finnes', () => {
    const m = read('supabase/migrations/20261109210000_demo_content_fixes.sql')
    assert.match(m, /description ilike '%spisebord%'/)
    assert.match(m, /description ilike '%Andreassen%'/)
    assert.match(m, /perform public\.reset_demo_estate\(\)/)
    assert.match(m, /title ~ '\[0-9\]\+ \(deler\|stk\)'/)
    assert.match(m, /exists \(select 1 from storage\.objects where bucket_id = 'item-images' and name = v_estate::text \|\| '\/demo__db1836d7\.jpg'\)/)
    assert.match(m, /image_url is null/)
    assert.doesNotMatch(m, /(set|,)\s+(estimated_value|agreed_value|total_value)\s*=/)
  })
})

// JPEG-segmenter før bildedataene: APP1 (EXIF/XMP), APP13 (IPTC) og kommentarer kan inneholde sted, kamera og navn
function jpegMetadata(buf) {
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'ikke JPEG')
  const found = []
  for (let i = 2; i < buf.length - 4;) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xda || marker === 0xd9) break // bildedata starter
    const len = buf.readUInt16BE(i + 2)
    const id = buf.subarray(i + 4, i + 4 + 12).toString('latin1')
    if (marker === 0xe1) found.push(id.startsWith('Exif') ? 'EXIF' : id.startsWith('http://ns.adobe.com') ? 'XMP' : 'APP1')
    if (marker === 0xed) found.push('IPTC')
    if (marker === 0xfe) found.push('kommentar')
    i += 2 + len
  }
  return found
}

describe('bildene til demoen', () => {
  const dir = new URL('supabase/seed/demo-images/', root)
  const files = readdirSync(dir).filter(f => f.endsWith('.jpg'))
  const readme = read('supabase/seed/demo-images/README.md')

  test('ingen bilder har EXIF, XMP, IPTC eller kommentarer', () => {
    assert.ok(files.length >= 8)
    for (const f of files) assert.deepEqual(jpegMetadata(readFileSync(fileURLToPath(new URL(f, dir)))), [], f)
  })

  test('hvert bilde har kilde i README', () => {
    for (const f of files) assert.ok(readme.includes(`\`${f}\``), `${f} mangler i README.md`)
  })

  test('kontrollen finner EXIF i et bilde som har det', () => {
    const exif = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, ...Buffer.from('Exif\0\0MM\0*\0\0\0\x08'), 0xff, 0xda, 0, 2])
    assert.deepEqual(jpegMetadata(exif), ['EXIF'])
  })
})
