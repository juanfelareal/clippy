import AppKit
import Combine

enum AnnotationTool: CaseIterable {
    case arrow, rect, pen, text, blur

    var symbol: String {
        switch self {
        case .arrow: return "arrow.up.right"
        case .rect: return "rectangle"
        case .pen: return "pencil.line"
        case .text: return "textformat"
        case .blur: return "eye.slash"
        }
    }

    var label: String {
        switch self {
        case .arrow: return "Flecha"
        case .rect: return "Rectángulo"
        case .pen: return "Lápiz"
        case .text: return "Texto"
        case .blur: return "Censurar"
        }
    }
}

/// One annotation. ALL geometry in image pixel space (bitmap pixels, not points).
struct Annotation: Identifiable {
    let id = UUID()
    let tool: AnnotationTool
    var points: [CGPoint]   // pen: stroke; arrow/rect/blur: [start, end]; text: [anchor]
    var color: NSColor
    var lineWidth: CGFloat  // image pixels
    var text: String?
    var fontSize: CGFloat   // image pixels
}

struct PendingText {
    var anchor: CGPoint // pixel space
    var text: String = ""
}

final class AnnotationDocument: ObservableObject {
    let baseImage: NSImage
    let basePNG: Data
    let baseCGImage: CGImage
    let pixelSize: CGSize
    /// pixels per point in the source capture (2.0 on Retina)
    let pixelDensity: CGFloat

    @Published var annotations: [Annotation] = []
    @Published var inProgress: Annotation?
    @Published var tool: AnnotationTool = .arrow
    @Published var color: NSColor = .systemRed
    @Published var strokeIndex: Int = 1 // 0/1/2 → thin/medium/thick
    @Published var pendingText: PendingText?

    /// Cache of pixelated patches for blur annotations (id → CGImage in pixel space rect)
    var blurPatches: [UUID: CGImage] = [:]

    static let nominalWidths: [CGFloat] = [2, 4, 7]
    static let palette: [NSColor] = [.systemRed, .systemOrange, .systemGreen, .systemBlue, .black]

    init?(image: NSImage, pngData: Data) {
        guard let rep = NSBitmapImageRep(data: pngData), let cg = rep.cgImage else { return nil }
        baseImage = image
        basePNG = pngData
        baseCGImage = cg
        pixelSize = CGSize(width: rep.pixelsWide, height: rep.pixelsHigh)
        let pointWidth = image.size.width
        pixelDensity = pointWidth > 0 ? CGFloat(rep.pixelsWide) / pointWidth : 2.0
    }

    var currentLineWidth: CGFloat {
        AnnotationDocument.nominalWidths[strokeIndex] * pixelDensity
    }

    var currentFontSize: CGFloat {
        18 * pixelDensity
    }

    func undo() {
        guard let removed = annotations.popLast() else { return }
        blurPatches[removed.id] = nil
    }

    func commit(_ annotation: Annotation) {
        let item = annotation
        if item.tool == .blur {
            // Precompute the pixelated patch once for WYSIWYG preview + export
            if let patch = AnnotationRenderer.pixellatePatch(base: baseCGImage,
                                                             pixelSize: pixelSize,
                                                             rect: AnnotationRenderer.normalizedRect(item)) {
                blurPatches[item.id] = patch
            }
        }
        annotations.append(item)
        _ = item
    }
}
