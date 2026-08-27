/**
 * Hazır şekil kütüphanesi. Her şekil, kullanıcının tuvalde sürüklediği kutuyu
 * (yönü fark etmez — sağdan sola da sürüklenebilir) kendi geometrisine göre
 * dolduran bir `Path2D` üretir. `DrawingCanvas` bu path'i tek bir fırça
 * darbesi gibi (fill ya da stroke ile) tuvale işler, online modda da aynı
 * bounding box karşı tarafa yayınlanır — sunucu sadece dört sayıyı iletir.
 */

export type ShapeCategory = 'basic' | 'fun' | 'mark';

export interface ShapeDef {
  id: string;
  label: string;
  icon: string;
  category: ShapeCategory;
  /** Çizgi/ok/çarpı gibi şekillerde dolgu anlamsız — her zaman kontur çizilir. */
  strokeOnly?: boolean;
  buildPath(x0: number, y0: number, x1: number, y1: number): Path2D;
}

function box(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return {
    left, right, top, bottom,
    width: right - left,
    height: bottom - top,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

function polygonPath(points: ReadonlyArray<readonly [number, number]>): Path2D {
  const path = new Path2D();
  points.forEach(([x, y], index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

/** Kutunun içine oturan düzgün çokgen (elmas, beşgen, altıgen bunun üstünden gider). */
function regularPolygonPath(x0: number, y0: number, x1: number, y1: number, sides: number, rotationDeg: number): Path2D {
  const { cx, cy, width, height } = box(x0, y0, x1, y1);
  const rx = width / 2;
  const ry = height / 2;
  const rotation = (rotationDeg * Math.PI) / 180;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return polygonPath(points);
}

function starPath(x0: number, y0: number, x1: number, y1: number, points: number, innerRatio: number): Path2D {
  const { cx, cy, width, height } = box(x0, y0, x1, y1);
  const rx = width / 2;
  const ry = height / 2;
  const vertices: Array<[number, number]> = [];
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const ratio = i % 2 === 0 ? 1 : innerRatio;
    vertices.push([cx + rx * ratio * Math.cos(angle), cy + ry * ratio * Math.sin(angle)]);
  }
  return polygonPath(vertices);
}

export const SHAPES: ShapeDef[] = [
  // ---- Temel geometrik ----
  {
    id: 'circle', label: 'Daire', icon: '⚪', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { cx, cy, width, height } = box(x0, y0, x1, y1);
      const r = Math.max(Math.min(width, height) / 2, 0.5);
      const path = new Path2D();
      path.arc(cx, cy, r, 0, Math.PI * 2);
      return path;
    },
  },
  {
    id: 'ellipse', label: 'Elips', icon: '🥚', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { cx, cy, width, height } = box(x0, y0, x1, y1);
      const path = new Path2D();
      path.ellipse(cx, cy, Math.max(width / 2, 0.5), Math.max(height / 2, 0.5), 0, 0, Math.PI * 2);
      return path;
    },
  },
  {
    id: 'square', label: 'Kare', icon: '⬛', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { left, top, width, height } = box(x0, y0, x1, y1);
      const side = Math.min(width, height);
      return polygonPath([[left, top], [left + side, top], [left + side, top + side], [left, top + side]]);
    },
  },
  {
    id: 'rectangle', label: 'Dikdörtgen', icon: '▭', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { left, right, top, bottom } = box(x0, y0, x1, y1);
      return polygonPath([[left, top], [right, top], [right, bottom], [left, bottom]]);
    },
  },
  {
    id: 'triangle-equilateral', label: 'Eşkenar Üçgen', icon: '🔺', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      // Yükseklik sürüklenen kutudan değil, gerçek eşkenar üçgen oranından
      // hesaplanır — genişlik neyse üçgen o kadar "eşkenar" kalır.
      const { cx, top, left, width } = box(x0, y0, x1, y1);
      const height = width * (Math.sqrt(3) / 2);
      return polygonPath([[cx, top], [left, top + height], [left + width, top + height]]);
    },
  },
  {
    id: 'triangle-isosceles', label: 'İkizkenar Üçgen', icon: '🔻', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { left, right, top, bottom, cx } = box(x0, y0, x1, y1);
      return polygonPath([[cx, top], [left, bottom], [right, bottom]]);
    },
  },
  {
    id: 'triangle-right', label: 'Dik Üçgen', icon: '📐', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { left, right, top, bottom } = box(x0, y0, x1, y1);
      return polygonPath([[left, top], [left, bottom], [right, bottom]]);
    },
  },
  {
    id: 'diamond', label: 'Elmas', icon: '💎', category: 'basic',
    buildPath: (x0, y0, x1, y1) => regularPolygonPath(x0, y0, x1, y1, 4, -90),
  },
  {
    id: 'trapezoid', label: 'Yamuk', icon: '⏢', category: 'basic',
    buildPath(x0, y0, x1, y1) {
      const { left, right, top, bottom, width } = box(x0, y0, x1, y1);
      const inset = width * 0.22;
      return polygonPath([[left + inset, top], [right - inset, top], [right, bottom], [left, bottom]]);
    },
  },
  {
    id: 'pentagon', label: 'Beşgen', icon: '⬠', category: 'basic',
    buildPath: (x0, y0, x1, y1) => regularPolygonPath(x0, y0, x1, y1, 5, -90),
  },
  {
    id: 'hexagon', label: 'Altıgen', icon: '⬡', category: 'basic',
    buildPath: (x0, y0, x1, y1) => regularPolygonPath(x0, y0, x1, y1, 6, 0),
  },
  {
    id: 'line', label: 'Çizgi', icon: '📏', category: 'basic', strokeOnly: true,
    buildPath(x0, y0, x1, y1) {
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x1, y1);
      return path;
    },
  },
  {
    id: 'arrow', label: 'Ok', icon: '➡️', category: 'basic', strokeOnly: true,
    buildPath(x0, y0, x1, y1) {
      const path = new Path2D();
      path.moveTo(x0, y0);
      path.lineTo(x1, y1);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const headLen = Math.max(10, Math.hypot(x1 - x0, y1 - y0) * 0.22);
      const headAngle = Math.PI / 7;
      path.lineTo(x1 - headLen * Math.cos(angle - headAngle), y1 - headLen * Math.sin(angle - headAngle));
      path.moveTo(x1, y1);
      path.lineTo(x1 - headLen * Math.cos(angle + headAngle), y1 - headLen * Math.sin(angle + headAngle));
      return path;
    },
  },
  // ---- Eğlenceli / organik ----
  {
    id: 'star5', label: 'Yıldız (5)', icon: '⭐', category: 'fun',
    buildPath: (x0, y0, x1, y1) => starPath(x0, y0, x1, y1, 5, 0.45),
  },
  {
    id: 'star6', label: 'Yıldız (6)', icon: '✳️', category: 'fun',
    buildPath: (x0, y0, x1, y1) => starPath(x0, y0, x1, y1, 6, 0.5),
  },
  {
    id: 'moon', label: 'Ay', icon: '🌙', category: 'fun',
    buildPath(x0, y0, x1, y1) {
      const { cx, cy, width, height } = box(x0, y0, x1, y1);
      const rx = Math.max(width / 2, 0.5);
      const ry = Math.max(height / 2, 0.5);
      const path = new Path2D();
      path.ellipse(cx, cy, rx, ry, 0, Math.PI / 2, -Math.PI / 2, false);
      path.ellipse(cx + rx * 0.55, cy, Math.max(rx * 0.75, 0.5), Math.max(ry * 0.92, 0.5), 0, -Math.PI / 2, Math.PI / 2, true);
      path.closePath();
      return path;
    },
  },
  {
    id: 'heart', label: 'Kalp', icon: '❤️', category: 'fun',
    buildPath(x0, y0, x1, y1) {
      const { left, top, width: w, height: h } = box(x0, y0, x1, y1);
      const path = new Path2D();
      const dipY = top + h * 0.28;
      path.moveTo(left + w / 2, top + h);
      path.bezierCurveTo(left - w * 0.1, top + h * 0.55, left + w * 0.05, dipY - h * 0.08, left + w / 2, dipY + h * 0.06);
      path.bezierCurveTo(left + w * 0.95, dipY - h * 0.08, left + w * 1.1, top + h * 0.55, left + w / 2, top + h);
      path.closePath();
      return path;
    },
  },
  {
    id: 'cloud', label: 'Bulut', icon: '☁️', category: 'fun',
    buildPath(x0, y0, x1, y1) {
      const { left, bottom, width: w, height: h, cy } = box(x0, y0, x1, y1);
      const baseY = bottom - h * 0.12;
      const path = new Path2D();
      path.moveTo(left + w * 0.12, baseY);
      path.arc(left + w * 0.28, cy + h * 0.06, w * 0.18, Math.PI * 0.55, Math.PI * 1.65, false);
      path.arc(left + w * 0.5, cy - h * 0.14, w * 0.22, Math.PI * 0.95, Math.PI * 2.05, false);
      path.arc(left + w * 0.74, cy, w * 0.2, Math.PI * 1.25, Math.PI * 2.3, false);
      path.lineTo(left + w * 0.86, baseY);
      path.closePath();
      return path;
    },
  },
  {
    id: 'lightning', label: 'Yıldırım', icon: '⚡', category: 'fun',
    buildPath(x0, y0, x1, y1) {
      const { left, top, width: w, height: h } = box(x0, y0, x1, y1);
      return polygonPath([
        [left + w * 0.55, top],
        [left + w * 0.15, top + h * 0.58],
        [left + w * 0.42, top + h * 0.58],
        [left + w * 0.35, top + h],
        [left + w * 0.85, top + h * 0.4],
        [left + w * 0.55, top + h * 0.4],
      ]);
    },
  },
  {
    id: 'teardrop', label: 'Damla', icon: '💧', category: 'fun',
    buildPath(x0, y0, x1, y1) {
      const { left, top, width: w, height: h } = box(x0, y0, x1, y1);
      const cx = left + w / 2;
      const r = w / 2;
      const cy = top + h - r;
      const path = new Path2D();
      path.moveTo(cx, top);
      path.quadraticCurveTo(left + w, cy - r * 0.35, cx, cy + r);
      path.quadraticCurveTo(left, cy - r * 0.35, cx, top);
      path.closePath();
      return path;
    },
  },
  // ---- İşaret ----
  {
    id: 'speech-bubble', label: 'Konuşma Balonu', icon: '💬', category: 'mark',
    buildPath(x0, y0, x1, y1) {
      const { left, top, right, width, height } = box(x0, y0, x1, y1);
      const r = Math.max(Math.min(width, height) * 0.15, 1);
      const bodyBottom = top + height * 0.8;
      const path = new Path2D();
      path.moveTo(left + r, top);
      path.lineTo(right - r, top);
      path.quadraticCurveTo(right, top, right, top + r);
      path.lineTo(right, bodyBottom - r);
      path.quadraticCurveTo(right, bodyBottom, right - r, bodyBottom);
      path.lineTo(left + width * 0.35, bodyBottom);
      path.lineTo(left + width * 0.22, top + height);
      path.lineTo(left + width * 0.3, bodyBottom);
      path.lineTo(left + r, bodyBottom);
      path.quadraticCurveTo(left, bodyBottom, left, bodyBottom - r);
      path.lineTo(left, top + r);
      path.quadraticCurveTo(left, top, left + r, top);
      path.closePath();
      return path;
    },
  },
  {
    id: 'plus', label: 'Artı', icon: '➕', category: 'mark',
    buildPath(x0, y0, x1, y1) {
      const { left, top, width: w, height: h } = box(x0, y0, x1, y1);
      const cx = left + w / 2;
      const cy = top + h / 2;
      const armX = w * 0.32;
      const armY = h * 0.32;
      return polygonPath([
        [cx - armX / 2, top], [cx + armX / 2, top],
        [cx + armX / 2, cy - armY / 2], [left + w, cy - armY / 2],
        [left + w, cy + armY / 2], [cx + armX / 2, cy + armY / 2],
        [cx + armX / 2, top + h], [cx - armX / 2, top + h],
        [cx - armX / 2, cy + armY / 2], [left, cy + armY / 2],
        [left, cy - armY / 2], [cx - armX / 2, cy - armY / 2],
      ]);
    },
  },
  {
    id: 'cross', label: 'Çarpı', icon: '❌', category: 'mark', strokeOnly: true,
    buildPath(x0, y0, x1, y1) {
      const { left, top, right, bottom } = box(x0, y0, x1, y1);
      const path = new Path2D();
      path.moveTo(left, top);
      path.lineTo(right, bottom);
      path.moveTo(right, top);
      path.lineTo(left, bottom);
      return path;
    },
  },
];

export const SHAPE_CATEGORIES: Array<{ id: ShapeCategory; label: string }> = [
  { id: 'basic', label: 'Temel' },
  { id: 'fun', label: 'Eğlenceli' },
  { id: 'mark', label: 'İşaret' },
];

export function findShape(id: string): ShapeDef | undefined {
  return SHAPES.find((shape) => shape.id === id);
}
