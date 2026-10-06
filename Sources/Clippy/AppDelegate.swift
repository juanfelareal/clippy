import AppKit
import Carbon.HIToolbox
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let store = HistoryStore()
    private let monitor = ClipboardMonitor()
    private let hotKeys = HotKeyManager()
    private var panelController: PanelController!
    private var calculatorController: CalculatorPanelController!
    private let captureCoordinator = ScreenCaptureCoordinator()
    private let keepAwake = KeepAwake()
    private let snippetStore = SnippetStore()
    private var snippetEngine: SnippetEngine!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        NSLog("Clippy \(version): Accesibilidad=\(PasteService.hasAccessibilityPermission) GrabacionPantalla=\(CGPreflightScreenCaptureAccess())")
        panelController = PanelController(store: store)
        calculatorController = CalculatorPanelController()
        calculatorController.onWillShow = { [weak self] in
            self?.panelController.hide()
        }
        snippetEngine = SnippetEngine(store: snippetStore, tap: KeyEventTap())

        // Status item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "paperclip", accessibilityDescription: "Clippy")
            button.image?.isTemplate = true
            button.action = #selector(statusItemClicked)
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        // Clipboard monitoring
        monitor.onCapture = { [weak self] capture in
            self?.store.capture(capture)
        }
        monitor.start()

        // Global hotkeys
        let shiftCmd = UInt32(cmdKey | shiftKey)
        hotKeys.register(.historyPanel, keyCode: UInt32(kVK_ANSI_C), modifiers: shiftCmd) { [weak self] in
            self?.calculatorController.hide()
            self?.panelController.toggle()
        }
        hotKeys.register(.annotate, keyCode: UInt32(kVK_ANSI_1), modifiers: shiftCmd) { [weak self] in
            self?.captureCoordinator.captureForAnnotation()
        }
        hotKeys.register(.ocr, keyCode: UInt32(kVK_ANSI_2), modifiers: shiftCmd) { [weak self] in
            self?.captureCoordinator.captureForOCR()
        }
        hotKeys.register(.calculator, keyCode: UInt32(kVK_ANSI_Equal), modifiers: shiftCmd) { [weak self] in
            self?.calculatorController.toggle()
        }

        // Snippets (requires Accessibility; if missing, tapCreate fails and we retry from the menu)
        if PasteService.hasAccessibilityPermission {
            snippetEngine.start()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        monitor.stop()
        hotKeys.unregisterAll()
        snippetEngine.stop()
        keepAwake.disable()
    }

    // MARK: - Status item

    @objc private func statusItemClicked() {
        guard let event = NSApp.currentEvent else { return }
        if event.type == .rightMouseUp {
            showMenu()
        } else {
            calculatorController.hide()
            panelController.toggle()
        }
    }

    private func updateStatusIcon() {
        let symbol = keepAwake.isActive ? "moon.zzz.fill" : "paperclip"
        statusItem.button?.image = NSImage(systemSymbolName: symbol, accessibilityDescription: "Clippy")
        statusItem.button?.image?.isTemplate = true
    }

    private func showMenu() {
        // Retry snippet tap if permission was granted after launch
        if PasteService.hasAccessibilityPermission {
            snippetEngine.start()
        }

        let menu = NSMenu()

        let title = NSMenuItem(title: "Clippy — Utilidades", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())

        menu.addItem(makeItem("Abrir historial (⇧⌘C)", #selector(openPanel)))
        menu.addItem(makeItem("Captura anotable (⇧⌘1)", #selector(annotateScreen)))
        menu.addItem(makeItem("Copiar texto de pantalla — OCR (⇧⌘2)", #selector(ocrScreen)))
        menu.addItem(makeItem("Calculadora (⇧⌘=)", #selector(openCalculator)))
        menu.addItem(makeItem("Snippets…", #selector(openSnippets)))

        let awake = makeItem("Mantener despierto", #selector(toggleKeepAwake))
        awake.state = keepAwake.isActive ? .on : .off
        menu.addItem(awake)

        menu.addItem(.separator())

        menu.addItem(makeItem("Limpiar historial (conserva pineados)", #selector(clearHistory)))

        let launch = makeItem("Iniciar con el Mac", #selector(toggleLaunchAtLogin))
        launch.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(launch)

        menu.addItem(.separator())

        let ax = NSMenuItem(
            title: PasteService.hasAccessibilityPermission
                ? "Permiso de Accesibilidad: concedido ✓"
                : "Conceder permiso de Accesibilidad…",
            action: PasteService.hasAccessibilityPermission ? nil : #selector(requestAccessibility),
            keyEquivalent: ""
        )
        ax.target = self
        menu.addItem(ax)

        let screen = NSMenuItem(
            title: CGPreflightScreenCaptureAccess()
                ? "Permiso de Grabación de pantalla: concedido ✓"
                : "Conceder permiso de Grabación de pantalla…",
            action: CGPreflightScreenCaptureAccess() ? nil : #selector(requestScreenRecording),
            keyEquivalent: ""
        )
        screen.target = self
        menu.addItem(screen)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "Salir de Clippy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)

        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil // restablecer para que el click izquierdo vuelva a abrir el panel
    }

    private func makeItem(_ title: String, _ action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    // MARK: - Actions

    @objc private func openPanel() {
        calculatorController.hide()
        panelController.show()
    }

    @objc private func annotateScreen() {
        captureCoordinator.captureForAnnotation()
    }

    @objc private func ocrScreen() {
        captureCoordinator.captureForOCR()
    }

    @objc private func openCalculator() {
        calculatorController.show()
    }

    @objc private func openSnippets() {
        if !PasteService.hasAccessibilityPermission {
            PasteService.requestAccessibilityPermission()
        } else {
            snippetEngine.start()
        }
        SnippetsWindowController.open(store: snippetStore)
    }

    @objc private func toggleKeepAwake() {
        keepAwake.toggle()
        updateStatusIcon()
        HUD.show(keepAwake.isActive ? "☕ Mac despierto" : "Modo normal")
    }

    @objc private func clearHistory() {
        store.clearUnpinned()
    }

    @objc private func toggleLaunchAtLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            NSLog("Clippy: launch at login error: \(error)")
            let alert = NSAlert()
            alert.messageText = "No se pudo cambiar el inicio automático"
            alert.informativeText = "Asegúrate de que Clippy esté instalado en /Applications.\n\(error.localizedDescription)"
            alert.runModal()
        }
    }

    @objc private func requestAccessibility() {
        PasteService.requestAccessibilityPermission()
    }

    @objc private func requestScreenRecording() {
        CGRequestScreenCaptureAccess()
    }
}
