import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { findShape, SHAPES, SHAPE_CATEGORIES, type ShapeCategory } from '../domain/shapes';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const STROKE_WIDTH = 4;
const ERASER_WIDTH = 24;
/** Sürükleme neredeyse yoksa (tek tık) şekil bu boyutta, tıklanan noktayı merkez alarak basılır. */
const DEFAULT_SHAPE_SIZE = 48;
const MIN_DRAG_DISTANCE = 4;

/** Kalem paleti — herkesin ekranında aynı sırayla görünsün diye sabit liste. */
const PEN_COLORS = [
  '#241a35', // varsayılan - koyu mor-siyah
  '#e63946', // kırmızı
  '#f4a261', // turuncu
  '#e9c46a', // sarı
  '#2a9d8f', // turkuaz
  '#3a86ff', // mavi
  '#8338ec', // mor
  '#ffffff', // beyaz - koyu tuvallerde/karanlık modda vurgu için
] as const;

export interface DrawingCanvasHandle {
  /** Draws one point from a remote drawer's stroke — same coordinate space as the local canvas. */
  applyRemotePoint: (x: number, y: number, newStroke: boolean, color: string, isEraser: boolean) => void;
  /** Stamps one ready-made shape from a remote drawer — same bounding-box space as the local canvas. */
  applyRemoteShape: (shapeType: string, x0: number, y0: number, x1: number, y1: number, color: string, filled: boolean) => void;
  clearRemote: () => void;
}

interface DrawingCanvasProps {
  /** Sadece o turun çizeni çizebilir — herkes tuvale müdahale edemesin diye. */
  canDraw?: boolean;
  /** Online modda her yerel çizim noktasını odaya yayınlamak için. */
  onStroke?: (x: number, y: number, newStroke: boolean, color: string, isEraser: boolean) => void;
  onClear?: () => void;
  /** Online modda tamamlanan bir şekil damgasını odaya yayınlamak için. */
  onShape?: (shapeType: string, x0: number, y0: number, x1: number, y1: number, color: string, filled: boolean) => void;
}

function applyToolStyle(context: CanvasRenderingContext2D, color: string, isEraser: boolean) {
  context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.lineWidth = isEraser ? ERASER_WIDTH : STROKE_WIDTH;
}

/** Hazır şekli (dolu ya da kontur) verilen kutuya göre tuvale işler — yerel önizleme, kesinleştirme ve uzaktan gelen damgalar hep bu fonksiyondan geçer. */
function renderShape(
  context: CanvasRenderingContext2D,
  shapeType: string,
  x0: number, y0: number, x1: number, y1: number,
  color: string,
  filled: boolean,
) {
  const shape = findShape(shapeType);
  if (!shape) return;
  const path = shape.buildPath(x0, y0, x1, y1);
  context.globalCompositeOperation = 'source-over';
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = STROKE_WIDTH;
  context.strokeStyle = color;
  context.fillStyle = color;
  if (!shape.strokeOnly && filled) {
    context.fill(path);
  } else {
    context.stroke(path);
  }
}

/** Sürükleme neredeyse yoksa (tek tık — "basa basa ekle" kullanımı) tıklanan noktayı merkez alan sabit boyutlu bir kutuya dönüştürür. */
function normalizeShapeBox(startX: number, startY: number, endX: number, endY: number) {
  if (Math.abs(endX - startX) < MIN_DRAG_DISTANCE && Math.abs(endY - startY) < MIN_DRAG_DISTANCE) {
    const half = DEFAULT_SHAPE_SIZE / 2;
    return { x0: startX - half, y0: startY - half, x1: startX + half, y1: startY + half };
  }
  return { x0: startX, y0: startY, x1: endX, y1: endY };
}

/**
 * Serbest el çizim yüzeyi. Yerel fare/dokunmatik girdisiyle çizer; online
 * modda `onStroke` her noktayı odaya yayınlar, ve dışarıdan `ref` üzerinden
 * `applyRemotePoint`/`clearRemote` çağrılarak diğer oyuncuların çizdikleri de
 * aynı tuvale işlenir — ikisi aynı canvas context'ini paylaşır. Silgi gerçek
 * silme yapar (`destination-out`) — üstüne beyaz boyamak değil, çünkü tuval
 * her zaman beyaz olmayabilir.
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ canDraw = true, onStroke, onClear, onShape }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);
    const [color, setColor] = useState<string>(PEN_COLORS[0]);
    const [isEraser, setIsEraser] = useState(false);
    const colorRef = useRef(color);
    const isEraserRef = useRef(isEraser);
    colorRef.current = color;
    isEraserRef.current = isEraser;

    // Kalem/şekil aracı seçimi — şekil modunda silgi anlamsız, onun yerine
    // dolu/kontur seçeneği çıkar.
    const [tool, setTool] = useState<'pen' | 'shape'>('pen');
    const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
    const [filled, setFilled] = useState(true);
    const [shapePanelOpen, setShapePanelOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<ShapeCategory>('basic');
    const activeShapeDef = activeShapeId ? findShape(activeShapeId) : undefined;
    // Sürüklerken her karede tuvali bu anlık görüntüye geri döndürüp üstüne
    // önizlemeyi çiziyoruz — bırakınca son hali kalıcı oluyor.
    const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
    const shapeSnapshotRef = useRef<ImageData | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      // devicePixelRatio'ya göre boyutlandırmazsak yüksek yoğunluklu
      // ekranlarda çizgiler bulanık çıkar — canvas'ın kendi piksel
      // ızgarasını büyütüp CSS ile geri küçültüyoruz.
      const ratio = window.devicePixelRatio || 1;
      canvas.width = CANVAS_WIDTH * ratio;
      canvas.height = CANVAS_HEIGHT * ratio;
      context.scale(ratio, ratio);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }, []);

    useImperativeHandle(ref, () => ({
      applyRemotePoint(x, y, newStroke, remoteColor, remoteIsEraser) {
        const context = canvasRef.current?.getContext('2d');
        if (!context) return;
        setIsEmpty(false);
        applyToolStyle(context, remoteColor, remoteIsEraser);
        if (newStroke) {
          context.beginPath();
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
          context.stroke();
        }
      },
      applyRemoteShape(shapeType, x0, y0, x1, y1, remoteColor, remoteFilled) {
        const context = canvasRef.current?.getContext('2d');
        if (!context) return;
        setIsEmpty(false);
        renderShape(context, shapeType, x0, y0, x1, y1, remoteColor, remoteFilled);
      },
      clearRemote() {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
      },
    }));

    function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!canDraw) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const { x, y } = getPoint(event);

      if (tool === 'shape') {
        if (!activeShapeId) return;
        isDrawingRef.current = true;
        shapeStartRef.current = { x, y };
        shapeSnapshotRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
        return;
      }

      isDrawingRef.current = true;
      setIsEmpty(false);
      applyToolStyle(context, colorRef.current, isEraserRef.current);
      context.beginPath();
      context.moveTo(x, y);
      onStroke?.(x, y, true, colorRef.current, isEraserRef.current);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!isDrawingRef.current) return;
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      const { x, y } = getPoint(event);

      if (tool === 'shape') {
        if (!activeShapeId || !shapeStartRef.current || !shapeSnapshotRef.current) return;
        context.putImageData(shapeSnapshotRef.current, 0, 0);
        const { x0, y0, x1, y1 } = normalizeShapeBox(shapeStartRef.current.x, shapeStartRef.current.y, x, y);
        renderShape(context, activeShapeId, x0, y0, x1, y1, colorRef.current, filled);
        return;
      }

      applyToolStyle(context, colorRef.current, isEraserRef.current);
      context.lineTo(x, y);
      context.stroke();
      onStroke?.(x, y, false, colorRef.current, isEraserRef.current);
    }

    /** Şekil sürüklemesini bırakılan noktaya göre kesinleştirir — bir tık sonrası pointerup/pointerleave'in ikisinden de gelebilir. */
    function finishShape(endX: number, endY: number) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !activeShapeId || !shapeStartRef.current || !shapeSnapshotRef.current) return;
      context.putImageData(shapeSnapshotRef.current, 0, 0);
      const { x0, y0, x1, y1 } = normalizeShapeBox(shapeStartRef.current.x, shapeStartRef.current.y, endX, endY);
      renderShape(context, activeShapeId, x0, y0, x1, y1, colorRef.current, filled);
      setIsEmpty(false);
      onShape?.(activeShapeId, x0, y0, x1, y1, colorRef.current, filled);
      shapeStartRef.current = null;
      shapeSnapshotRef.current = null;
    }

    function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
      if (tool === 'shape' && isDrawingRef.current) {
        const { x, y } = getPoint(event);
        finishShape(x, y);
      }
      isDrawingRef.current = false;
    }

    function handleClear() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      setIsEmpty(true);
      onClear?.();
    }

    return (
      <div className="drawing-canvas-wrap">
        {canDraw && (
          <div className="drawing-toolbar">
            <div className="color-palette">
              {PEN_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Renk: ${swatch}`}
                  aria-pressed={!isEraser && color === swatch}
                  className={`color-swatch${!isEraser && color === swatch ? ' is-selected' : ''}`}
                  style={{ backgroundColor: swatch }}
                  onClick={() => { setColor(swatch); setIsEraser(false); }}
                />
              ))}
            </div>
            {tool === 'pen' ? (
              <button
                type="button"
                className={`btn-secondary tool-button${isEraser ? ' is-selected' : ''}`}
                aria-pressed={isEraser}
                onClick={() => setIsEraser((current) => !current)}
              >
                🧹 Silgi
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary tool-button"
                onClick={() => setFilled((current) => !current)}
                disabled={activeShapeDef?.strokeOnly}
              >
                {filled ? '🪣 Dolu' : '⭕ Kontur'}
              </button>
            )}
            <button
              type="button"
              className={`btn-secondary tool-button${tool === 'pen' ? ' is-selected' : ''}`}
              onClick={() => { setTool('pen'); setShapePanelOpen(false); }}
            >
              ✏️ Kalem
            </button>
            <button
              type="button"
              className={`btn-secondary tool-button${tool === 'shape' ? ' is-selected' : ''}`}
              aria-expanded={shapePanelOpen}
              onClick={() => setShapePanelOpen((open) => !open)}
            >
              {tool === 'shape' && activeShapeDef ? `${activeShapeDef.icon} ${activeShapeDef.label}` : '🔷 Şekiller'}
            </button>
          </div>
        )}
        {canDraw && shapePanelOpen && (
          <div className="shape-panel">
            <div className="shape-tabs">
              {SHAPE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`shape-tab${activeCategory === cat.id ? ' is-selected' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="shape-grid">
              {SHAPES.filter((shape) => shape.category === activeCategory).map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  title={shape.label}
                  aria-label={shape.label}
                  className={`shape-swatch${tool === 'shape' && activeShapeId === shape.id ? ' is-selected' : ''}`}
                  onClick={() => { setTool('shape'); setActiveShapeId(shape.id); setShapePanelOpen(false); }}
                >
                  {shape.icon}
                </button>
              ))}
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
          className={`drawing-canvas${canDraw ? '' : ' is-readonly'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
        {canDraw && (
          <button type="button" className="clear-button" onClick={handleClear} disabled={isEmpty}>
            Temizle
          </button>
        )}
      </div>
    );
  },
);
