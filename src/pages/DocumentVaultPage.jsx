import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { L, locale } from '../lib/lang'

const FOLDER_TYPES = [
  { id: 'will',      label: L('Testament', 'Will'),                         color: '#5F6E52' },
  { id: 'death',     label: L('Dødsattest', 'Death certificate'),           color: '#8B9A7D' },
  { id: 'property',  label: L('Eiendom og skjøter', 'Property and deeds'),  color: '#7A8B6E' },
  { id: 'insurance', label: L('Forsikring', 'Insurance'),                  color: '#9C8267' },
  { id: 'tax',       label: L('Skattemeldinger', 'Tax returns'),           color: '#A97C3F' },
  { id: 'id',        label: L('ID-dokumenter', 'ID documents'),            color: '#6E8B87' },
  { id: 'probate',   label: L('Skifte og juridisk', 'Probate and legal'),  color: '#8B3A3A' },
  { id: 'other',     label: L('Annet', 'Other'),                           color: '#9C8267' },
]

const formatSize = (bytes) => bytes < 1024*1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/(1024*1024)).toFixed(1)} MB`

export default function DocumentVaultPage({ session, profile }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [activeFolder, setActiveFolder] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [myRole, setMyRole] = useState('member')
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState(null)
  const [confirmDoc, setConfirmDoc] = useState(null)
  const fileRef = useRef()

  const load = async () => {
    const [{ data: ds }, { data: mem }] = await Promise.all([
      supabase.from('documents').select('*, uploader:profiles!documents_uploaded_by_fkey(display_name, avatar_color)')
        .eq('estate_id', id).order('created_at', { ascending: false }),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
    ])
    setDocs(ds || [])
    setMyRole(mem?.role || 'member')
  }

  useEffect(() => { load() }, [id])

  const uploadFile = async (file) => {
    if (!file) return
    const MAX_DOC_SIZE = 25 * 1024 * 1024 // 25 MB
    if (file.size > MAX_DOC_SIZE) {
      alert(L(`"${file.name}" er for stor. Maks filstørrelse er 25 MB.`, `"${file.name}" is too large. The maximum file size is 25 MB.`))
      return
    }
    setUploading(true)
    setUploadProgress(10)
    try {
      const path = `documents/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      setUploadProgress(30)
      const { error: upErr } = await supabase.storage.from('estate-docs').upload(path, file)
      if (upErr) throw upErr
      setUploadProgress(70)
      const { data: urlData } = supabase.storage.from('estate-docs').getPublicUrl(path)
      await supabase.from('documents').insert({
        estate_id: id, name: file.name, file_url: urlData.publicUrl,
        file_path: path, file_type: file.type, file_size: file.size,
        folder: activeFolder === 'all' ? 'other' : activeFolder,
        uploaded_by: session.user.id,
      })
      setUploadProgress(100)
      setTimeout(() => { setUploading(false); setUploadProgress(0); load() }, 500)
    } catch (e) {
      setUploading(false); setUploadProgress(0)
    }
  }

  const handleFiles = (files) => {
    Array.from(files).forEach(uploadFile)
  }

  const deleteDoc = async (doc) => {
    await supabase.storage.from('estate-docs').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', doc.id)
    setConfirmDoc(null)
    load()
  }

  const moveDoc = async (docId, folder) => {
    await supabase.from('documents').update({ folder }).eq('id', docId)
    load()
  }

  const filtered = activeFolder === 'all' ? docs : docs.filter(d => d.folder === activeFolder)
  const countByFolder = FOLDER_TYPES.reduce((acc, f) => {
    acc[f.id] = docs.filter(d => d.folder === f.id).length
    return acc
  }, {})

  return (
    <div style={{ maxWidth:'900px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{L('Dokumenthvelv', 'Document vault')}</h1>
          <p style={{ color:'#9C8267', fontSize:'14px' }}>{L('Lagre og del viktige dokumenter trygt', 'Store and share important documents securely')}</p>
        </div>
        <button onClick={() => fileRef.current.click()} style={{ padding:'9px 18px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
          {L('Last opp fil', 'Upload file')}
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.xls,.xlsx" onChange={e => handleFiles(e.target.files)} style={{ display:'none' }} />
      </div>

      {/* Opplastingsfremdrift */}
      {uploading && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'16px 20px', marginBottom:'20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'14px', color:'#3A2F26' }}>{L('Laster opp…', 'Uploading…')}</span>
            <span style={{ fontSize:'14px', color:'#5F6E52' }}>{uploadProgress}%</span>
          </div>
          <div style={{ height:'6px', background:'#E8DFD0', borderRadius:'3px', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${uploadProgress}%`, background:'#5F6E52', borderRadius:'3px', transition:'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* Dra-og-slipp-sone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        style={{
          border:`2px dashed ${dragOver?'#5F6E52':'#D9CFC0'}`,
          borderRadius:'12px', padding:'24px', textAlign:'center',
          background: dragOver?'#DCE3D2':'#FBF9F5',
          marginBottom:'24px', cursor:'pointer', transition:'all 0.2s',
        }}
        onClick={() => fileRef.current.click()}
      >
        <div style={{ fontSize:'14px', color:'#9C8267', marginBottom:'4px' }}>{L('Slipp filer her eller klikk for å laste opp', 'Drop files here or click to upload')}</div>
        <div style={{ fontSize:'12px', color:'#D9CFC0' }}>{L('PDF, Word, Excel og bilder støttes', 'PDF, Word, Excel and images are supported')}</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:'20px' }}>
        {/* Mappevalg */}
        <div>
          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
            <button onClick={() => setActiveFolder('all')} style={{
              width:'100%', padding:'12px 16px', background:activeFolder==='all'?'#E8DFD0':'none',
              border:'none', borderBottom:'1px solid #E8DFD0', textAlign:'left', cursor:'pointer',
              fontSize:'14px', color:'#3A2F26', fontFamily:'Karla, sans-serif',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span>{L('Alle dokumenter', 'All documents')}</span>
              <span style={{ fontSize:'12px', color:'#9C8267', background:'#FBF9F5', padding:'1px 7px', borderRadius:'20px' }}>{docs.length}</span>
            </button>
            {FOLDER_TYPES.map((folder, i) => (
              <button key={folder.id} onClick={() => setActiveFolder(folder.id)} style={{
                width:'100%', padding:'11px 16px',
                background:activeFolder===folder.id?'#E8DFD0':'none',
                border:'none', borderBottom:i < FOLDER_TYPES.length-1?'1px solid #FBF9F5':'none',
                textAlign:'left', cursor:'pointer', fontSize:'13px', color:'#3A2F26',
                fontFamily:'Karla, sans-serif', display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <span>{folder.label}</span>
                {countByFolder[folder.id] > 0 && (
                  <span style={{ fontSize:'11px', color:'#9C8267', background:'#FBF9F5', padding:'1px 6px', borderRadius:'20px' }}>{countByFolder[folder.id]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Dokumentliste */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#9C8267' }}>
              <p>{activeFolder==='all'?L('Ingen dokumenter i hvelvet ennå.','No documents in the vault yet.'):L('Ingen dokumenter i denne mappen ennå.','No documents in this folder yet.')}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {filtered.map(doc => (
                <DocRow key={doc.id} doc={doc} session={session} myRole={myRole}
                  onDelete={() => setConfirmDoc(doc)}
                  onMove={(folder) => moveDoc(doc.id, folder)}
                  onPreview={() => setPreview(doc)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bekreft sletting */}
      {confirmDoc && (
        <div onClick={() => setConfirmDoc(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', padding:'28px', maxWidth:'400px', width:'100%' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Slett dokument', 'Delete document')}</h3>
            <p style={{ fontSize:'14px', color:'#5C4530', marginBottom:'6px' }}>«{confirmDoc.name}»</p>
            <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'24px' }}>{L('Kan ikke angres.', 'This cannot be undone.')}</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setConfirmDoc(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={() => deleteDoc(confirmDoc)} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Slett', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Forhåndsvisning */}
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', padding:'28px', maxWidth:'560px', width:'100%' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
              <div>
                <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{preview.name}</h3>
                <p style={{ fontSize:'13px', color:'#9C8267' }}>{L('Lastet opp av', 'Uploaded by')} {preview.uploader?.display_name} · {new Date(preview.created_at).toLocaleDateString(locale())}</p>
              </div>
              <button onClick={() => setPreview(null)} style={{ background:'none', border:'none', fontSize:'24px', color:'#9C8267', cursor:'pointer' }}>×</button>
            </div>
            {preview.file_type?.startsWith('image/') && (
              <img src={preview.file_url} alt={preview.name} style={{ width:'100%', borderRadius:'8px', marginBottom:'16px' }} />
            )}
            <div style={{ display:'flex', gap:'10px' }}>
              <a href={preview.file_url} target="_blank" rel="noopener noreferrer" style={{ flex:1, padding:'11px', background:'#3A2F26', color:'#FBF9F5', borderRadius:'8px', textAlign:'center', textDecoration:'none', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
                {L('Åpne / Last ned', 'Open / Download')}
              </a>
              <button onClick={() => setPreview(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Lukk', 'Close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, session, myRole, onDelete, onMove, onPreview }) {
  const [showMove, setShowMove] = useState(false)
  const folder = FOLDER_TYPES.find(f => f.id === doc.folder) || FOLDER_TYPES[FOLDER_TYPES.length - 1]

  return (
    <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:'8px', height:'40px', borderRadius:'4px', background:folder.color, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'14px', color:'#3A2F26', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
        <div style={{ fontSize:'12px', color:'#9C8267', marginTop:'2px', display:'flex', gap:'8px', alignItems:'center' }}>
          <span>{doc.uploader?.display_name}</span>
          <span>·</span>
          <span>{formatSize(doc.file_size)}</span>
          <span>·</span>
          <span>{new Date(doc.created_at).toLocaleDateString(locale(), { day:'numeric', month:'short' })}</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
        <span style={{ fontSize:'11px', background:'#FBF9F5', color:'#5C4530', padding:'2px 8px', borderRadius:'20px' }}>{folder.label}</span>

        <button onClick={onPreview} title={L('Forhåndsvis', 'Preview')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#5C4530' }}>{L('Vis', 'View')}</button>

        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title={L('Last ned', 'Download')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#5C4530', textDecoration:'none' }}>↓</a>

        <div style={{ position:'relative' }}>
          <button onClick={() => setShowMove(!showMove)} title={L('Flytt til mappe', 'Move to folder')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#5C4530' }}>{L('Flytt', 'Move')}</button>
          {showMove && (
            <div style={{ position:'absolute', right:0, top:'34px', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', minWidth:'180px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, overflow:'hidden' }}>
              {FOLDER_TYPES.map(f => (
                <button key={f.id} onClick={() => { onMove(f.id); setShowMove(false) }} style={{ display:'block', width:'100%', padding:'9px 14px', background:doc.folder===f.id?'#E8DFD0':'none', border:'none', textAlign:'left', cursor:'pointer', fontSize:'13px', color:'#3A2F26', fontFamily:'Karla, sans-serif' }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {(myRole === 'admin' || doc.uploaded_by === session.user.id) && (
          <button onClick={onDelete} title={L('Slett', 'Delete')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#8B3A3A' }}>×</button>
        )}
      </div>
    </div>
  )
}
