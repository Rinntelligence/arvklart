import { useState } from 'react'
import { L } from '../lib/lang'
import { getTextSize, setTextSize } from '../lib/textSize'

// Valg av tekststørrelse (Normal / Stor / Ekstra stor). Samme design for alle, bare større tekst.
export default function TextSizeControl({ compact = false }) {
  const [size, setSize] = useState(getTextSize)
  const choose = (key) => { setTextSize(key); setSize(key) }
  const options = [
    { key: 'normal', label: L('Normal', 'Normal'), fs: '0.875rem' },
    { key: 'large', label: L('Stor', 'Large'), fs: '1rem' },
    { key: 'xlarge', label: L('Ekstra stor', 'Extra large'), fs: '1.125rem' },
  ]
  return (
    <div role="group" aria-labelledby="text-size-label" style={{ padding: compact ? '10px 16px' : 0 }}>
      <div id="text-size-label" style={{ fontSize: '0.8125rem', color: '#75604B', marginBottom: '6px' }}>{L('Tekststørrelse', 'Text size')}</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {options.map(o => (
          <button key={o.key} type="button" onClick={() => choose(o.key)} aria-pressed={size === o.key} style={{
            flex: '1 1 auto', minHeight: '44px', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
            fontFamily: 'Karla, sans-serif', fontSize: o.fs, fontWeight: size === o.key ? '600' : '400',
            border: `2px solid ${size === o.key ? '#3A2F26' : '#9A8B78'}`,
            background: size === o.key ? '#3A2F26' : '#fff', color: size === o.key ? '#FBF9F5' : '#3A2F26',
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}
