// The jersey recolour shared by Model3D and the 3D match. Plain three.js, no React Native,
// because the match's WebView bundle (match3d/webview/entry.js) imports it too.

/** Jersey tint: target hue in degrees, 'white', 'graphite' (the other mahalle's kit), or null for the lime kit as modelled. */
export type Tint = number | 'white' | 'graphite' | null;

/**
 * Recolours the kit in the shader: texels with a lime hue (42-115°, saturated) take the
 * jersey hue, the rest (skin, hair, shorts) stay. Same rule as scripts/recolor-heroes.py.
 * Each model gets its own materials, so two players can wear different colours.
 */
export function tintMaterials(THREE: typeof import('three'), root: import('three').Object3D) {
  const uniform = { value: new THREE.Vector2(0, 0) }; // x: hue 0..1, y: 0 off, 1 hue, 2 white, 3 graphite
  root.traverse((o) => {
    const mesh = o as import('three').Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = m.clone();
      c.onBeforeCompile = (shader) => {
        shader.uniforms.uTint = uniform;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform vec2 uTint;\n${HSV}`)
          .replace('#include <map_fragment>', `#include <map_fragment>\n${TINT}`);
      };
      c.customProgramCacheKey = () => 'kit-tint';
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
  });
  return (t: Tint) => {
    if (t === null) uniform.value.set(0, 0);
    else if (t === 'white') uniform.value.set(0, 2);
    else if (t === 'graphite') uniform.value.set(0, 3);
    else uniform.value.set(t / 360, 1);
  };
}

const HSV = `
vec3 kitHsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  float h = 0.0;
  if (d > 1e-5) {
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
  }
  return vec3(h / 6.0, mx > 0.0 ? d / mx : 0.0, mx);
}
vec3 kitRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`;

const TINT = `
if (uTint.y > 0.5) {
  vec3 srgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
  vec3 hsv = kitHsv(srgb);
  if (hsv.x >= 42.0 / 360.0 && hsv.x <= 115.0 / 360.0 && hsv.y > 0.18) {
    vec3 o = uTint.y > 2.5
      ? vec3(0.23, 0.24, 0.255) * min(1.0, hsv.z * 1.1)
      : uTint.y > 1.5
      ? vec3(0.95, 0.95, 0.97) * min(1.0, hsv.z * 1.05)
      : kitRgb(vec3(uTint.x, min(1.0, max(hsv.y, 0.2) * 1.7), hsv.z));
    diffuseColor.rgb = pow(o, vec3(2.2));
  }
}`;
