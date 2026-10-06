// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "Clippy",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Clippy",
            path: "Sources/Clippy",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("SwiftUI"),
                .linkedFramework("Carbon"),
                .linkedFramework("ServiceManagement"),
                .linkedFramework("Vision"),
                .linkedFramework("CoreImage"),
                .linkedFramework("IOKit"),
                .linkedLibrary("sqlite3")
            ]
        )
    ]
)
