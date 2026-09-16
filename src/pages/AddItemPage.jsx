import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCategories, uploadImage, supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${name} feilet: ${res.status}`)
  return res.json()
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve(ev.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function AddItemPage({ session, profile, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('good')
  const [imageFiles, setImageFiles] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [aiEstimate, setAiEstimate] = useState(null)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseYear, setPurchaseYear] = useState('')
  const [myEstimateVote, setMyEstimateVote] = useState(null) // 'agree' | 'disagree'
  const fileRef = useRef()

  useEffect(() => {
    getCategories(id).then(({ data }) => {
      setCategories(data || [])
      if (data?.length) setCategoryId(data[0].id)
    })
  }, [id])

  const handleImages = (e) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > MAX_IMAGE_SIZE) { onToast(`"${f.name}" er for stor (maks 10 MB)`, 'error'); return false }
      return true
    }).slice(0, 5)
    if (!files.length) return
    const newFiles = [...imageFiles, ...files].slice(0, 5)
    setImageFiles(newFiles)
    newFiles.forEach((file, i) => {
      if (imagePreviews[i]) return
      const reader = new FileReader()
      reader.onload = ev => setImagePreviews(prev => {
        const next = [...prev]
        next[i] = ev.target.result
        return next
      })
      reader.readAsDataURL(file)
    })
  }

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const analyzeWithAI = async () => {
    if (!imageFiles[0]) return
    setAnalyzing(true)
    try {
      const imageBase64 = await fileToBase64(imageFiles[0])
      const result = await callEdgeFunction('analyze-item', {
        imageBase64,
        mimeType: imageFiles[0].type || 'image/jpeg',
      })
      if (result.title && !title) setTitle(result.title)
      if (result.description && !description) setDescription(result.description)
      if (result.condition) setCondition(result.condition)
      if (result.category) {
        const match = categories.find(c =>
          c.label.toLowerCase().includes(result.category.toLowerCase()) ||
          result.category.toLowerCase().includes(c.label.toLowerCase())
        )
        if (match) setCategoryId(match.id)
      }
      onToast('AI identifiserte gjenstanden ✓')
    } catch (e) {
      onToast('AI-analyse feilet — fyll inn manuelt', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  const getValueEstimate = async () => {
    if (!title.trim()) { onToast('Legg til navn på gjenstanden først', 'error'); return }
    setEstimating(true)
    try {
      const cat = categories.find(c => c.id === categoryId)
      const result = await callEdgeFunction('estimate-value', {
        title,
        description,
        category: cat?.label || '',
        condition,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : undefined,
        purchase_year: purchaseYear ? parseInt(purchaseYear) : undefined,
      })
      setAiEstimate(result)
    } catch (e) {
      onToast('Verdiestimering feilet', 'error')
    } finally {
      setEstimating(false)
    }
  }

  const save = async () => {
    if (!title.trim()) { onToast('Legg til navn på gjenstanden', 'error'); return }
    setSaving(true)
    try {
      const { data: newItem, error } = await supabase.from('items').insert({
        estate_id: id,
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        condition,
        added_by: session.user.id,
        added_by_name: profile?.display_name || '',
        status: 'active',
        image_url: null,
        estimated_value: aiEstimate?.likely_nok || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_year: purchaseYear ? parseInt(purchaseYear) : null,
        value_agree_count: myEstimateVote === 'agree' ? 1 : 0,
        value_disagree_count: myEstimateVote === 'disagree' ? 1 : 0,
        value_voter_ids: myEstimateVote ? [session.user.id] : [],
      }).select().single()

      if (error) throw error

      if (imageFiles.length > 0) {
        const urls = []
        for (const file of imageFiles) {
          try {
            const url = await uploadImage(file, newItem.id + '-' + Date.now())
            urls.push(url)
          } catch (e) { console.error('Bilde feilet:', e) }
        }
        if (urls.length > 0) {
          await supabase.from('items').update({
            image_url: urls[0],
            extra_images: urls.slice(1),
          }).eq('id', newItem.id)
        }
      }

      onToast('Gjenstand lagt til! ✓')
      navigate(`/estate/${id}`)
    } catch (e) {
      onToast('Feil: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatNOK = (n) => n ? new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n) : '—'

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px 100px', fontFamily: 'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>
        ← Tilbake
      </button>

      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>
        Legg til gjenstand
      </h1>
      <p style={{ color: '#9C8267', fontSize: '14px', marginBottom: '24px' }}>
        Fyll inn navn og ta gjerne bilde — AI kan identifisere og verdsette automatisk
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Bilder */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '8px' }}>
            Bilder (valgfri, maks 5)
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {imagePreviews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#E8DFD0' }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <button onClick={() => removeImage(i)} style={{
                  position: 'absolute', top: '2px', right: '2px',
                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: '20px', height: '20px',
                  cursor: 'pointer', fontSize: '12px', lineHeight: '1',
                }}>×</button>
              </div>
            ))}
            {imagePreviews.length < 5 && (
              <div onClick={() => fileRef.current.click()} style={{
                width: '80px', height: '80px', borderRadius: '8px',
                border: '2px dashed #D9CFC0', background: '#FBF9F5',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', gap: '4px',
              }}>
                <span style={{ fontSize: '20px', color: '#9C8267' }}>+</span>
                <span style={{ fontSize: '10px', color: '#9C8267' }}>Legg til</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleImages} style={{ display: 'none' }} />

          {/* AI-analyseknapp */}
          {imageFiles.length > 0 && (
            <button onClick={analyzeWithAI} disabled={analyzing} style={{
              marginTop: '10px', padding: '9px 16px', background: analyzing ? '#D9CFC0' : '#5F6E52',
              color: '#fff', border: 'none', borderRadius: '8px', cursor: analyzing ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {analyzing ? 'Analyserer…' : 'Analyser med AI'}
            </button>
          )}
        </div>

        {/* Navn */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '6px' }}>
            Navn på gjenstand *
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="f.eks. Bestemors gyngestol"
            autoFocus
            maxLength={200}
            style={{
              width: '100%', padding: '14px', border: '1px solid #D9CFC0',
              borderRadius: '10px', fontSize: '16px', background: '#FBF9F5',
              color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Kategori */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '6px' }}>
            Kategori
          </label>
          {categories.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9C8267' }}>Ingen kategorier ennå — <button onClick={() => navigate(`/estate/${id}/categories`)} style={{ background: 'none', border: 'none', color: '#5F6E52', cursor: 'pointer', fontFamily: 'Karla, sans-serif', fontSize: '13px', padding: 0, textDecoration: 'underline' }}>legg til kategorier</button></p>
          ) : (
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{
              width: '100%', padding: '14px', border: '1px solid #D9CFC0',
              borderRadius: '10px', fontSize: '16px', background: '#FBF9F5',
              color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif',
            }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          )}
        </div>

        {/* Tilstand */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '8px' }}>
            Tilstand
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['excellent','Utmerket'],['good','God'],['fair','Middels'],['poor','Dårlig']].map(([val, label]) => (
              <button key={val} onClick={() => setCondition(val)} style={{
                flex: 1, padding: '10px 4px',
                border: `2px solid ${condition === val ? '#3A2F26' : '#D9CFC0'}`,
                borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                fontFamily: 'Karla, sans-serif',
                background: condition === val ? '#3A2F26' : '#fff',
                color: condition === val ? '#FBF9F5' : '#5C4530',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Beskrivelse */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '6px' }}>
            Beskrivelse (valgfri)
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Materiale, farge, historikk, minner…"
            rows={3}
            maxLength={2000}
            style={{
              width: '100%', padding: '14px', border: '1px solid #D9CFC0',
              borderRadius: '10px', fontSize: '15px', fontFamily: 'Karla, sans-serif',
              background: '#FBF9F5', color: '#3A2F26', resize: 'none',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Kjøpspris og -år for verdiestimat */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '6px' }}>Kjøpspris (NOK, valgfri)</label>
            <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="f.eks. 5000"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #D9CFC0', borderRadius: '10px', fontSize: '15px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#9C8267', marginBottom: '6px' }}>Kjøpsår (valgfri)</label>
            <input type="number" value={purchaseYear} onChange={e => setPurchaseYear(e.target.value)} placeholder="f.eks. 2010"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #D9CFC0', borderRadius: '10px', fontSize: '15px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Verdiestimat-knapp */}
        {title.trim() && (
          <button onClick={getValueEstimate} disabled={estimating} style={{
            padding: '11px 18px', background: estimating ? '#D9CFC0' : '#8B9A7D',
            color: '#fff', border: 'none', borderRadius: '8px', cursor: estimating ? 'not-allowed' : 'pointer',
            fontSize: '14px', fontFamily: 'Karla, sans-serif',
          }}>
            {estimating ? 'Estimerer…' : 'Få verdiestimat'}
          </button>
        )}

        {/* Verdiestimat-resultat */}
        {aiEstimate && (
          <div style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: '#3A5A30', fontWeight: '500', marginBottom: '12px' }}>AI Verdiestimat (NOK)</div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#9C8267', marginBottom: '2px' }}>Lavt</div>
                <div style={{ fontSize: '18px', color: '#3A2F26', fontFamily: 'Fraunces, serif' }}>{formatNOK(aiEstimate.low_nok)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#9C8267', marginBottom: '2px' }}>Mest sannsynlig</div>
                <div style={{ fontSize: '22px', color: '#3A5A30', fontFamily: 'Fraunces, serif', fontWeight: '500' }}>{formatNOK(aiEstimate.likely_nok)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#9C8267', marginBottom: '2px' }}>Høyt</div>
                <div style={{ fontSize: '18px', color: '#3A2F26', fontFamily: 'Fraunces, serif' }}>{formatNOK(aiEstimate.high_nok)}</div>
              </div>
            </div>
            {aiEstimate.reasoning && <p style={{ fontSize: '12px', color: '#5C4530', lineHeight: '1.5', marginBottom: '8px' }}>{aiEstimate.reasoning}</p>}

            {/* Voting */}
            <div style={{ borderTop: '1px solid #B8C8A8', paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ fontSize: '12px', color: '#5C4530', marginBottom: '8px' }}>Er du enig i estimatet?</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setMyEstimateVote(myEstimateVote === 'agree' ? null : 'agree')} style={{
                  flex: 1, padding: '9px', border: `2px solid ${myEstimateVote === 'agree' ? '#5F6E52' : '#B8C8A8'}`,
                  borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
                  background: myEstimateVote === 'agree' ? '#5F6E52' : '#fff',
                  color: myEstimateVote === 'agree' ? '#fff' : '#5C4530',
                  fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>👍 Enig</button>
                <button onClick={() => setMyEstimateVote(myEstimateVote === 'disagree' ? null : 'disagree')} style={{
                  flex: 1, padding: '9px', border: `2px solid ${myEstimateVote === 'disagree' ? '#A97C3F' : '#B8C8A8'}`,
                  borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
                  background: myEstimateVote === 'disagree' ? '#A97C3F' : '#fff',
                  color: myEstimateVote === 'disagree' ? '#fff' : '#5C4530',
                  fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>👎 Uenig</button>
              </div>
              {myEstimateVote && (
                <p style={{ fontSize: '11px', color: '#5C4530', marginTop: '6px', marginBottom: 0 }}>
                  {myEstimateVote === 'agree' ? 'Stemmen din lagres — andre arvinger kan også stemme.' : 'Stemmen din lagres — andre arvinger kan også stemme.'}
                </p>
              )}
            </div>

            <p style={{ fontSize: '11px', color: '#9C8267', marginTop: '8px', marginBottom: 0 }}>Estimater er kun veiledende — ikke profesjonell takst.</p>
          </div>
        )}

      </div>

      {/* Fast lagreknapp nederst */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '16px', background: '#fff',
        borderTop: '1px solid #D9CFC0',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        zIndex: 100,
      }}>
        <button
          onClick={save}
          disabled={saving || !title.trim()}
          style={{
            width: '100%', maxWidth: '560px', display: 'block', margin: '0 auto',
            padding: '16px',
            background: title.trim() ? '#3A2F26' : '#D9CFC0',
            color: '#FBF9F5', border: 'none', borderRadius: '10px',
            cursor: title.trim() ? 'pointer' : 'not-allowed',
            fontSize: '16px', fontFamily: 'Karla, sans-serif', fontWeight: '500',
          }}
        >
          {saving ? 'Lagrer…' : '✓ Lagre gjenstand'}
        </button>
      </div>
    </div>
  )
}
