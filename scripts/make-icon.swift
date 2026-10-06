// Genera Resources/AppIcon.icns: 📎 sobre un squircle con degradado.
// Uso: swift scripts/make-icon.swift  (requiere iconutil)
import AppKit

func render(_ px: Int) -> Data {
    let s = CGFloat(px)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let inset = s * 0.1
    let rect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let path = NSBezierPath(roundedRect: rect, xRadius: rect.width * 0.225, yRadius: rect.width * 0.225)
    NSGradient(starting: NSColor(red: 0.29, green: 0.87, blue: 0.50, alpha: 1),
               ending: NSColor(red: 0.05, green: 0.42, blue: 0.27, alpha: 1))!.draw(in: path, angle: -90)
    // Clip dibujado a mano (vectores propios, sin emoji)
    let u = rect.width * 0.74
    let clip = NSBezierPath()
    func pt(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: x * u, y: y * u) }
    clip.move(to: pt(-0.05, 0.20))
    clip.line(to: pt(-0.05, -0.26))
    clip.appendArc(withCenter: pt(0.03, -0.26), radius: 0.08 * u, startAngle: 180, endAngle: 360)
    clip.line(to: pt(0.11, 0.34))
    clip.appendArc(withCenter: pt(-0.03, 0.34), radius: 0.14 * u, startAngle: 0, endAngle: 180)
    clip.line(to: pt(-0.17, -0.34))
    clip.appendArc(withCenter: pt(0.01, -0.34), radius: 0.18 * u, startAngle: 180, endAngle: 360)
    clip.line(to: pt(0.19, 0.22))
    var t = AffineTransform(translationByX: rect.midX, byY: rect.midY)
    t.rotate(byDegrees: -35)
    clip.transform(using: t)
    clip.lineWidth = u * 0.065
    clip.lineCapStyle = .round
    NSColor(white: 0, alpha: 0.18).setStroke()
    let shadow = clip.copy() as! NSBezierPath
    shadow.transform(using: AffineTransform(translationByX: 0, byY: -u * 0.012))
    shadow.stroke()
    NSColor.white.setStroke()
    clip.stroke()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let fm = FileManager.default
let iconset = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("AppIcon.iconset")
try? fm.removeItem(at: iconset)
try! fm.createDirectory(at: iconset, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    try! render(base).write(to: iconset.appendingPathComponent("icon_\(base)x\(base).png"))
    try! render(base * 2).write(to: iconset.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
p.arguments = ["-c", "icns", iconset.path, "-o", "Resources/AppIcon.icns"]
try! p.run(); p.waitUntilExit()
print(p.terminationStatus == 0 ? "✅ Resources/AppIcon.icns" : "❌ iconutil falló")
