// ──────────────────────────────────────────────────────────────
// ScrappyButton — hand-coloured marker style:
//   • outline = clean closed rounded rectangle (regular shape)
//   • coloured fill = roughly the same size as the outline,
//     shifted down-right, with a slightly irregular shape
//   • result: the colour is BOTH inside (over the outline area)
//     AND outside (peeking past on bottom-right). The outline
//     itself peeks past on top-left.
//   • NO drop shadow.
// ──────────────────────────────────────────────────────────────

const INK = '#1C2530'

// Offset of the colour fill relative to the outline. The fill is
// shifted DOWN by OFFSET_Y and RIGHT by OFFSET_X.
const OFFSET_X = 5
const OFFSET_Y = 6

// Asymmetric border-radius → the colour rectangle reads as
// "drawn quickly by hand" without becoming a blob.
const FILL_RADIUS = '5px 9px 7px 11px / 8px 6px 10px 6px'

export function ScrappyButton({
  children, onClick, disabled = false,
  color = '#F5C84A',
  textColor = INK,
  size = 'md',
  full = false,
  type = 'button',
  title,
  style = {},
}) {
  const padding = size === 'sm'
    ? '8px 18px'
    : size === 'lg'
    ? '17px 30px'
    : '13px 24px'
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 17 : 14
  const radius = size === 'sm' ? 8 : 10
  const borderW = size === 'sm' ? 2 : 2.5

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        position: 'relative',
        padding,
        width: full ? '100%' : undefined,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900,
        fontSize,
        color: disabled ? '#9C958A' : textColor,
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.6 : 1,
        // Reserve space so the offset fill doesn't collide with siblings
        marginRight: OFFSET_X,
        marginBottom: OFFSET_Y,
        transition: 'transform .12s ease',
        ...style,
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'translate(1px, 1px)' }}
      onMouseUp={e => { e.currentTarget.style.transform = 'translate(0, 0)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translate(0, 0)' }}
    >
      {/* Coloured fill — offset down-right, slightly deformed shape */}
      <span aria-hidden="true" style={{
        position: 'absolute',
        top: OFFSET_Y, left: OFFSET_X,
        right: -OFFSET_X, bottom: -OFFSET_Y,
        background: disabled ? '#E5DFD3' : color,
        borderRadius: FILL_RADIUS,
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* Outline — clean closed rounded rectangle */}
      <span aria-hidden="true" style={{
        position: 'absolute',
        inset: 0,
        border: `${borderW}px solid ${INK}`,
        borderRadius: radius,
        background: 'transparent',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* Label */}
      <span style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </span>
    </button>
  )
}

// Smaller non-interactive chip — same recipe with smaller offset
export function ScrappyChip({ children, color = '#F5C84A', textColor = INK,
  size = 'md', style = {} }) {
  const padding = size === 'sm' ? '6px 14px' : '8px 18px'
  const fontSize = size === 'sm' ? 10 : 13
  const borderW = size === 'sm' ? 1.8 : 2.2
  const radius = size === 'sm' ? 999 : 999  // chips are always pill
  const OX = size === 'sm' ? 3 : 4
  const OY = size === 'sm' ? 3 : 4

  return (
    <span style={{
      position: 'relative',
      display: 'inline-block',
      padding,
      fontFamily: 'Barlow Condensed, Impact, sans-serif',
      fontWeight: 900,
      fontSize,
      color: textColor,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      marginRight: OX, marginBottom: OY,
      ...style,
    }}>
      <span aria-hidden="true" style={{
        position: 'absolute',
        top: OY, left: OX,
        right: -OX, bottom: -OY,
        background: color,
        borderRadius: '40% 60% 50% 55% / 50% 45% 55% 50%',
        zIndex: 0,
      }} />
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        border: `${borderW}px solid ${INK}`,
        borderRadius: radius,
        zIndex: 1,
      }} />
      <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
    </span>
  )
}
