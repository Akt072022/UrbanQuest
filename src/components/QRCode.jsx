import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

// `size` controls the internal canvas resolution (= sharpness when
// scaled). When fluid (default), the canvas is forced to 100% of its
// container so it fills whatever wrapper width the caller picks.
export function QRCode({ value, size = 600, fluid = true }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !value) return
    QRCodeLib.toCanvas(c, value, {
      width: size,
      margin: 2,
      // High-contrast black-on-white — easiest to scan from a
      // phone held at a distance, even in mediocre lighting.
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',  // robust to partial occlusion
    })
    // qrcode-lib unconditionally writes `canvas.style.width/height` in
    // pixels after rendering — that beats React's inline style. Re-apply
    // our own here so the canvas actually scales to its container.
    if (fluid) {
      c.style.display        = 'block'
      c.style.width          = '100%'
      c.style.height         = 'auto'
      c.style.imageRendering = 'pixelated'
    } else {
      c.style.display = 'block'
    }
  }, [value, size, fluid])
  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
