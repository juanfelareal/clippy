import AppKit
import SwiftUI

final class AnnotationWindowController: NSObject, NSWindowDelegate {
    private static var openControllers: Set<AnnotationWindowController> = []

    private let window: NSWindow
    private let document: AnnotationDocument
    private var keyMonitor: Any?

    static func open(image: NSImage, pngData: Data) {
        guard let document = AnnotationDocument(image: image, pngData: pngData) else {
            HUD.show("No se pudo abrir la captura")
            return
        }
        let controller = AnnotationWindowController(document: document)
        openControllers.insert(controller)
        controller.showWindow()
    }

    private init(document: AnnotationDocument) {
        self.document = document

        // Window sized to the image's point size, clamped to 90% of the screen
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let pointSize = NSSize(width: document.pixelSize.width / document.pixelDensity,
                               height: document.pixelSize.height / document.pixelDensity)
        let toolbarHeight: CGFloat = 44
        let width = min(max(pointSize.width, 480), screen.width * 0.9)
        let height = min(max(pointSize.height + toolbarHeight, 320), screen.height * 0.9)

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                          styleMask: [.titled, .closable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Captura — Clippy"
        window.isReleasedWhenClosed = false
        window.center()

        super.init()
        window.delegate = self

        let view = AnnotationEditorView(
            document: document,
            onCopy: { [weak self] in self?.copyToClipboard() },
            onSave: { [weak self] in self?.saveToDisk() }
        )
        window.contentView = NSHostingView(rootView: view)
    }

    private func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        installKeyMonitor()
    }

    // MARK: - Actions

    private func copyToClipboard() {
        guard let png = AnnotationRenderer.renderFinal(document: document) else {
            HUD.show("Error al exportar")
            return
        }
        // Direct pasteboard write (no self-write mark) so it lands in Clippy history
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setData(png, forType: .png)
        HUD.show("✓ Imagen copiada")
    }

    private func saveToDisk() {
        guard let png = AnnotationRenderer.renderFinal(document: document) else {
            HUD.show("Error al exportar")
            return
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.directoryURL = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
        let formatter = DateFormatter()
        formatter.dateFormat = "dd-MM-yyyy 'a las' HH.mm.ss"
        panel.nameFieldStringValue = "Captura \(formatter.string(from: Date())).png"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try png.write(to: url)
                HUD.show("✓ Guardada")
            } catch {
                HUD.show("Error al guardar")
            }
        }
    }

    // MARK: - Keyboard

    private func installKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.window.isKeyWindow else { return event }
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            switch (event.keyCode, flags) {
            case (53, _): // Esc
                if self.document.pendingText != nil {
                    self.document.pendingText = nil // cancel text entry first
                } else {
                    self.window.close()
                }
                return nil
            case (13, [.command]): // ⌘W
                self.window.close()
                return nil
            case (6, [.command]): // ⌘Z
                self.document.undo()
                return nil
            case (1, [.command]): // ⌘S
                self.saveToDisk()
                return nil
            default:
                return event
            }
        }
    }

    // MARK: - NSWindowDelegate

    func windowWillClose(_ notification: Notification) {
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
        AnnotationWindowController.openControllers.remove(self)
    }
}
