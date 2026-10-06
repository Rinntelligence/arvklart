import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getItem, getCategories, uploadImage, supabase } from '../lib/supabase'
import { L } from '../lib/lang'

export default function EditItemPage({ session, profile, onToast }) {
  const { id, itemId } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [categories, setCategories] = useState([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('good')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [existingImages, setExistingImages] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [newPreviews, setNewPreviews] = useState([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([getItem(itemId), getCategories(id)]).then(([{ data: it }, { data: cats }]) => {
      setItem(it)
      setTitle(it?.title || '')
      setCategoryId(it?.category_id || '')
      setDescription(it?.description || '')
      setCondition(it?.condition || 'good')
      setEstimatedValue(it?.estimated_value || '')
      const imgs = []
      if (it?.image_url) imgs.push(it.image_url)
      if (it?.extra_images?.length) imgs.push(...it.extra_images)
      setExistingImages(imgs)
      setCategories(cats || [])
    })
  }, [itemId])

  const handleNewImages = (e) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > MAX_IMAGE_SIZE) { onToast(`"${f.name}" er for stor (maks 10 MB)`, 'error'); return false }
      return true
    })
    const total = existingImages.length + newFiles.length + files.length
    if (total > 5) {
      onToast(`Maks 5 bilder totalt (har ${existingImages.length + newFiles.length})`, 'error')
      return
    }
    setNewFiles(prev => [...prev, ...files])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setNewPreviews(prev => [...prev, ev.target.result])
      reader.readAsDataURL(file)
    })
  }

  const removeExisting = (index) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index))
  }

  const removeNew = (index) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index))
    setNewPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const save = async () => {
    if (!title.trim()) { onToast(L('Legg til navn', 'Add a name'), 'error'); return }
    setSaving(true)
    try {
      const uploadedUrls = []
      for (const file of newFiles) {
        try {
          const url = await uploadImage(file, itemId + '-' + Date.now())
          uploadedUrls.push(url)
        } catch (e) { console.error('Bilde feilet:', e) }
      }

      const allImages = [...existingImages, ...uploadedUrls]
      const mainImage = allImages[0] || null
      const extraImages = allImages.slice(1)

      const { error } = await supabase.from('items').update({
        title: title.trim(),
        category_id: categoryId || null,
        description: description.trim() || null,
        condition,
        estimated_value: estimatedValue.trim() || null,
        image_url: mainImage,
        extra_images: extraImages,
      }).eq('id', itemId)

      if (error) throw error
      onToast(L('Gjenstand oppdatert', 'Item updated'))
      navigate(`/estate/${id}/item/${itemId}`)
    } catch (e) {
      onToast(L('Feil: ', 'Error: ') + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!item) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  const totalImages = existingImages.length + newFiles.length

  return (
    <div style={{ maxWidth:'560px', margin:'0 auto', padding:'20px 16px 100px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}/item/${itemId}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'14px', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>
        {L('← Tilbake', '← Back')}
      </button>

      <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'24px' }}>
        {L('Rediger gjenstand', 'Edit item')}
      </h1>

      <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

        {/* Images */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'8px' }}>
            {L('Bilder', 'Photos')} ({totalImages}/5)
          </label>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {existingImages.map((url, i) => (
              <div key={`ex-${i}`} style={{ position:'relative', width:'80px', height:'80px', borderRadius:'8px', overflow:'hidden', background:'#E8DFD0' }}>
                <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                <button onClick={() => removeExisting(i)} style={{
                  position:'absolute', top:'2px', right:'2px',
                  background:'rgba(139,58,58,0.85)', color:'#fff', border:'none',
                  borderRadius:'50%', width:'20px', height:'20px',
                  cursor:'pointer', fontSize:'12px', lineHeight:'1',
                }}>×</button>
                {i === 0 && <span style={{ position:'absolute', bottom:'2px', left:'2px', background:'#3A2F26', color:'#fff', fontSize:'9px', padding:'1px 4px', borderRadius:'4px' }}>{L('Hoved', 'Main')}</span>}
              </div>
            ))}

            {newPreviews.map((src, i) => (
              <div key={`new-${i}`} style={{ position:'relative', width:'80px', height:'80px', borderRadius:'8px', overflow:'hidden', background:'#E8DFD0', border:'2px solid #8B9A7D' }}>
                <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                <button onClick={() => removeNew(i)} style={{
                  position:'absolute', top:'2px', right:'2px',
                  background:'rgba(139,58,58,0.85)', color:'#fff', border:'none',
                  borderRadius:'50%', width:'20px', height:'20px',
                  cursor:'pointer', fontSize:'12px', lineHeight:'1',
                }}>×</button>
                <span style={{ position:'absolute', bottom:'2px', left:'2px', background:'#8B9A7D', color:'#fff', fontSize:'9px', padding:'1px 4px', borderRadius:'4px' }}>{L('Ny', 'New')}</span>
              </div>
            ))}

            {totalImages < 5 && (
              <div onClick={() => fileRef.current.click()} style={{
                width:'80px', height:'80px', borderRadius:'8px',
                border:'2px dashed #D9CFC0', background:'#FBF9F5',
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', cursor:'pointer', gap:'4px',
              }}>
                <span style={{ fontSize:'24px', color:'#9C8267', fontWeight:'300' }}>+</span>
                <span style={{ fontSize:'10px', color:'#9C8267' }}>{L('Legg til', 'Add')}</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleNewImages} style={{ display:'none' }} />
        </div>

        {/* Title */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Navn *', 'Name *')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
            style={{ width:'100%', padding:'14px', border:'1px solid #D9CFC0', borderRadius:'10px', fontSize:'16px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
        </div>

        {/* Category */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Kategori', 'Category')}</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ width:'100%', padding:'14px', border:'1px solid #D9CFC0', borderRadius:'10px', fontSize:'16px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}>
            <option value="">{L('— Velg kategori —', '— Choose category —')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>

        {/* Condition */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'8px' }}>{L('Tilstand', 'Condition')}</label>
          <div style={{ display:'flex', gap:'8px' }}>
            {[['excellent',L('Utmerket','Excellent')],['good',L('God','Good')],['fair',L('Middels','Fair')],['poor',L('Dårlig','Poor')]].map(([val, label]) => (
              <button key={val} onClick={() => setCondition(val)} style={{
                flex:1, padding:'10px 4px',
                border:`2px solid ${condition===val?'#3A2F26':'#D9CFC0'}`,
                borderRadius:'8px', cursor:'pointer', fontSize:'12px',
                fontFamily:'Karla, sans-serif',
                background: condition===val?'#3A2F26':'#fff',
                color: condition===val?'#FBF9F5':'#5C4530',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Beskrivelse', 'Description')}</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000}
            placeholder={L('Materiale, farge, historikk…', 'Material, colour, history…')}
            style={{ width:'100%', padding:'14px', border:'1px solid #D9CFC0', borderRadius:'10px', fontSize:'15px', fontFamily:'Karla, sans-serif', background:'#FBF9F5', color:'#3A2F26', resize:'none', outline:'none', boxSizing:'border-box' }} />
        </div>

        {/* Estimated value */}
        <div>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Estimert verdi (valgfri)', 'Estimated value (optional)')}</label>
          <input value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} maxLength={100}
            placeholder={L('f.eks. 1000-2000 kr', 'e.g. 1000-2000 NOK')}
            style={{ width:'100%', padding:'14px', border:'1px solid #D9CFC0', borderRadius:'10px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
        </div>
      </div>

      {/* Fixed save button */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'16px', background:'#fff', borderTop:'1px solid #D9CFC0', boxShadow:'0 -4px 20px rgba(0,0,0,0.08)', zIndex:100 }}>
        <button onClick={save} disabled={saving || !title.trim()} style={{
          width:'100%', maxWidth:'560px', display:'block', margin:'0 auto',
          padding:'16px', background: title.trim() ? '#3A2F26' : '#D9CFC0',
          color:'#FBF9F5', border:'none', borderRadius:'10px',
          cursor: title.trim() ? 'pointer' : 'not-allowed',
          fontSize:'16px', fontFamily:'Karla, sans-serif', fontWeight:'500',
        }}>{saving ? L('Lagrer…', 'Saving…') : L('Lagre endringer', 'Save changes')}</button>
      </div>
    </div>
  )
}
