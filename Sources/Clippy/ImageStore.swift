import AppKit
import ImageIO

final class ImageStore {
    private let imagesDir: URL
    private let thumbsDir: URL
    private let thumbCache = NSCache<NSString, NSImage>()

    init() {
        imagesDir = Database.appSupportDir.appendingPathComponent("images", isDirectory: true)
        thumbsDir = Database.appSupportDir.appendingPathComponent("thumbs", isDirectory: true)
        try? FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: thumbsDir, withIntermediateDirectories: true)
    }

    /// Saves the full PNG and a thumbnail. Returns the stored filename.
    func save(pngData: Data, hash: String) -> String {
        let filename = "\(hash).png"
        try? pngData.write(to: imagesDir.appendingPathComponent(filename))
        makeThumbnail(from: pngData, hash: hash)
        return filename
    }

    func fullImageData(filename: String) -> Data? {
        try? Data(contentsOf: imagesDir.appendingPathComponent(filename))
    }

    func thumbnail(for filename: String) -> NSImage? {
        let hash = (filename as NSString).deletingPathExtension
        if let cached = thumbCache.object(forKey: hash as NSString) { return cached }
        let url = thumbsDir.appendingPathComponent("\(hash).jpg")
        guard let image = NSImage(contentsOf: url) else { return nil }
        thumbCache.setObject(image, forKey: hash as NSString)
        return image
    }

    func remove(filename: String) {
        let hash = (filename as NSString).deletingPathExtension
        try? FileManager.default.removeItem(at: imagesDir.appendingPathComponent(filename))
        try? FileManager.default.removeItem(at: thumbsDir.appendingPathComponent("\(hash).jpg"))
        thumbCache.removeObject(forKey: hash as NSString)
    }

    private func makeThumbnail(from pngData: Data, hash: String) {
        guard let src = CGImageSourceCreateWithData(pngData as CFData, nil) else { return }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 192,
            kCGImageSourceCreateThumbnailWithTransform: true
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return }
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else { return }
        try? jpeg.write(to: thumbsDir.appendingPathComponent("\(hash).jpg"))
    }
}
