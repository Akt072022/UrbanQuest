// Renders slide 3 of every public/canvas/OVPM-*.pdf as a high-resolution
// PNG into public/canvas-thumbs/OVPM-NNN.png.
//
// Why Swift?
//   pdftoppm / LibreOffice aren't installed on this machine and brew
//   isn't available either. Swift + PDFKit ship with macOS, so this
//   has zero external dependencies — just `swift run` it.
//
// Run:
//   swift scripts/render-canvas-thumbs.swift
//
// Tuning:
//   The OVPM canvases are ~1920×1080 by design (16:9 widescreen). The
//   PDFs report mediaBox at native point size, so scale 1.5 gives us
//   ~2880×1620 — sharp at 240% lightbox zoom on retina displays
//   without ballooning the bundle (~250-400 KB/file × 133 ≈ 45 MB).
//   Bump higher if you still see softness on huge monitors.

import Foundation
import PDFKit
import AppKit

let scale: CGFloat = 1.5

let fm = FileManager.default
let cwd = fm.currentDirectoryPath
let srcDir = "\(cwd)/public/canvas"
let outDir = "\(cwd)/public/canvas-thumbs"
try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let files = (try? fm.contentsOfDirectory(atPath: srcDir)) ?? []
let pdfs = files.filter {
  $0.hasSuffix(".pdf") && $0.hasPrefix("OVPM-")
}.sorted()

print("found \(pdfs.count) PDFs")

var done = 0
for pdfName in pdfs {
  let id = String(pdfName.dropFirst(5).prefix(3))   // OVPM-001-... → "001"
  let pdfPath = "\(srcDir)/\(pdfName)"
  let outPath = "\(outDir)/OVPM-\(id).png"

  guard let pdf = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("skip (cannot open): \(pdfName)")
    continue
  }
  // Slide 3 is the canvas on every OVPM-* deck. Fall back to the
  // last available page if a particular PDF has fewer pages.
  let pageIdx = min(2, pdf.pageCount - 1)
  guard let page = pdf.page(at: pageIdx) else {
    print("skip (no page): \(pdfName)")
    continue
  }
  let bounds = page.bounds(for: .mediaBox)
  let pixelSize = NSSize(width: bounds.width * scale,
                         height: bounds.height * scale)

  let image = NSImage(size: pixelSize)
  image.lockFocus()
  if let ctx = NSGraphicsContext.current?.cgContext {
    // White background — many canvases have transparent areas.
    ctx.setFillColor(CGColor.white)
    ctx.fill(CGRect(origin: .zero, size: pixelSize))
    ctx.saveGState()
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()
  }
  image.unlockFocus()

  guard
    let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
  else {
    print("skip (encode failed): \(pdfName)")
    continue
  }
  do {
    try png.write(to: URL(fileURLWithPath: outPath))
    done += 1
    if done % 10 == 0 { print("  rendered \(done) of \(pdfs.count)…") }
  } catch {
    print("skip (write failed) \(outPath): \(error)")
  }
}

print("done. \(done) thumbnails written to \(outDir)")
