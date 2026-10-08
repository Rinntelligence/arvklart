const FORDEL_COLORS = ['#DCE3D2','#E8DFD0','#C9AE8E','#A8B598','#8B9A7D','#D9CFC0','#5F6E52','#9C8267']
const getColor = (name = '') => FORDEL_COLORS[name.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % FORDEL_COLORS.length]
const avatarTextColor = (hex) => { if(!hex)return'#FBF9F5'; const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

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

export function Card({ children, style = {} }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', ...style }}>
      {children}
    </div>
  )
}
