// Signerte bilde-URL-er (src/lib/imageUrls.js): sti fra lagret URL, samlet signering, hurtigbuffer og
// at bilder aldri forsvinner i overgangen (feil gir den lagrede URL-en).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { storagePath, createImageResolver, SIGN_SECONDS } from '../../src/lib/imageUrls.js'

const PUB = 'https://p.supabase.co/storage/v1/object/public/item-images/'
const est = '22222222-0000-0000-0000-000000000001'

function fakeClient({ fail = [], throws = false } = {}) {
  const calls = []
  return {
    calls,
    storage: { from: bucket => ({
      createSignedUrls: async (paths, secs) => {
        calls.push({ bucket, paths, secs })
        if (throws) throw new Error('nett')
        return { data: paths.map(p => (fail.includes(p) ? { path: p, error: 'Object not found', signedUrl: null } : { path: p, signedUrl: `https://p.supabase.co/storage/v1/object/sign/item-images/${p}?token=t` })), error: null }
      },
    }) },
  }
}

test('storagePath gir stien for bilder i item-images, og null for alt annet', () => {
  assert.equal(storagePath(`${PUB}${est}/item-1.jpg`), `${est}/item-1.jpg`)
  assert.equal(storagePath(`${PUB}items/gammel%20fil.jpg?t=1`), 'items/gammel fil.jpg')
  assert.equal(storagePath('https://images.unsplash.com/photo-1'), null)
  assert.equal(storagePath('data:image/jpeg;base64,AAA'), null)
  assert.equal(storagePath(null), null)
})

test('mange bilder samtidig signeres i ett kall, med 1 times varighet', async () => {
  const client = fakeClient()
  const resolve = createImageResolver(client)
  const urls = await Promise.all([`${PUB}${est}/a.jpg`, `${PUB}${est}/b.jpg`, `${PUB}${est}/a.jpg`].map(resolve))
  assert.equal(client.calls.length, 1)
  assert.deepEqual(client.calls[0].paths, [`${est}/a.jpg`, `${est}/b.jpg`])
  assert.equal(client.calls[0].secs, SIGN_SECONDS)
  assert.equal(client.calls[0].bucket, 'item-images')
  assert.match(urls[0], /\/object\/sign\/item-images\/.*a\.jpg\?token=/)
  assert.equal(urls[0], urls[2])
})

test('hurtigbufferen brukes til kort før utløp, deretter signeres på nytt', async () => {
  let t = 0
  const client = fakeClient()
  const resolve = createImageResolver(client, () => t)
  await resolve(`${PUB}${est}/a.jpg`)
  assert.ok(resolve.peek(`${PUB}${est}/a.jpg`), 'skal finnes i hurtigbufferen')
  t = (SIGN_SECONDS - 10 * 60) * 1000
  await resolve(`${PUB}${est}/a.jpg`)
  assert.equal(client.calls.length, 1, 'fortsatt gyldig')
  t = (SIGN_SECONDS - 60) * 1000
  assert.equal(resolve.peek(`${PUB}${est}/a.jpg`), null, 'snart utløpt')
  await resolve(`${PUB}${est}/a.jpg`)
  assert.equal(client.calls.length, 2)
})

test('andre adresser brukes som de er, uten kall', async () => {
  const client = fakeClient()
  const resolve = createImageResolver(client)
  assert.equal(await resolve('https://images.unsplash.com/photo-1'), 'https://images.unsplash.com/photo-1')
  assert.equal(await resolve('blob:http://x/1'), 'blob:http://x/1')
  assert.equal(resolve.peek('https://images.unsplash.com/photo-1'), 'https://images.unsplash.com/photo-1')
  assert.equal(await resolve(null), null)
  assert.equal(client.calls.length, 0)
})

test('feiler signeringen (f.eks. eldre fil utenfor boets mappe), vises den lagrede URL-en', async () => {
  const legacy = `${PUB}items/gammel.jpg`
  const resolve = createImageResolver(fakeClient({ fail: ['items/gammel.jpg'] }))
  assert.equal(await resolve(legacy), legacy)
  const broken = createImageResolver(fakeClient({ throws: true }))
  assert.equal(await broken(`${PUB}${est}/a.jpg`), `${PUB}${est}/a.jpg`)
})
