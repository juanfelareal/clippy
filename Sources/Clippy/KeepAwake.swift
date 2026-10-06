import Foundation
import IOKit.pwr_mgt

final class KeepAwake {
    private var assertionID: IOPMAssertionID = 0
    private(set) var isActive = false

    func toggle() {
        isActive ? disable() : enable()
    }

    func enable() {
        guard !isActive else { return }
        let result = IOPMAssertionCreateWithName(
            kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString,
            IOPMAssertionLevel(kIOPMAssertionLevelOn),
            "Clippy: mantener despierto" as CFString,
            &assertionID
        )
        isActive = (result == kIOReturnSuccess)
        if !isActive { NSLog("Clippy: IOPMAssertionCreateWithName failed: \(result)") }
    }

    func disable() {
        guard isActive else { return }
        IOPMAssertionRelease(assertionID)
        assertionID = 0
        isActive = false
    }
}
