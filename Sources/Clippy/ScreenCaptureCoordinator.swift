import AppKit

/// Orchestrates capture → OCR / annotation flows.
final class ScreenCaptureCoordinator {
    private let capture = CaptureService()

    func captureForOCR() {
        capture.captureRegion { result in
            guard case .image(let png, _) = result else { return }
            OCRService.recognize(pngData: png) { text in
                guard let text = text else {
                    HUD.show("Sin texto detectado")
                    return
                }
                // Direct pasteboard write (NOT PasteService.copy) so the
                // clipboard monitor picks it up into Clippy history.
                let pb = NSPasteboard.general
                pb.clearContents()
                pb.setString(text, forType: .string)
                HUD.show("✓ Texto copiado")
            }
        }
    }

    func captureForAnnotation() {
        capture.captureRegion { result in
            guard case .image(let png, let image) = result else { return }
            AnnotationWindowController.open(image: image, pngData: png)
        }
    }
}
