import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

export function QRCode({ value, size = 180 }) {
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
  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
