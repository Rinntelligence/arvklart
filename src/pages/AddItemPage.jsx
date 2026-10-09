import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCategories, supabase, signOut } from '../lib/supabase'
import { fileToDataUrl, uploadEstateImage } from '../lib/images'
import { hasAiConsent, giveAiConsent } from '../lib/aiConsent'
import { formatNOK } from '../lib/format'
import { L, isEn } from '../lib/lang'
import { categoryLabel } from '../lib/categories'
import { aiErrorMessage, analyzeItemPhotos, callEdgeFunction, valuationRecord } from '../lib/itemAi'
import { aiAnalysisRecord, aiSuggestion, applyAiSuggestion } from '../lib/itemAiHelpers'
import { CONDITION_OPTIONS, multipleItemsText } from '../lib/analysisView'
import AnalysisDetails from '../components/AnalysisDetails'
import { AiConsent, DemoNotice } from '../components/AiDialogs'
import CameraCapture from '../components/CameraCapture'

export default function AddItemPage({ session, profile, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('unknown') // ukjent til noen har vurdert den
  const [analysis, setAnalysis] = useState(null) // AI-vurderingen (lagres i ai_analysis)
  const [aiFilled, setAiFilled] = useState({}) // feltene AI-en har fylt inn, så brukerens egne valg ikke overskrives
  const [imageFiles, setImageFiles] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [aiEstimate, setAiEstimate] = useState(null)
  const [estimateMissing, setEstimateMissing] = useState(null) // «for lite informasjon»: tips om hva som mangler
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseYear, setPurchaseYear] = useState('')
  const [myEstimateVote, setMyEstimateVote] = useState(null) // 'agree' | 'disagree'
  const [aiConsented, setAiConsented] = useState(hasAiConsent)
  const [consentFor, setConsentFor] = useState(null) // 'analyze' | 'estimate' mens samtykket vises
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('📦')
  const [savingCat, setSavingCat] = useState(false)
  const [demoBlocked, setDemoBlocked] = useState(false)
  const [demoRemaining, setDemoRemaining] = useState(isDemo ? 5 : null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileRef = useRef()

  // Felles håndtering av svar og feil fra AI-funksjonene
  const trackQuota = (res) => { if (typeof res?.quota?.remaining === 'number') setDemoRemaining(res.quota.remaining) }
  const handleAiError = (e, fallback) => {
    if (e.code === 'demo_limit') { setDemoRemaining(0); setDemoBlocked(true); return }
    // Feilkoden oversettes på brukerens språk (serverens tekst er alltid norsk)
    onToast(e.code && e.code !== 'error' ? aiErrorMessage(e.code) : fallback, 'error')
  }

  const loadCategories = () => getCategories(id).then(({ data }) => {
    setCategories(data || [])
    if (data?.length && !categoryId) setCategoryId(data[0].id)
  })

  useEffect(() => { loadCategories() }, [id])

  const addCategory = async () => {
    if (!newCatLabel.trim()) return
    setSavingCat(true)
    const { data: newCat, error } = await supabase.from('categories').insert({ label: newCatLabel.trim(), emoji: newCatEmoji, estate_id: id }).select().single()
    setSavingCat(false)
    if (error) { onToast(L('Kunne ikke legge til kategorien', 'Could not add the category'), 'error'); return }
    setNewCatLabel(''); setNewCatEmoji('📦'); setShowAddCat(false)
    await loadCategories()
    if (newCat) setCategoryId(newCat.id)
  }

  // Fra filvelgeren (kamerarull/filer) eller kameraet i appen
  const addImages = (picked) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
    const files = picked.filter(f => {
      if (f.size > MAX_IMAGE_SIZE) { onToast(L(`"${f.name}" er for stor (maks 10 MB)`, `"${f.name}" is too large (max 10 MB)`), 'error'); return false }
      return true
    })
    if (!files.length) return
    const room = 5 - imageFiles.length
    const added = files.slice(0, room)
    if (files.length > room) onToast(L('Maks 5 bilder per gjenstand', 'Max 5 photos per item'), 'error')
    if (!added.length) return
    setImageFiles(prev => [...prev, ...added])
    // Forhåndsvisningene legges til i samme rekkefølge som filene
    Promise.all(added.map(fileToDataUrl)).then(urls => setImagePreviews(prev => [...prev, ...urls]))
  }

  const handleImages = (e) => {
    addImages(Array.from(e.target.files || []))
    e.target.value = ''
  }

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const analyzeWithAI = async () => {
    if (!imageFiles[0]) return
    if (isDemo && demoRemaining === 0) { setDemoBlocked(true); return }
    setAnalyzing(true)
    try {
      const { result, quota } = await analyzeItemPhotos(imageFiles, { categories, estateId: id })
      trackQuota({ quota })
      // AI fyller bare felt brukeren ikke har endret selv
      // Første kategori er forhåndsvalgt når siden lastes; den regnes ikke som brukerens eget valg
      const cur = { title, description, categoryId: aiFilled.categoryId === undefined && categoryId === categories[0]?.id ? '' : categoryId, condition, aiFilled }
      const { aiFilled: filled, ...changes } = applyAiSuggestion(cur, aiSuggestion(result, categories))
      if ('title' in changes) setTitle(changes.title)
      if ('description' in changes) setDescription(changes.description)
      if ('condition' in changes) setCondition(changes.condition)
      if ('categoryId' in changes) setCategoryId(changes.categoryId)
      setAiFilled(filled)
      setAnalysis(result.analysis || null)
      onToast(L('AI identifiserte gjenstanden ✓', 'AI identified the item ✓'))
    } catch (e) {
      handleAiError(e, L('AI-analyse feilet — fyll inn manuelt', 'AI analysis failed — fill in manually'))
    } finally {
      setAnalyzing(false)
    }
  }

  const getValueEstimate = async () => {
    if (!title.trim()) { onToast(L('Legg til navn på gjenstanden først', 'Add the item name first'), 'error'); return }
    if (isDemo && demoRemaining === 0) { setDemoBlocked(true); return }
    setEstimating(true)
    try {
      const cat = categories.find(c => c.id === categoryId)
      const res = await callEdgeFunction('estimate-value', {
        title,
        description,
        category: cat?.label || '',
        condition,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : undefined,
        purchase_year: purchaseYear ? parseInt(purchaseYear) : undefined,
        analysis, // bildeanalysen, så bildene ikke sendes igjen
        estate_id: id, // teller mot boets AI-budsjett
        lang: isEn() ? 'en' : 'no',
      })
      trackQuota(res)
      const d = res.data || res
      // For lite grunnlag: ingen verdi (aldri 0 kr), men tips om hva som kan hjelpe
      if (d.status === 'insufficient') { setAiEstimate(null); setEstimateMissing(d.missing || []); return }
      setEstimateMissing(null)
      setAiEstimate({
        low_nok: d.summary?.low_nok ?? d.low_nok,
        high_nok: d.summary?.high_nok ?? d.high_nok,
        likely_nok: d.summary?.likely_nok ?? d.likely_nok,
        reasoning: d.market?.reasoning ?? d.reasoning,
        confidence: d.market?.confidence ?? d.confidence,
        valuation: valuationRecord(d),
      })
    } catch (e) {
      handleAiError(e, L('Verdiestimering feilet', 'Value estimate failed'))
    } finally {
      setEstimating(false)
    }
  }

  const save = async () => {
    if (isDemo) { setDemoBlocked(true); return }
    if (!title.trim()) { onToast(L('Legg til navn på gjenstanden', 'Add the item name'), 'error'); return }
    setSaving(true)
    const aiRecord = aiAnalysisRecord({ analysis, aiFilled, title, description, categoryId, condition })
    // AI-ens anslag lagres for seg (veiledende), adskilt fra verdien
    if (aiRecord && aiEstimate?.valuation) aiRecord.valuation = aiEstimate.valuation
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
        estimate_reasoning: aiEstimate?.reasoning || null,
        estimate_confidence: aiEstimate?.confidence || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_year: purchaseYear ? parseInt(purchaseYear) : null,
        // AI-vurderingen og hva brukeren gjorde med forslagene; bare når AI-en har analysert gjenstanden
        ...(aiRecord ? { ai_analysis: aiRecord } : {}),
        value_agree_count: myEstimateVote === 'agree' ? 1 : 0,
        value_disagree_count: myEstimateVote === 'disagree' ? 1 : 0,
        value_voter_ids: myEstimateVote ? [session.user.id] : [],
      }).select().single()

      if (error) throw error

      let failedImages = imageFiles.length
      if (imageFiles.length > 0) {
        const urls = []
        for (const file of imageFiles) {
          try {
            urls.push(await uploadEstateImage(file, id))
          } catch (e) { console.error('Bilde feilet:', e) }
        }
        if (urls.length > 0) {
          const { error: imgError } = await supabase.from('items').update({
            image_url: urls[0],
            extra_images: urls.slice(1),
          }).eq('id', newItem.id)
          if (!imgError) failedImages -= urls.length
        }
      }

      if (failedImages > 0) onToast(L(`Gjenstanden er lagt til, men ${failedImages} ${failedImages === 1 ? 'bilde' : 'bilder'} kunne ikke lastes opp. Prøv igjen fra «Rediger».`, `The item was added, but ${failedImages} ${failedImages === 1 ? 'photo' : 'photos'} could not be uploaded. Try again from «Edit».`), 'error')
      else onToast(L('Gjenstand lagt til! ✓', 'Item added! ✓'))
      navigate(`/estate/${id}`)
    } catch (e) {
      onToast(L('Feil: ', 'Error: ') + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px 100px', fontFamily: 'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#75604B', cursor: 'pointer', fontSize: '0.875rem', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>
        {L('← Tilbake', '← Back')}
      </button>

      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.5rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>
        {L('Legg til gjenstand', 'Add item')}
      </h1>
      <p style={{ color: '#75604B', fontSize: '0.875rem', marginBottom: '12px' }}>
        {L('Fyll inn navn og ta gjerne bilde — AI kan identifisere og verdsette automatisk', 'Enter a name and add a photo if you can — AI can identify and value it automatically')}
      </p>
      <button onClick={() => navigate(`/estate/${id}/add-many`)} style={{
        width: '100%', textAlign: 'left', marginBottom: '24px', padding: '12px 14px', background: '#DCE3D2',
        border: '1px solid #B8C8A8', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Karla, sans-serif',
        fontSize: '0.875rem', color: '#3A5A30', lineHeight: 1.4,
      }}>
        <strong>{L('Mange gjenstander?', 'Many items?')}</strong>{' '}
        {L('Ta bilder av opptil 20 på en gang og la AI legge dem inn →', 'Photograph up to 20 at once and let AI add them →')}
      </button>

      {isDemo && (
        <div style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '10px', padding: '12px 14px', fontSize: '0.8125rem', color: '#3A5A30', lineHeight: 1.5, marginBottom: '20px' }}>
          {L('Prøv AI-analyse av bilde og verdiestimat i demoen.', 'Try AI photo analysis and value estimates in the demo.')}{' '}
          <strong>{L(`${demoRemaining} av 5 AI-forsøk igjen.`, `${demoRemaining} of 5 AI attempts left.`)}</strong>{' '}
          {L('Gjenstanden lagres ikke.', 'The item is not saved.')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Bilder */}
        <div>
          <div style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '8px' }}>
            {L('Bilder (valgfri, maks 5)', 'Photos (optional, max 5)')}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {imagePreviews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#E8DFD0' }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <button onClick={() => removeImage(i)} style={{
                  position: 'absolute', top: '2px', right: '2px',
                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: '20px', height: '20px',
                  cursor: 'pointer', fontSize: '0.75rem', lineHeight: '1',
                }}>×</button>
              </div>
            ))}
            {imagePreviews.length < 5 && <>
              <PhotoTile onClick={() => setCameraOpen(true)} label={L('Ta bilder', 'Take photos')} />
              <PhotoTile onClick={() => fileRef.current.click()} label={L('Velg bilder', 'Choose photos')} />
            </>}
          </div>
          {/* Uten capture-attributt: mobilen tilbyr kamerarull, kamera og filer */}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImages} style={{ display: 'none' }} />
          {cameraOpen && <CameraCapture photos={imagePreviews} onCapture={addImages} onRemovePhoto={removeImage} onClose={() => setCameraOpen(false)} />}

          {/* AI-analyseknapp */}
          {imageFiles.length > 0 && !consentFor && (
            <button onClick={() => aiConsented ? analyzeWithAI() : setConsentFor('analyze')} disabled={analyzing} style={{
              marginTop: '10px', padding: '9px 16px', background: analyzing ? '#D9CFC0' : '#5F6E52',
              color: '#fff', border: 'none', borderRadius: '8px', cursor: analyzing ? 'not-allowed' : 'pointer',
              fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {analyzing ? L('Analyserer…', 'Analysing…') : L('Analyser med AI', 'Analyse with AI')}
            </button>
          )}
          {consentFor === 'analyze' && <AiConsent onCancel={() => setConsentFor(null)} onAccept={() => { giveAiConsent(); setAiConsented(true); setConsentFor(null); analyzeWithAI() }} />}
          {analysis?.ai && multipleItemsText(analysis.ai) && (
            <p style={{ fontSize: '0.8125rem', color: '#8A4B2A', background: '#F3E3D3', borderRadius: '8px', padding: '8px 10px', margin: '10px 0 0', lineHeight: 1.5 }}>{multipleItemsText(analysis.ai)}</p>
          )}
          {analysis?.ai && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#5C4530', padding: '10px 0', minHeight: '44px', boxSizing: 'border-box' }}>{L('Hva AI-en så', 'What the AI saw')}</summary>
              <AnalysisDetails analysis={analysis} heading={false} />
            </details>
          )}
        </div>

        {/* Navn */}
        <div>
          <label htmlFor="additem-f1" style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '6px' }}>
            {L('Navn på gjenstand *', 'Item name *')}
          </label>
          <input id="additem-f1"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={L('f.eks. Bestemors gyngestol', 'e.g. Grandmother\'s rocking chair')}
            autoFocus
            maxLength={200}
            style={{
              width: '100%', padding: '14px', border: '1px solid #D9CFC0',
              borderRadius: '10px', fontSize: '1rem', background: '#FBF9F5',
              color: '#3A2F26', fontFamily: 'Karla, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Kategori */}
        <div>
          <div style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '8px' }}>
            {L('Kategori', 'Category')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCategoryId(c.id)} style={{
                padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8125rem',
                fontFamily: 'Karla, sans-serif', border: `2px solid ${categoryId === c.id ? '#3A2F26' : '#D9CFC0'}`,
                background: categoryId === c.id ? '#3A2F26' : '#FBF9F5',
                color: categoryId === c.id ? '#FBF9F5' : '#5C4530',
                transition: 'all 0.12s',
              }}>
                {categoryLabel(c.label)}
              </button>
            ))}
            {!isDemo && <button onClick={() => setShowAddCat(!showAddCat)} style={{
              padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8125rem',
              fontFamily: 'Karla, sans-serif', border: '2px dashed #D9CFC0',
              background: 'transparent', color: '#75604B',
            }}>
              {L('+ Ny kategori', '+ New category')}
            </button>}
          </div>

          {showAddCat && (
            <div style={{ marginTop: '12px', background: '#FBF9F5', border: '1px solid #D9CFC0', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  value={newCatLabel}
                  onChange={e => setNewCatLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder={L('Kategorinavn…', 'Category name…')}
                  maxLength={60}
                  autoFocus
                  style={{
                    flex: 1, padding: '8px 12px', border: '1px solid #D9CFC0', borderRadius: '8px',
                    fontSize: '0.875rem', background: '#fff', color: '#3A2F26', fontFamily: 'Karla, sans-serif',
                  }}
                />
                <button onClick={addCategory} disabled={!newCatLabel.trim() || savingCat} style={{
                  padding: '8px 14px', background: newCatLabel.trim() ? '#3A2F26' : '#D9CFC0', color: '#FBF9F5',
                  border: 'none', borderRadius: '8px', cursor: newCatLabel.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', whiteSpace: 'nowrap',
                }}>
                  {savingCat ? '…' : L('Legg til', 'Add')}
                </button>
                <button onClick={() => { setShowAddCat(false); setNewCatLabel('') }} style={{
                  padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#75604B', fontSize: '1rem',
                }}>×</button>
              </div>
            </div>
          )}
        </div>

        {/* Tilstand */}
        <div>
          <div style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '8px' }}>
            {L('Tilstand', 'Condition')}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CONDITION_OPTIONS().map(({ value: val, label }) => (
              <button key={val} onClick={() => setCondition(val)} aria-pressed={condition === val} style={{
                flex: '1 1 60px', padding: '10px 4px', minHeight: '44px',
                border: `2px solid ${condition === val ? '#3A2F26' : '#D9CFC0'}`,
                borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem',
                fontFamily: 'Karla, sans-serif',
                background: condition === val ? '#3A2F26' : '#fff',
                color: condition === val ? '#FBF9F5' : '#5C4530',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Beskrivelse */}
        <div>
          <label htmlFor="additem-f2" style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '6px' }}>
            {L('Beskrivelse (valgfri)', 'Description (optional)')}
          </label>
          <textarea id="additem-f2"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={L('Materiale, farge, historikk, minner…', 'Material, colour, history, memories…')}
            rows={3}
            maxLength={2000}
            style={{
              width: '100%', padding: '14px', border: '1px solid #D9CFC0',
              borderRadius: '10px', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif',
              background: '#FBF9F5', color: '#3A2F26', resize: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Kjøpspris og -år for verdiestimat */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="additem-f3" style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '6px' }}>{L('Kjøpspris (NOK, valgfri)', 'Purchase price (NOK, optional)')}</label>
            <input id="additem-f3" type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder={L('f.eks. 5000', 'e.g. 5000')}
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #9A8B78', borderRadius: '10px', fontSize: '0.9375rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="additem-f4" style={{ display: 'block', fontSize: '0.8125rem', color: '#75604B', marginBottom: '6px' }}>{L('Kjøpsår (valgfri)', 'Year of purchase (optional)')}</label>
            <input id="additem-f4" type="number" value={purchaseYear} onChange={e => setPurchaseYear(e.target.value)} placeholder={L('f.eks. 2010', 'e.g. 2010')}
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #9A8B78', borderRadius: '10px', fontSize: '0.9375rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Verdiestimat-knapp */}
        {consentFor === 'estimate' && <AiConsent onCancel={() => setConsentFor(null)} onAccept={() => { giveAiConsent(); setAiConsented(true); setConsentFor(null); getValueEstimate() }} />}

        {title.trim() && !consentFor && (
          <button onClick={() => aiConsented ? getValueEstimate() : setConsentFor('estimate')} disabled={estimating} style={{
            padding: '11px 18px', background: estimating ? '#D9CFC0' : '#8B9A7D',
            color: '#fff', border: 'none', borderRadius: '8px', cursor: estimating ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', fontFamily: 'Karla, sans-serif',
          }}>
            {estimating ? L('Estimerer…', 'Estimating…') : L('Få verdiestimat', 'Get value estimate')}
          </button>
        )}

        {estimateMissing && !aiEstimate && (
          <p role="status" style={{ fontSize: '0.8125rem', color: '#5C4530', background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '10px 12px', margin: 0, lineHeight: 1.5 }}>
            {L('For lite informasjon til å anslå verdi.', 'Too little information to estimate a value.')}
            {estimateMissing.length > 0 && <> {L('Dette kan hjelpe', 'This could help')}: {estimateMissing.join('; ')}.</>}
          </p>
        )}

        {/* Verdiestimat-resultat */}
        {aiEstimate && (
          <div style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '0.8125rem', color: '#3A5A30', fontWeight: '500', marginBottom: '12px' }}>{L('Veiledende AI-anslag (NOK)', 'Indicative AI estimate (NOK)')}</div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: '#75604B', marginBottom: '2px' }}>{L('Lavt', 'Low')}</div>
                <div style={{ fontSize: '1.125rem', color: '#3A2F26', fontFamily: 'Fraunces, serif' }}>{formatNOK(aiEstimate.low_nok)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: '#75604B', marginBottom: '2px' }}>{L('Mest sannsynlig', 'Most likely')}</div>
                <div style={{ fontSize: '1.375rem', color: '#3A5A30', fontFamily: 'Fraunces, serif', fontWeight: '500' }}>{formatNOK(aiEstimate.likely_nok)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: '#75604B', marginBottom: '2px' }}>{L('Høyt', 'High')}</div>
                <div style={{ fontSize: '1.125rem', color: '#3A2F26', fontFamily: 'Fraunces, serif' }}>{formatNOK(aiEstimate.high_nok)}</div>
              </div>
            </div>
            {aiEstimate.reasoning && <p style={{ fontSize: '0.75rem', color: '#5C4530', lineHeight: '1.5', marginBottom: '8px' }}>{aiEstimate.reasoning}</p>}

            {/* Voting */}
            <div style={{ borderTop: '1px solid #B8C8A8', paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.75rem', color: '#5C4530', marginBottom: '8px' }}>{L('Er du enig i estimatet?', 'Do you agree with the estimate?')}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setMyEstimateVote(myEstimateVote === 'agree' ? null : 'agree')} style={{
                  flex: 1, padding: '9px', border: `2px solid ${myEstimateVote === 'agree' ? '#5F6E52' : '#B8C8A8'}`,
                  borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                  background: myEstimateVote === 'agree' ? '#5F6E52' : '#fff',
                  color: myEstimateVote === 'agree' ? '#fff' : '#5C4530',
                  fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>{L('Enig', 'Agree')}</button>
                <button onClick={() => setMyEstimateVote(myEstimateVote === 'disagree' ? null : 'disagree')} style={{
                  flex: 1, padding: '9px', border: `2px solid ${myEstimateVote === 'disagree' ? '#A97C3F' : '#B8C8A8'}`,
                  borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem',
                  background: myEstimateVote === 'disagree' ? '#A97C3F' : '#fff',
                  color: myEstimateVote === 'disagree' ? '#fff' : '#5C4530',
                  fontFamily: 'Karla, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>{L('Uenig', 'Disagree')}</button>
              </div>
              {myEstimateVote && (
                <p style={{ fontSize: '0.6875rem', color: '#5C4530', marginTop: '6px', marginBottom: 0 }}>
                  {L('Stemmen din lagres — andre arvinger kan også stemme.', 'Your vote is saved — other heirs can vote too.')}
                </p>
              )}
            </div>

            <p style={{ fontSize: '0.6875rem', color: '#75604B', marginTop: '8px', marginBottom: 0 }}>{L('Anslaget er laget av AI ut fra det som er registrert, og er ikke en dokumentert markedsverdi eller takst.', 'The estimate is made by AI from what has been registered, and is not a documented market value or appraisal.')}</p>
          </div>
        )}

      </div>

      {/* Fast lagreknapp nederst */}
      <div className="bottom-bar" style={{
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
            fontSize: '1rem', fontFamily: 'Karla, sans-serif', fontWeight: '500',
          }}
        >
          {saving ? L('Lagrer…', 'Saving…') : L('✓ Lagre gjenstand', '✓ Save item')}
        </button>
      </div>

      {demoBlocked && <DemoNotice onClose={() => setDemoBlocked(false)} onSignup={async () => { await signOut(); navigate('/logg-inn') }} />}
    </div>
  )
}

function PhotoTile({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: '80px', height: '80px', borderRadius: '8px',
      border: '2px dashed #D9CFC0', background: '#FBF9F5',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', gap: '4px', padding: 0,
      fontFamily: 'Karla, sans-serif',
    }}>
      <span style={{ fontSize: '1.25rem', color: '#75604B' }}>+</span>
      <span style={{ fontSize: '0.6875rem', color: '#75604B' }}>{label}</span>
    </button>
  )
}
