import AppKit
import SwiftUI

final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(contentRect: contentRect,
                   styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
                   backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .floating
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        standardWindowButton(.closeButton)?.isHidden = true
        standardWindowButton(.miniaturizeButton)?.isHidden = true
        standardWindowButton(.zoomButton)?.isHidden = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isMovableByWindowBackground = false
        hidesOnDeactivate = false
        animationBehavior = .utilityWindow
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

enum CommitAction {
    case copyOnly
    case paste
    case pastePlain
}

final class PanelController: NSObject, NSWindowDelegate {
    static let panelWidth: CGFloat = 420
    static let panelHeight: CGFloat = 480

    private let panel: FloatingPanel
    private let store: HistoryStore
    private var keyMonitor: Any?
    private var previousApp: NSRunningApplication?

    // keyCodes de ⌘1–⌘9
    private static let digitKeyCodes: [UInt16: Int] = [
        18: 0, 19: 1, 20: 2, 21: 3, 23: 4, 22: 5, 26: 6, 28: 7, 25: 8
    ]

    var isVisible: Bool { panel.isVisible }

    init(store: HistoryStore) {
        self.store = store
        self.panel = FloatingPanel(contentRect: NSRect(x: 0, y: 0,
                                                       width: PanelController.panelWidth,
                                                       height: PanelController.panelHeight))
        super.init()
        panel.delegate = self
        let view = HistoryView(store: store) { [weak self] action, item in
            self?.commit(action, item: item)
        }
        panel.contentView = NSHostingView(rootView: view)
    }

    func toggle() {
        if panel.isVisible { hide() } else { show() }
    }

    func show() {
        previousApp = NSWorkspace.shared.frontmostApplication
        store.query = ""
        store.selectedIndex = 0
        positionPanel()
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
        NotificationCenter.default.post(name: .clippyPanelDidShow, object: nil)
    }

    func hide() {
        removeKeyMonitor()
        panel.orderOut(nil)
    }

    // MARK: - Positioning

    private func positionPanel() {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        guard let visible = screen?.visibleFrame else { return }

        var origin = NSPoint(x: mouse.x - PanelController.panelWidth / 2,
                             y: mouse.y - PanelController.panelHeight - 8)
        origin.x = min(max(origin.x, visible.minX + 8), visible.maxX - PanelController.panelWidth - 8)
        origin.y = min(max(origin.y, visible.minY + 8), visible.maxY - PanelController.panelHeight - 8)
        panel.setFrameOrigin(origin)
    }

    // MARK: - Keyboard

    private func installKeyMonitor() {
        removeKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.panel.isVisible else { return event }
            return self.handle(event) ? nil : event
        }
    }

    private func removeKeyMonitor() {
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
    }

    private func handle(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        switch event.keyCode {
        case 126: // ↑
            store.moveSelection(-1)
            return true
        case 125: // ↓
            store.moveSelection(+1)
            return true
        case 53: // Esc
            hide()
            return true
        case 48: // Tab → navegación abajo
            store.moveSelection(flags.contains(.shift) ? -1 : +1)
            return true
        case 36: // Return
            guard let item = store.selectedItem else { return true }
            if flags.contains(.option) && flags.contains(.shift) {
                commit(.pastePlain, item: item)
            } else if flags.contains(.option) {
                commit(.copyOnly, item: item)
            } else {
                commit(.paste, item: item)
            }
            return true
        case 35 where flags == [.option]: // ⌥P
            if let item = store.selectedItem { store.togglePin(item) }
            return true
        case 51 where flags == [.option]: // ⌥⌫
            if let item = store.selectedItem { store.delete(item) }
            return true
        default:
            if flags == [.command], let digit = PanelController.digitKeyCodes[event.keyCode] {
                let list = store.filtered
                if list.indices.contains(digit) {
                    commit(.paste, item: list[digit])
                }
                return true
            }
            return false // pasa al campo de búsqueda
        }
    }

    // MARK: - Commit

    func commit(_ action: CommitAction, item: ClipItem) {
        var target = item
        if action == .pastePlain, item.kind == .text {
            // El texto ya se guarda plano; escribir solo .string garantiza sin formato
            target = item
        }
        PasteService.copy(target, imageStore: store.imageStore)
        store.touch(item)
        hide()
        if action == .paste || action == .pastePlain {
            PasteService.pasteToFrontmost(previousApp: previousApp)
        }
    }

    // MARK: - NSWindowDelegate

    func windowDidResignKey(_ notification: Notification) {
        hide()
    }
}

extension Notification.Name {
    static let clippyPanelDidShow = Notification.Name("clippyPanelDidShow")
}
