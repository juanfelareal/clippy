import SwiftUI

struct AnnotationEditorView: View {
    @ObservedObject var document: AnnotationDocument
    var onCopy: () -> Void
    var onSave: () -> Void

    @FocusState private var textFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            GeometryReader { geo in
                let fit = fittedRect(in: geo.size)
                ZStack {
                    Color(nsColor: .windowBackgroundColor)
                    canvasContent(fit: fit)
                        .frame(width: fit.width, height: fit.height)
                        .position(x: fit.midX, y: fit.midY)
                }
            }
        }
        .frame(minWidth: 480, minHeight: 320)
    }

    // MARK: - Layout

    private func fittedRect(in available: CGSize) -> CGRect {
        let pixel = document.pixelSize
        guard pixel.width > 0, pixel.height > 0, available.width > 0, available.height > 0 else {
            return .zero
        }
        let scale = min(available.width / pixel.width, available.height / pixel.height)
        let size = CGSize(width: pixel.width * scale, height: pixel.height * scale)
        return CGRect(x: (available.width - size.width) / 2,
                      y: (available.height - size.height) / 2,
                      width: size.width, height: size.height)
    }

    // MARK: - Canvas

    @ViewBuilder
    private func canvasContent(fit: CGRect) -> some View {
        let displayScale = fit.width / document.pixelSize.width

        ZStack(alignment: .topLeading) {
            Image(nsImage: document.baseImage)
                .resizable()
                .interpolation(.high)

            Canvas { ctx, _ in
                for annotation in document.annotations where annotation.tool == .blur {
                    drawBlurPreview(annotation, ctx: &ctx, scale: displayScale)
                }
                for annotation in document.annotations where annotation.tool != .blur {
                    drawAnnotation(annotation, ctx: &ctx, scale: displayScale)
                }
                if let live = document.inProgress {
                    if live.tool == .blur {
                        let rect = scaled(AnnotationRenderer.normalizedRect(live), by: displayScale)
                        ctx.fill(Path(rect), with: .color(.black.opacity(0.35)))
                    } else {
                        drawAnnotation(live, ctx: &ctx, scale: displayScale)
                    }
                }
            }

            if let pending = document.pendingText {
                TextField("Texto…", text: pendingTextBinding)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: max(12, 18 * displayScale * document.pixelDensity), weight: .bold))
                    .foregroundColor(Color(nsColor: document.color))
                    .frame(width: 220)
                    .focused($textFieldFocused)
                    .onSubmit { commitPendingText() }
                    .offset(x: pending.anchor.x * displayScale,
                            y: pending.anchor.y * displayScale)
                    .onAppear { textFieldFocused = true }
            }
        }
        .gesture(dragGesture(displayScale: displayScale))
    }

    private var pendingTextBinding: Binding<String> {
        Binding(
            get: { document.pendingText?.text ?? "" },
            set: { document.pendingText?.text = $0 }
        )
    }

    func commitPendingText() {
        guard let pending = document.pendingText else { return }
        if !pending.text.trimmingCharacters(in: .whitespaces).isEmpty {
            document.commit(Annotation(tool: .text,
                                       points: [pending.anchor],
                                       color: document.color,
                                       lineWidth: document.currentLineWidth,
                                       text: pending.text,
                                       fontSize: document.currentFontSize))
        }
        document.pendingText = nil
    }

    // MARK: - Drawing

    private func scaled(_ rect: CGRect, by scale: CGFloat) -> CGRect {
        CGRect(x: rect.minX * scale, y: rect.minY * scale,
               width: rect.width * scale, height: rect.height * scale)
    }

    private func scaled(_ point: CGPoint, by scale: CGFloat) -> CGPoint {
        CGPoint(x: point.x * scale, y: point.y * scale)
    }

    private func drawAnnotation(_ annotation: Annotation, ctx: inout GraphicsContext, scale: CGFloat) {
        let color = Color(nsColor: annotation.color)
        let width = annotation.lineWidth * scale
        let style = StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round)

        switch annotation.tool {
        case .arrow:
            guard annotation.points.count >= 2 else { return }
            let start = scaled(annotation.points[0], by: scale)
            let end = scaled(annotation.points[annotation.points.count - 1], by: scale)
            let (line, head) = AnnotationRenderer.arrowPath(from: start, to: end, width: width)
            ctx.stroke(Path(line), with: .color(color), style: style)
            ctx.fill(Path(head), with: .color(color))
        case .rect:
            let rect = scaled(AnnotationRenderer.normalizedRect(annotation), by: scale)
            ctx.stroke(Path(rect), with: .color(color), style: style)
        case .pen:
            let points = annotation.points.map { scaled($0, by: scale) }
            ctx.stroke(Path(AnnotationRenderer.penPath(points: points)), with: .color(color), style: style)
        case .text:
            guard let text = annotation.text, let anchor = annotation.points.first else { return }
            ctx.draw(
                Text(text)
                    .font(.system(size: annotation.fontSize * scale, weight: .bold))
                    .foregroundColor(color),
                at: scaled(anchor, by: scale),
                anchor: .topLeading
            )
        case .blur:
            break
        }
    }

    private func drawBlurPreview(_ annotation: Annotation, ctx: inout GraphicsContext, scale: CGFloat) {
        let rect = AnnotationRenderer.clamp(AnnotationRenderer.normalizedRect(annotation),
                                            to: document.pixelSize)
        let displayRect = scaled(rect, by: scale)
        if let patch = document.blurPatches[annotation.id] {
            ctx.draw(Image(decorative: patch, scale: 1), in: displayRect)
        } else {
            ctx.fill(Path(displayRect), with: .color(.black.opacity(0.85)))
        }
    }

    // MARK: - Gestures

    private func dragGesture(displayScale: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard document.pendingText == nil else { return }
                let start = pixelPoint(value.startLocation, scale: displayScale)
                let current = pixelPoint(value.location, scale: displayScale)
                switch document.tool {
                case .arrow, .rect, .blur:
                    document.inProgress = Annotation(tool: document.tool,
                                                     points: [start, current],
                                                     color: document.color,
                                                     lineWidth: document.currentLineWidth,
                                                     text: nil,
                                                     fontSize: document.currentFontSize)
                case .pen:
                    if var live = document.inProgress {
                        live.points.append(current)
                        document.inProgress = live
                    } else {
                        document.inProgress = Annotation(tool: .pen,
                                                         points: [start, current],
                                                         color: document.color,
                                                         lineWidth: document.currentLineWidth,
                                                         text: nil,
                                                         fontSize: document.currentFontSize)
                    }
                case .text:
                    break
                }
            }
            .onEnded { value in
                let start = pixelPoint(value.startLocation, scale: displayScale)
                let current = pixelPoint(value.location, scale: displayScale)

                if document.tool == .text {
                    if document.pendingText != nil {
                        commitPendingText() // click elsewhere commits current text
                    } else {
                        document.pendingText = PendingText(anchor: current)
                    }
                    return
                }
                guard let live = document.inProgress else { return }
                document.inProgress = nil
                let distance = hypot(current.x - start.x, current.y - start.y)
                let minDistance = 3 * document.pixelDensity
                if live.tool == .pen ? live.points.count > 2 : distance > minDistance {
                    document.commit(live)
                }
            }
    }

    private func pixelPoint(_ location: CGPoint, scale: CGFloat) -> CGPoint {
        let x = min(max(location.x / scale, 0), document.pixelSize.width)
        let y = min(max(location.y / scale, 0), document.pixelSize.height)
        return CGPoint(x: x, y: y)
    }

    // MARK: - Toolbar

    private var toolbar: some View {
        HStack(spacing: 14) {
            HStack(spacing: 4) {
                ForEach(AnnotationTool.allCases, id: \.self) { tool in
                    Button {
                        document.tool = tool
                    } label: {
                        Image(systemName: tool.symbol)
                            .font(.system(size: 14, weight: .medium))
                            .frame(width: 30, height: 26)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(document.tool == tool ? Color.accentColor.opacity(0.25) : .clear)
                            )
                    }
                    .buttonStyle(.plain)
                    .help(tool.label)
                }
            }

            Divider().frame(height: 20)

            HStack(spacing: 6) {
                ForEach(Array(AnnotationDocument.palette.enumerated()), id: \.offset) { _, color in
                    Button {
                        document.color = color
                    } label: {
                        Circle()
                            .fill(Color(nsColor: color))
                            .frame(width: 16, height: 16)
                            .overlay(
                                Circle().stroke(Color.primary.opacity(
                                    document.color == color ? 0.8 : 0.15), lineWidth: 2)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            Divider().frame(height: 20)

            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    Button {
                        document.strokeIndex = index
                    } label: {
                        Circle()
                            .fill(Color.primary.opacity(document.strokeIndex == index ? 1 : 0.35))
                            .frame(width: CGFloat(6 + index * 3), height: CGFloat(6 + index * 3))
                            .frame(width: 18, height: 18)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer()

            Button("Deshacer") { document.undo() }
                .disabled(document.annotations.isEmpty)
            Button("Copiar") { onCopy() }
                .keyboardShortcut("c", modifiers: .command)
            Button("Guardar…") { onSave() }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
