type ChartPoint = {
  x: number;
  y: number;
};

/**
 * Dominio vertical para gráficas de línea: el cambio ocupa como mucho la mitad del alto y el
 * eje nunca abarca menos del 6 % del valor. Ajustar el eje justo a los datos hacía que
 * cualquier cambio cruzara la gráfica de esquina a esquina y que el ruido pareciera tendencia.
 */
export const getLineChartDomain = (values: number[]) => {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const midpoint = (min + max) / 2;
  const span = Math.max((max - min) * 2, Math.abs(midpoint) * 0.06, 1);
  let domainMin = midpoint - span / 2;
  let domainMax = midpoint + span / 2;

  if (min >= 0 && domainMin < 0) {
    domainMax -= domainMin;
    domainMin = 0;
  }

  return { min: domainMin, max: domainMax };
};

/**
 * Curva monótona (Fritsch–Carlson) entre los puntos: suaviza los quiebres sin pasarse nunca
 * por encima o por debajo de un registro real, así que no inventa máximos ni mínimos. Con
 * menos de tres puntos no hay nada que suavizar y se dibujan rectas.
 */
export const buildMonotonePath = (points: ChartPoint[]) => {
  if (points.length === 0) {
    return '';
  }

  if (points.length < 3) {
    return points.reduce((path, point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${path}${command}${point.x} ${point.y} `;
    }, '');
  }

  const secants = points.slice(1).map((point, index) => {
    const dx = point.x - points[index].x;
    return dx === 0 ? 0 : (point.y - points[index].y) / dx;
  });
  const tangents = points.map((_, index) => {
    if (index === 0) {
      return secants[0];
    }
    if (index === points.length - 1) {
      return secants[secants.length - 1];
    }
    const before = secants[index - 1];
    const after = secants[index];
    return before * after <= 0 ? 0 : (before + after) / 2;
  });

  secants.forEach((secant, index) => {
    if (secant === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      return;
    }
    const a = tangents[index] / secant;
    const b = tangents[index + 1] / secant;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * a * secant;
      tangents[index + 1] = scale * b * secant;
    }
  });

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const third = (point.x - previous.x) / 3;
    const c1x = previous.x + third;
    const c1y = previous.y + tangents[index] * third;
    const c2x = point.x - third;
    const c2y = point.y - tangents[index + 1] * third;
    return `${path}C${c1x} ${c1y} ${c2x} ${c2y} ${point.x} ${point.y} `;
  }, `M${points[0].x} ${points[0].y} `);
};
