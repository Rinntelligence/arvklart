import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getEstateMembers } from '../lib/supabase'
import { L, locale } from '../lib/lang'
import { Modal } from '../components/UI'

const FOLDER_TYPES = [
  { id: 'will',      label: L('Testament', 'Will'),                         color: '#5F6E52' },
  { id: 'death',     label: L('Dødsattest', 'Death certificate'),           color: '#5F6E52' },
  { id: 'property',  label: L('Eiendom og skjøter', 'Property and deeds'),  color: '#7A8B6E' },
  { id: 'insurance', label: L('Forsikring', 'Insurance'),                  color: '#75604B' },
  { id: 'tax',       label: L('Skattemeldinger', 'Tax returns'),           color: '#A97C3F' },
  { id: 'id',        label: L('ID-dokumenter', 'ID documents'),            color: '#6E8B87' },
  { id: 'probate',   label: L('Skifte og juridisk', 'Probate and legal'),  color: '#8B3A3A' },
  { id: 'other',     label: L('Annet', 'Other'),                           color: '#75604B' },
]

const formatSize = (bytes) => bytes < 1024*1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/(1024*1024)).toFixed(1)} MB`
const MAX_DOC_SIZE = 25 * 1024 * 1024 // 25 MB

// Dokumentene ligger i en privat bøtte; lenkene gjelder i ti minutter.
async function openDocument(doc, onToast, download = false) {
  const { data, error } = await supabase.storage.from('estate-docs')
    .createSignedUrl(doc.file_path, 600, download ? { download: doc.name } : undefined)
  if (error) { onToast(L('Kunne ikke åpne dokumentet', 'Could not open the document'), 'error'); return null }
  return data.signedUrl
}

export default function DocumentVaultPage({ session, onToast }) {
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
  const [previewUrl, setPreviewUrl] = useState(null)
  const fileRef = useRef()

  const load = async () => {
    // documents.uploaded_by peker på auth.users, så navnet hentes fra medlemslisten
    const [{ data: ds, error }, { data: members }] = await Promise.all([
      supabase.from('documents').select('*').eq('estate_id', id).order('created_at', { ascending: false }),
      getEstateMembers(id),
    ])
    if (error) onToast(L('Kunne ikke hente dokumentene', 'Could not load the documents'), 'error')
    const byId = Object.fromEntries((members || []).map(m => [m.user_id, m]))
    setDocs((ds || []).map(d => ({ ...d, uploader: byId[d.uploaded_by]?.profiles || null })))
    setMyRole(byId[session.user.id]?.role || 'member')
  }

  useEffect(() => { load() }, [id])

  const uploadFile = async (file) => {
    const path = `documents/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('estate-docs').upload(path, file)
    if (upErr) throw upErr
    const { error: dbErr } = await supabase.from('documents').insert({
      estate_id: id, name: file.name, file_url: path,
      file_path: path, file_type: file.type, file_size: file.size,
      folder: activeFolder === 'all' ? 'other' : activeFolder,
      uploaded_by: session.user.id,
    })
    if (dbErr) {
      await supabase.storage.from('estate-docs').remove([path])
      throw dbErr
    }
  }

  // Én fil om gangen, så fremdriften stemmer
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    const tooBig = files.filter(f => f.size > MAX_DOC_SIZE)
    if (tooBig.length) onToast(L(`${tooBig.map(f => f.name).join(', ')} er for stor. Maks filstørrelse er 25 MB.`, `${tooBig.map(f => f.name).join(', ')} is too large. The maximum file size is 25 MB.`), 'error')
    const ok = files.filter(f => f.size <= MAX_DOC_SIZE)
    if (!ok.length) return
    setUploading(true)
    let failed = 0
    for (const [i, file] of ok.entries()) {
      setUploadProgress(Math.round((i / ok.length) * 100))
      try { await uploadFile(file) } catch (e) { console.error('Opplasting feilet:', e); failed++ }
    }
    setUploadProgress(100)
    setUploading(false); setUploadProgress(0)
    if (failed) onToast(L(`${failed} av ${ok.length} filer kunne ikke lastes opp`, `${failed} of ${ok.length} files could not be uploaded`), 'error')
    else onToast(ok.length === 1 ? L('Dokumentet er lastet opp', 'The document has been uploaded') : L(`${ok.length} dokumenter er lastet opp`, `${ok.length} documents have been uploaded`))
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  // Filen slettes før raden, fordi tilgangen til filen sjekkes mot raden
  const deleteDoc = async (doc) => {
    const { error: fileErr } = await supabase.storage.from('estate-docs').remove([doc.file_path])
    const { data, error } = fileErr ? { error: fileErr } : await supabase.from('documents').delete().eq('id', doc.id).select('id')
    setConfirmDoc(null)
    if (error || !data?.length) onToast(L('Kunne ikke slette dokumentet', 'Could not delete the document'), 'error')
    else onToast(L('Dokumentet er slettet', 'The document has been deleted'))
    load()
  }

  const moveDoc = async (docId, folder) => {
    const { error } = await supabase.from('documents').update({ folder }).eq('id', docId)
    if (error) onToast(L('Kunne ikke flytte dokumentet', 'Could not move the document'), 'error')
    load()
  }

  const showPreview = async (doc) => {
    setPreview(doc)
    setPreviewUrl(null)
    if (doc.file_type?.startsWith('image/')) setPreviewUrl(await openDocument(doc, onToast))
  }

  const openInNewTab = async (doc, download) => {
    // Åpne fanen med en gang (før await), ellers blokkeres den som popup
    const win = window.open('', '_blank')
    const url = await openDocument(doc, onToast, download)
    if (url && win) win.location.href = url
    else win?.close()
  }

  const filtered = activeFolder === 'all' ? docs : docs.filter(d => d.folder === activeFolder)
  const countByFolder = FOLDER_TYPES.reduce((acc, f) => {
    acc[f.id] = docs.filter(d => d.folder === f.id).length
    return acc
  }, {})

  return (
    <div style={{ maxWidth:'900px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{L('Dokumenthvelv', 'Document vault')}</h1>
          <p style={{ color:'#75604B', fontSize:'14px' }}>{L('Lagre og del viktige dokumenter trygt', 'Store and share important documents securely')}</p>
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
        <div style={{ fontSize:'14px', color:'#75604B', marginBottom:'4px' }}>{L('Slipp filer her eller klikk for å laste opp', 'Drop files here or click to upload')}</div>
        <div style={{ fontSize:'12px', color:'#75604B' }}>{L('PDF, Word, Excel og bilder støttes', 'PDF, Word, Excel and images are supported')}</div>
      </div>

      {/* Mobil: mappene som en vannrett rad i stedet for en høy liste */}
      <style>{`@media (max-width: 600px) {
        .doc-folders { flex-basis: 100% !important; }
        .doc-folder-list { display: flex; gap: 6px; overflow-x: auto !important; scrollbar-width: none; background: none !important; border: none !important; border-radius: 0 !important; }
        .doc-folder-list::-webkit-scrollbar { display: none; }
        .doc-folder { width: auto !important; flex-shrink: 0; gap: 8px; white-space: nowrap; padding: 8px 14px !important; border: 1px solid #D9CFC0 !important; border-radius: 999px; }
      }`}</style>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'20px', alignItems:'flex-start' }}>
        {/* Mappevalg */}
        <div className="doc-folders" style={{ flex:'1 1 200px', maxWidth:'100%' }}>
          <div className="doc-folder-list" style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
            <button className="doc-folder" onClick={() => setActiveFolder('all')} style={{
              width:'100%', padding:'12px 16px', background:activeFolder==='all'?'#E8DFD0':'none',
              border:'none', borderBottom:'1px solid #E8DFD0', textAlign:'left', cursor:'pointer',
              fontSize:'14px', color:'#3A2F26', fontFamily:'Karla, sans-serif',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span>{L('Alle dokumenter', 'All documents')}</span>
              <span style={{ fontSize:'12px', color:'#75604B', background:'#FBF9F5', padding:'1px 7px', borderRadius:'20px' }}>{docs.length}</span>
            </button>
            {FOLDER_TYPES.map((folder, i) => (
              <button key={folder.id} className="doc-folder" onClick={() => setActiveFolder(folder.id)} style={{
                width:'100%', padding:'11px 16px',
                background:activeFolder===folder.id?'#E8DFD0':'none',
                border:'none', borderBottom:i < FOLDER_TYPES.length-1?'1px solid #FBF9F5':'none',
                textAlign:'left', cursor:'pointer', fontSize:'13px', color:'#3A2F26',
                fontFamily:'Karla, sans-serif', display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <span>{folder.label}</span>
                {countByFolder[folder.id] > 0 && (
                  <span style={{ fontSize:'11px', color:'#75604B', background:'#FBF9F5', padding:'1px 6px', borderRadius:'20px' }}>{countByFolder[folder.id]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Dokumentliste */}
        <div style={{ flex:'3 1 320px', minWidth:0 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#75604B' }}>
              <p>{activeFolder==='all'?L('Ingen dokumenter i hvelvet ennå.','No documents in the vault yet.'):L('Ingen dokumenter i denne mappen ennå.','No documents in this folder yet.')}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {filtered.map(doc => (
                <DocRow key={doc.id} doc={doc} session={session} myRole={myRole}
                  onDelete={() => setConfirmDoc(doc)}
                  onMove={(folder) => moveDoc(doc.id, folder)}
                  onPreview={() => showPreview(doc)}
                  onDownload={() => openInNewTab(doc, true)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bekreft sletting */}
      {confirmDoc && (
        <Modal onClose={() => setConfirmDoc(null)} labelledBy="delete-doc-title">
            <h3 id="delete-doc-title" style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Slett dokument', 'Delete document')}</h3>
            <p style={{ fontSize:'14px', color:'#5C4530', marginBottom:'6px' }}>«{confirmDoc.name}»</p>
            <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'24px' }}>{L('Kan ikke angres.', 'This cannot be undone.')}</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setConfirmDoc(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={() => deleteDoc(confirmDoc)} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Slett', 'Delete')}</button>
            </div>
        </Modal>
      )}

      {/* Forhåndsvisning */}
      {preview && (
        <Modal onClose={() => setPreview(null)} labelledBy="preview-doc-title" maxWidth={560} overlay="rgba(0,0,0,0.6)">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
              <div>
                <h3 id="preview-doc-title" style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px', overflowWrap:'anywhere' }}>{preview.name}</h3>
                <p style={{ fontSize:'13px', color:'#75604B' }}>{L('Lastet opp av', 'Uploaded by')} {preview.uploader?.display_name || L('et tidligere medlem', 'a former member')} · {new Date(preview.created_at).toLocaleDateString(locale())}</p>
              </div>
              <button onClick={() => setPreview(null)} aria-label={L('Lukk', 'Close')} style={{ background:'none', border:'none', fontSize:'24px', color:'#75604B', cursor:'pointer', minWidth:'44px', minHeight:'44px' }}>×</button>
            </div>
            {preview.file_type?.startsWith('image/') && previewUrl && (
              <img src={previewUrl} alt={preview.name} style={{ width:'100%', borderRadius:'8px', marginBottom:'16px' }} />
            )}
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => openInNewTab(preview, false)} style={{ flex:1, padding:'11px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
                {L('Åpne', 'Open')}
              </button>
              <button onClick={() => setPreview(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Lukk', 'Close')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}

function DocRow({ doc, session, myRole, onDelete, onMove, onPreview, onDownload }) {
  const [showMove, setShowMove] = useState(false)
  const folder = FOLDER_TYPES.find(f => f.id === doc.folder) || FOLDER_TYPES[FOLDER_TYPES.length - 1]

  return (
    <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:'8px', height:'40px', borderRadius:'4px', background:folder.color, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'14px', color:'#3A2F26', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
        <div style={{ fontSize:'12px', color:'#75604B', marginTop:'2px', display:'flex', gap:'8px', alignItems:'center' }}>
          <span>{doc.uploader?.display_name || L('Tidligere medlem', 'Former member')}</span>
          <span>·</span>
          <span>{formatSize(doc.file_size)}</span>
          <span>·</span>
          <span>{new Date(doc.created_at).toLocaleDateString(locale(), { day:'numeric', month:'short' })}</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
        <span style={{ fontSize:'11px', background:'#FBF9F5', color:'#5C4530', padding:'2px 8px', borderRadius:'20px' }}>{folder.label}</span>

        <button onClick={onPreview} title={L('Forhåndsvis', 'Preview')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#5C4530' }}>{L('Vis', 'View')}</button>

        <button onClick={onDownload} title={L('Last ned', 'Download')} style={{ background:'none', border:'1px solid #D9CFC0', padding:'5px 9px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', color:'#5C4530' }}>↓</button>

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
