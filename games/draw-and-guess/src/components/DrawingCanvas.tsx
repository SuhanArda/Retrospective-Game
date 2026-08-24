import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const STROKE_COLOR = '#241a35';
const STROKE_WIDTH = 4;

export interface DrawingCanvasHandle {
  /** Draws one point from a remote drawer's stroke — same coordinate space as the local canvas. */
  applyRemotePoint: (x: number, y: number, newStroke: boolean) => void;
  clearRemote: () => void;
}

interface DrawingCanvasProps {
  /** Sadece o turun çizeni çizebilir — herkes tuvale müdahale edemesin diye. */
  canDraw?: boolean;
  /** Online modda her yerel çizim noktasını odaya yayınlamak için. */
  onStroke?: (x: number, y: number, newStroke: boolean) => void;
  onClear?: () => void;
}

/**
 * Serbest el çizim yüzeyi. Yerel fare/dokunmatik girdisiyle çizer; online
 * modda `onStroke` her noktayı odaya yayınlar, ve dışarıdan `ref` üzerinden
 * `applyRemotePoint`/`clearRemote` çağrılarak diğer oyuncuların çizdikleri de
 * aynı tuvale işlenir — ikisi aynı canvas context'ini paylaşır.
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ canDraw = true, onStroke, onClear }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);

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
      context.strokeStyle = STROKE_COLOR;
      context.lineWidth = STROKE_WIDTH;
    }, []);

    useImperativeHandle(ref, () => ({
      applyRemotePoint(x, y, newStroke) {
        const context = canvasRef.current?.getContext('2d');
        if (!context) return;
        setIsEmpty(false);
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
      const { x, y } = getPoint(event);
      context.beginPath();
      context.moveTo(x, y);
      onStroke?.(x, y, true);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!isDrawingRef.current) return;
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      const { x, y } = getPoint(event);
      context.lineTo(x, y);
      context.stroke();
      onStroke?.(x, y, false);
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
