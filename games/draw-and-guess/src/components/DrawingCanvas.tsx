import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const STROKE_WIDTH = 4;
const ERASER_WIDTH = 24;

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
  clearRemote: () => void;
}

interface DrawingCanvasProps {
  /** Sadece o turun çizeni çizebilir — herkes tuvale müdahale edemesin diye. */
  canDraw?: boolean;
  /** Online modda her yerel çizim noktasını odaya yayınlamak için. */
  onStroke?: (x: number, y: number, newStroke: boolean, color: string, isEraser: boolean) => void;
  onClear?: () => void;
}

function applyToolStyle(context: CanvasRenderingContext2D, color: string, isEraser: boolean) {
  context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.lineWidth = isEraser ? ERASER_WIDTH : STROKE_WIDTH;
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
  function DrawingCanvas({ canDraw = true, onStroke, onClear }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);
    const [color, setColor] = useState<string>(PEN_COLORS[0]);
    const [isEraser, setIsEraser] = useState(false);
    const colorRef = useRef(color);
    const isEraserRef = useRef(isEraser);
    colorRef.current = color;
    isEraserRef.current = isEraser;

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
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      isDrawingRef.current = true;
      setIsEmpty(false);
      applyToolStyle(context, colorRef.current, isEraserRef.current);
      const { x, y } = getPoint(event);
      context.beginPath();
      context.moveTo(x, y);
      onStroke?.(x, y, true, colorRef.current, isEraserRef.current);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!isDrawingRef.current) return;
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      applyToolStyle(context, colorRef.current, isEraserRef.current);
      const { x, y } = getPoint(event);
      context.lineTo(x, y);
      context.stroke();
      onStroke?.(x, y, false, colorRef.current, isEraserRef.current);
    }

    function stopDrawing() {
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
            <button
              type="button"
              className={`btn-secondary tool-button${isEraser ? ' is-selected' : ''}`}
              aria-pressed={isEraser}
              onClick={() => setIsEraser((current) => !current)}
            >
              🧹 Silgi
            </button>
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
