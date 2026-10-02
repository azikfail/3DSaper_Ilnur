import * as THREE from 'three';

/** Each number has its own colour AND its own glyph, so colour is never the only cue. */
export const NUMBER_COLORS = ['#4cc9ff', '#5df2a3', '#ff6b7a', '#b794ff', '#ffb454', '#2ee6d6', '#ffffff', '#aab4c8'];

export function makeDigitMaterials(maxAnisotropy: number): THREE.MeshBasicMaterial[] {
  return NUMBER_COLORS.map((color, i) => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '800 96px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(i + 1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(4,8,16,0.9)';
    ctx.strokeText(label, size / 2, size / 2 + 6);
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillText(label, size / 2, size / 2 + 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  });
}
