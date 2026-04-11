// Utility helpers for face descriptor handling
export function toFloat32Array(desc) {
  if (!desc) return null;
  // If already Float32Array
  if (desc instanceof Float32Array) return desc;
  // If plain array of numbers
  if (Array.isArray(desc)) return new Float32Array(desc);
  // If it's an object with buffer (e.g., typed array serialized), try Array.from
  try {
    if (desc.buffer && typeof desc.length === "number")
      return new Float32Array(Array.from(desc));
  } catch (e) {
    // fallthrough
  }
  // Last resort: try to JSON-parse if it's a string
  if (typeof desc === "string") {
    try {
      const parsed = JSON.parse(desc);
      if (Array.isArray(parsed)) return new Float32Array(parsed);
    } catch (e) {}
  }
  return null;
}

export function normalizeDescriptor(arr) {
  if (!arr) return null;
  const f32 = toFloat32Array(arr);
  if (!f32) return null;
  let sum = 0;
  for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
  const norm = Math.sqrt(sum) || 1.0;
  const out = new Float32Array(f32.length);
  for (let i = 0; i < f32.length; i++) out[i] = f32[i] / norm;
  return out;
}

export function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function averageDescriptors(list) {
  if (!list || !list.length) return null;
  const mats = list.map(toFloat32Array).filter(Boolean);
  if (!mats.length) return null;
  const len = mats[0].length;
  for (const m of mats) {
    if (m.length !== len) return null;
  }
  const sum = new Float32Array(len);
  for (const m of mats) {
    for (let i = 0; i < len; i++) sum[i] += m[i];
  }
  const avg = new Float32Array(len);
  const n = mats.length;
  for (let i = 0; i < len; i++) avg[i] = sum[i] / n;
  return normalizeDescriptor(avg);
}
