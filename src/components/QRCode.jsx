import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

// `size` controls the internal canvas resolution (= sharpness when
// scaled). The CSS makes the canvas fill its container, so callers
// just have to pick the wrapper width.
export function QRCode({ value, size = 600, fluid = true }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && value) {
      QRCodeLib.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        // High-contrast black-on-white — easiest to scan from a
        // phone held at a distance, even in mediocre lighting.
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',  // robust to partial occlusion
      })
    }
  }, [value, size])
  return <canvas ref={canvasRef}
    style={fluid
      ? { display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }
      : { display: 'block' }} />
}
