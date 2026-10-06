import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

/// Shared geometry + export rendering for annotations.
/// All inputs in image pixel space with TOP-LEFT origin (SwiftUI convention).
enum AnnotationRenderer {
    private static let ciContext = CIContext()

    // MARK: - Geometry

    /// Rect from two points, normalized (positive size), clamped to image bounds.
    static func normalizedRect(_ annotation: Annotation) -> CGRect {
        guard annotation.points.count >= 2 else { return .zero }
        let a = annotation.points[0]
        let b = annotation.points[annotation.points.count - 1]
        return CGRect(x: min(a.x, b.x), y: min(a.y, b.y),
                      width: abs(b.x - a.x), height: abs(b.y - a.y))
    }

    static func clamp(_ rect: CGRect, to size: CGSize) -> CGRect {
        rect.intersection(CGRect(origin: .zero, size: size))
    }

    /// Arrow: main line + solid triangular head.
    static func arrowPath(from start: CGPoint, to end: CGPoint, width: CGFloat) -> (line: CGPath, head: CGPath) {
        let headLength = max(12, width * 4)
        let angle = atan2(end.y - start.y, end.x - start.x)
        let headAngle: CGFloat = .pi / 7

        let tip = end
        let back1 = CGPoint(x: tip.x - headLength * cos(angle - headAngle),
                            y: tip.y - headLength * sin(angle - headAngle))
        let back2 = CGPoint(x: tip.x - headLength * cos(angle + headAngle),
                            y: tip.y - headLength * sin(angle + headAngle))
        // Shorten the line so it doesn't poke through the head
        let lineEnd = CGPoint(x: tip.x - headLength * 0.6 * cos(angle),
                              y: tip.y - headLength * 0.6 * sin(angle))

        let line = CGMutablePath()
        line.move(to: start)
        line.addLine(to: lineEnd)

        let head = CGMutablePath()
        head.move(to: tip)
        head.addLine(to: back1)
        head.addLine(to: back2)
        head.closeSubpath()
        return (line, head)
    }

    /// Smoothed freehand stroke through points (quad curves through midpoints).
    static func penPath(points: [CGPoint]) -> CGPath {
        let path = CGMutablePath()
        guard let first = points.first else { return path }
        path.move(to: first)
        guard points.count > 2 else {
            for p in points.dropFirst() { path.addLine(to: p) }
            return path
        }
        for i in 1..<(points.count - 1) {
            let mid = CGPoint(x: (points[i].x + points[i + 1].x) / 2,
                              y: (points[i].y + points[i + 1].y) / 2)
            path.addQuadCurve(to: mid, control: points[i])
        }
        path.addLine(to: points[points.count - 1])
        return path
    }

    // MARK: - Blur patch

    /// Pixelated patch of the base image for the given pixel-space rect (top-left origin).
    static func pixellatePatch(base: CGImage, pixelSize: CGSize, rect: CGRect) -> CGImage? {
        let clamped = clamp(rect, to: pixelSize)
        guard clamped.width >= 2, clamped.height >= 2 else { return nil }

        let ci = CIImage(cgImage: base) // CI origin: bottom-left
        let ciRect = CGRect(x: clamped.minX,
                            y: pixelSize.height - clamped.maxY,
                            width: clamped.width,
                            height: clamped.height)
        let filter = CIFilter.pixellate()
        filter.inputImage = ci.clampedToExtent() // avoid edge transparency
        filter.scale = Float(max(10, min(clamped.width, clamped.height) / 8))
        filter.center = CGPoint(x: ciRect.midX, y: ciRect.midY)
        guard let output = filter.outputImage?.cropped(to: ciRect) else { return nil }
        return ciContext.createCGImage(output, from: ciRect)
    }

    // MARK: - Export

    /// Renders base + annotations into a full-resolution PNG. Retina-safe (1pt = 1px).
    static func renderFinal(document: AnnotationDocument) -> Data? {
        let pixelSize = document.pixelSize
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                         pixelsWide: Int(pixelSize.width),
                                         pixelsHigh: Int(pixelSize.height),
                                         bitsPerSample: 8, samplesPerPixel: 4,
                                         hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        rep.size = pixelSize // 1 point == 1 pixel

        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        guard let nsCtx = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
        NSGraphicsContext.current = nsCtx
        let cg = nsCtx.cgContext

        // Flip to top-left origin so annotation coords draw directly
        cg.translateBy(x: 0, y: pixelSize.height)
        cg.scaleBy(x: 1, y: -1)

        // 1. Base image (draw() in flipped context needs the flip accounted for:
        //    CGContext.draw draws bottom-up, so in our flipped context it lands correctly
        //    mirrored — re-flip locally for the image itself)
        cg.saveGState()
        cg.translateBy(x: 0, y: pixelSize.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(document.baseCGImage, in: CGRect(origin: .zero, size: pixelSize))
        cg.restoreGState()

        // 2. Blur patches first (under everything)
        for annotation in document.annotations where annotation.tool == .blur {
            let rect = clamp(normalizedRect(annotation), to: pixelSize)
            guard let patch = document.blurPatches[annotation.id] else { continue }
            cg.saveGState()
            cg.translateBy(x: 0, y: pixelSize.height)
            cg.scaleBy(x: 1, y: -1)
            let flippedRect = CGRect(x: rect.minX, y: pixelSize.height - rect.maxY,
                                     width: rect.width, height: rect.height)
            cg.draw(patch, in: flippedRect)
            cg.restoreGState()
        }

        // 3. Shape/text annotations in creation order
        for annotation in document.annotations where annotation.tool != .blur {
            draw(annotation, in: cg, pixelSize: pixelSize)
        }

        return rep.representation(using: .png, properties: [:])
    }

    private static func draw(_ annotation: Annotation, in cg: CGContext, pixelSize: CGSize) {
        let color = annotation.color.cgColor
        cg.setStrokeColor(color)
        cg.setFillColor(color)
        cg.setLineWidth(annotation.lineWidth)
        cg.setLineCap(.round)
        cg.setLineJoin(.round)

        switch annotation.tool {
        case .arrow:
            guard annotation.points.count >= 2 else { return }
            let (line, head) = arrowPath(from: annotation.points[0],
                                         to: annotation.points[annotation.points.count - 1],
                                         width: annotation.lineWidth)
            cg.addPath(line)
            cg.strokePath()
            cg.addPath(head)
            cg.fillPath()
        case .rect:
            let rect = normalizedRect(annotation)
            cg.stroke(rect)
        case .pen:
            cg.addPath(penPath(points: annotation.points))
            cg.strokePath()
        case .text:
            guard let text = annotation.text, !text.isEmpty,
                  let anchor = annotation.points.first else { return }
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: annotation.fontSize, weight: .bold),
                .foregroundColor: annotation.color
            ]
            let attributed = NSAttributedString(string: text, attributes: attrs)
            let size = attributed.size()
            // NSAttributedString.draw assumes unflipped — re-flip locally around the text
            cg.saveGState()
            cg.translateBy(x: anchor.x, y: anchor.y + size.height)
            cg.scaleBy(x: 1, y: -1)
            attributed.draw(at: .zero)
            cg.restoreGState()
        case .blur:
            break // handled in pass 2
        }
    }
}
