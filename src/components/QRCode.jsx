import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

export function QRCode({ value, size = 180 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && value) {
      QRCodeLib.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: { dark: '#0D0D0D', light: '#C8F135' },
      })
    }
  }, [value, size])
  return <canvas ref={canvasRef} style={{ borderRadius: '12px' }} />
}
