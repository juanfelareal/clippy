import AppKit
import SwiftUI

final class CalculatorPanelController: NSObject, NSWindowDelegate {
    static let panelWidth: CGFloat = 380
    static let panelHeight: CGFloat = 110

    private let panel: FloatingPanel
    private let model = CalculatorModel()
    private var keyMonitor: Any?

    /// Called before showing so other panels can hide.
    var onWillShow: (() -> Void)?

    var isVisible: Bool { panel.isVisible }

    override init() {
        panel = FloatingPanel(contentRect: NSRect(x: 0, y: 0,
                                                  width: CalculatorPanelController.panelWidth,
                                                  height: CalculatorPanelController.panelHeight))
        super.init()
        panel.delegate = self
        panel.contentView = NSHostingView(rootView: CalculatorView(model: model))
    }

    func toggle() {
        if panel.isVisible { hide() } else { show() }
    }

    func show() {
        onWillShow?()
        model.input = ""
        positionPanel()
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
        NotificationCenter.default.post(name: .clippyCalculatorDidShow, object: nil)
    }

    func hide() {
        removeKeyMonitor()
        panel.orderOut(nil)
    }

    private func positionPanel() {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }
        var origin = NSPoint(x: mouse.x - CalculatorPanelController.panelWidth / 2,
                             y: mouse.y - CalculatorPanelController.panelHeight - 8)
        origin.x = min(max(origin.x, visible.minX + 8), visible.maxX - CalculatorPanelController.panelWidth - 8)
        origin.y = min(max(origin.y, visible.minY + 8), visible.maxY - CalculatorPanelController.panelHeight - 8)
        panel.setFrameOrigin(origin)
    }

    private func installKeyMonitor() {
        removeKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.panel.isVisible, self.panel.isKeyWindow else { return event }
            switch event.keyCode {
            case 53: // Esc
                self.hide()
                return nil
            case 36, 76: // Return
                if let result = self.model.result {
                    // Direct pasteboard write (no self-write mark) so it lands in history
                    let pb = NSPasteboard.general
                    pb.clearContents()
                    pb.setString(CalculatorEngine.format(result), forType: .string)
                    self.hide()
                }
                return nil
            default:
                return event
            }
        }
    }

    private func removeKeyMonitor() {
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
    }

    func windowDidResignKey(_ notification: Notification) {
        hide()
    }
}
