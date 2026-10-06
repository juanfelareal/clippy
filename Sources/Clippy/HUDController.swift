import AppKit
import SwiftUI

/// Transient "toast" HUD, e.g. HUD.show("✓ Texto copiado").
/// Non-activating, click-through, fades out on its own.
enum HUD {
    private static var panel: NSPanel?
    private static var generation = 0

    static func show(_ message: String) {
        generation += 1
        let currentGeneration = generation

        panel?.orderOut(nil)

        let content = Text(message)
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())

        let hosting = NSHostingView(rootView: content)
        let size = hosting.fittingSize

        let hud = NSPanel(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.borderless, .nonactivatingPanel],
                          backing: .buffered, defer: false)
        hud.level = .statusBar
        hud.isOpaque = false
        hud.backgroundColor = .clear
        hud.hasShadow = true
        hud.ignoresMouseEvents = true
        hud.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hud.contentView = hosting

        // Position: centered, ~12% from top of the screen with the mouse
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        if let visible = screen?.visibleFrame {
            let origin = NSPoint(x: visible.midX - size.width / 2,
                                 y: visible.maxY - visible.height * 0.12 - size.height)
            hud.setFrameOrigin(origin)
        }

        hud.alphaValue = 0
        hud.orderFrontRegardless()
        panel = hud

        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            hud.animator().alphaValue = 1
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            guard generation == currentGeneration else { return }
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.3
                hud.animator().alphaValue = 0
            }, completionHandler: {
                guard generation == currentGeneration else { return }
                hud.orderOut(nil)
                if panel === hud { panel = nil }
            })
        }
    }
}
