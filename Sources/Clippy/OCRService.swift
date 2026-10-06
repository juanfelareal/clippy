import Foundation
import Vision

enum OCRService {
    /// Recognizes text (Spanish + English) in PNG data. Completion on main thread.
    static func recognize(pngData: Data, completion: @escaping (String?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["es-ES", "en-US"]
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(data: pngData)
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let observations = request.results ?? []
            let text = assemble(observations)
            DispatchQueue.main.async { completion(text.isEmpty ? nil : text) }
        }
    }

    /// Assembles observations into lines/paragraphs by bounding box.
    /// Vision boxes are normalized with bottom-left origin.
    private static func assemble(_ observations: [VNRecognizedTextObservation]) -> String {
        struct Fragment {
            let text: String
            let box: CGRect
            var midY: CGFloat { box.midY }
        }

        let fragments: [Fragment] = observations.compactMap { obs in
            guard let candidate = obs.topCandidates(1).first else { return nil }
            return Fragment(text: candidate.string, box: obs.boundingBox)
        }
        guard !fragments.isEmpty else { return "" }

        // Sort top-to-bottom (higher midY = higher on screen)
        let sorted = fragments.sorted { $0.midY > $1.midY }

        // Group into visual lines
        var lines: [[Fragment]] = []
        for fragment in sorted {
            if var last = lines.last,
               let reference = last.first,
               abs(reference.midY - fragment.midY) < 0.6 * min(reference.box.height, fragment.box.height) {
                last.append(fragment)
                lines[lines.count - 1] = last
            } else {
                lines.append([fragment])
            }
        }

        // Within each line: left-to-right; between lines: paragraph breaks on big gaps
        let avgHeight = fragments.map { $0.box.height }.reduce(0, +) / CGFloat(fragments.count)
        var result = ""
        var previousLineMinY: CGFloat?
        for line in lines {
            let ordered = line.sorted { $0.box.minX < $1.box.minX }
            let lineText = ordered.map(\.text).joined(separator: " ")
            let lineMaxY = line.map { $0.box.maxY }.max() ?? 0
            if let prevMinY = previousLineMinY {
                let gap = prevMinY - lineMaxY
                result += gap > 1.2 * avgHeight ? "\n\n" : "\n"
            }
            result += lineText
            previousLineMinY = line.map { $0.box.minY }.min()
        }
        return result
    }
}
