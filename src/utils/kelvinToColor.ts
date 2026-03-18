import * as THREE from 'three';

// Tanner Helland algorithm — converts color temperature to RGB
export function kelvinToColor(kelvin: number): string {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function blendKelvinWithTint(kelvin: number, tintHex: string): THREE.Color {
  const kelvinColor = new THREE.Color(kelvinToColor(kelvin));
  const tintColor = new THREE.Color(tintHex);
  return new THREE.Color(
    kelvinColor.r * tintColor.r,
    kelvinColor.g * tintColor.g,
    kelvinColor.b * tintColor.b,
  );
}
