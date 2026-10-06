import AppKit
import SwiftUI

final class SnippetsWindowController: NSObject, NSWindowDelegate {
    private static var shared: SnippetsWindowController?

    private let window: NSWindow

    static func open(store: SnippetStore) {
        if let existing = shared {
            NSApp.activate(ignoringOtherApps: true)
            existing.window.makeKeyAndOrderFront(nil)
            return
        }
        let controller = SnippetsWindowController(store: store)
        shared = controller
        NSApp.activate(ignoringOtherApps: true)
        controller.window.makeKeyAndOrderFront(nil)
    }

    private init(store: SnippetStore) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
                          styleMask: [.titled, .closable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Snippets — Clippy"
        window.isReleasedWhenClosed = false
        window.center()
        super.init()
        window.delegate = self
        window.contentView = NSHostingView(rootView: SnippetsView(store: store))
    }

    func windowWillClose(_ notification: Notification) {
        SnippetsWindowController.shared = nil
    }
}
