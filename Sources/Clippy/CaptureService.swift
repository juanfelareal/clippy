import AppKit
import CoreGraphics

enum CaptureResult {
    case image(png: Data, image: NSImage)
    case cancelled
    case failed(String)
}

final class CaptureService {
    private(set) var isCapturing = false

    /// Interactive region capture via /usr/sbin/screencapture.
    /// Requires Screen Recording permission (TCC attributes the child process to Clippy).
    func captureRegion(completion: @escaping (CaptureResult) -> Void) {
        guard !isCapturing else { return }
        guard ensurePermission() else { return }
        isCapturing = true

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("clippy-cap-\(UUID().uuidString).png")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-x", "-t", "png", url.path]
        process.terminationHandler = { _ in
            DispatchQueue.main.async {
                self.isCapturing = false
                defer { try? FileManager.default.removeItem(at: url) }
                guard let data = try? Data(contentsOf: url), !data.isEmpty,
                      let image = NSImage(data: data) else {
                    completion(.cancelled) // Esc during selection → no file
                    return
                }
                completion(.image(png: data, image: image))
            }
        }
        do {
            try process.run()
        } catch {
            isCapturing = false
            completion(.failed(error.localizedDescription))
        }
    }

    /// Preflight Screen Recording permission. Without it, screencapture "works"
    /// but returns wallpaper-only pixels — so gate EVERY capture.
    private func ensurePermission() -> Bool {
        if CGPreflightScreenCaptureAccess() { return true }
        CGRequestScreenCaptureAccess() // shows the system prompt once per TCC state

        let alert = NSAlert()
        alert.messageText = "Clippy necesita permiso de Grabación de pantalla"
        alert.informativeText = "Para capturar la pantalla (OCR y screenshots), activa Clippy en Ajustes → Privacidad y seguridad → Grabación de pantalla.\n\nDespués de activarlo, cierra y vuelve a abrir Clippy."
        alert.addButton(withTitle: "Abrir Ajustes")
        alert.addButton(withTitle: "Ahora no")
        if alert.runModal() == .alertFirstButtonReturn {
            let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!
            NSWorkspace.shared.open(url)
        }
        return false
    }

    static var hasPermission: Bool {
        CGPreflightScreenCaptureAccess()
    }
}
