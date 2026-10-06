import { L } from '../lib/lang'
export function Toast({ msg, type = 'success' }) {
  return (
    <div style={{
      position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#c0392b' : '#1a1410',
      color: '#f5f0eb', padding: '11px 28px', borderRadius: '10px',
      fontSize: '14px', zIndex: 999, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
      animation: 'fadeUp 0.2s ease',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {msg}
    </div>
  )
}

export default Toast

const FORDEL_COLORS = ['#DCE3D2','#E8DFD0','#C9AE8E','#A8B598','#8B9A7D','#D9CFC0','#5F6E52','#9C8267']
export const getColor = (name = '') => FORDEL_COLORS[name.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % FORDEL_COLORS.length]
export const avatarTextColor = (hex) => { if(!hex)return'#FBF9F5'; const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export function Avatar({ name = '?', size = 32, color }) {
  const bg = color || getColor(name)
  const textCol = avatarTextColor(bg)
  return (
    <span title={name} style={{
      width:`${size}px`, height:`${size}px`, borderRadius:'50%',
      background: bg,
      border: textCol === '#3A2F26' ? '1px solid #D9CFC0' : 'none',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize:`${Math.floor(size*0.4)}px`, color: textCol, fontWeight:'500', flexShrink:0,
      fontFamily:'Karla, sans-serif',
    }}>{name[0]?.toUpperCase() || '?'}</span>
  )
}

export function Badge({ children, color = '#f0ebe4', textColor = '#6b5c4c' }) {
  return (
    <span style={{ fontSize:'11px', background:color, color:textColor, padding:'2px 8px', borderRadius:'20px', whiteSpace:'nowrap', fontFamily:'DM Sans, sans-serif' }}>
      {children}
    </span>
  )
}

export function Card({ children, style = {} }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', ...style }}>
      {children}
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', disabled, style = {}, size = 'md' }) {
  const pad = size === 'sm' ? '7px 14px' : size === 'lg' ? '14px 28px' : '11px 20px'
  const fontSize = size === 'sm' ? '13px' : size === 'lg' ? '16px' : '14px'
  const bg = {
    primary: disabled ? '#c0b8b0' : '#1a1410',
    secondary: '#fff',
    danger: '#c0392b',
    ghost: 'transparent',
  }[variant]
  const color = variant === 'secondary' ? '#1a1410' : '#fff'
  const border = variant === 'secondary' ? '1px solid #e0d8d0' : variant === 'ghost' ? '1px solid transparent' : 'none'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:pad, background:bg, color, border, borderRadius:'8px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize, fontFamily:'DM Sans, sans-serif', fontWeight:'400',
      transition:'opacity 0.15s', ...style,
    }}>{children}</button>
  )
}

export function Input({ label, value, onChange, placeholder, type='text', style={} }) {
  return (
    <div style={{ marginBottom:'16px', ...style }}>
      {label && <label style={{ display:'block', fontSize:'13px', color:'#8c7b6b', marginBottom:'6px' }}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', padding:'11px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', fontSize:'15px', background:'#faf7f3', color:'#1a1410', outline:'none', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
    </div>
  )
}

export function UpgradeGate({ feature, children, fallback }) {
  return fallback || (
    <div style={{ padding:'24px', background:'#fef3e8', border:'1px solid #e8c4a0', borderRadius:'10px', textAlign:'center' }}>
      <div style={{ fontSize:'24px', marginBottom:'8px' }}>🔒</div>
      <div style={{ fontSize:'14px', color:'#6b5c4c', marginBottom:'12px' }}>{L('Denne funksjonen krever betalt plan', 'This feature requires a paid plan')}</div>
      <a href="/pricing" style={{ fontSize:'13px', color:'#c4855a', textDecoration:'underline' }}>{L('Se planer →', 'View plans →')}</a>
    </div>
  )
}
