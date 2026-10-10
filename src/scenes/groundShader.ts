// The isometric home map's ground, drawn by two fragment shaders at full screen resolution so it
// is as sharp as the owner's house sprites (a pre-painted picture had to be stretched ~2.4x on a
// phone). Each pixel works out its world position, reads the ground fields baked by
// tools/village/build_ground.py (src/assets/terrain/masks.webp) and paints the owner's textures:
//   ground  grass (forest-tinted under the trees), dirt roads with a dark rim, water with a bank line,
//           foam and a slow drift
//   paving  the plaza's slabs (projected into diamonds) and the vegetable plot's soil, on top
// Edges come from the baked fields (0.5 = the edge) roughened by the grass painting itself, so they
// stay crisp at any zoom. Needs WebGL; WorldScene falls back to the small ground.webp picture.
import Phaser from 'phaser';
import { MH, MW, T } from '../core/mapgen';
import { ISO } from './view';

export const TERRAIN_TEX = {
  grass: 'terrain:grass',
  dirt: 'terrain:dirt',
  water: 'terrain:water',
  soil: 'terrain:soil',
  plaza: 'terrain:plaza',
  masks: 'terrain:masks',
} as const;

const VERT = `
precision highp float;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
attribute vec2 inPosition;
varying vec2 vPos;
void main () {
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(inPosition, 1.0, 1.0);
  vPos = inPosition;
}`;

/** shared helpers: screen px → world px, mask quadrants, rotation */
const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vPos;
const float OX = ${(MH * T).toFixed(1)};
const vec2 WORLD = vec2(${(MW * T).toFixed(1)}, ${(MH * T).toFixed(1)});
const float GRASS_LUM = 0.556;
vec2 toWorld (vec2 p) {
  float u = p.x - OX;
  return vec2(p.y + u * 0.5, p.y - u * 0.5);
}
vec3 masks (sampler2D m, vec2 w, vec2 quad) {
  vec2 uv = (clamp(w, vec2(0.5), WORLD - 0.5) + quad * 1024.0) / 2048.0;
  return texture2D(m, uv).rgb;
}
vec2 rot (vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
float lum (vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

const GROUND_FRAG = `${COMMON}
uniform float time;
uniform sampler2D iChannel0; // grass
uniform sampler2D iChannel1; // dirt
uniform sampler2D iChannel2; // water
uniform sampler2D iChannel3; // masks
void main () {
  vec2 w = toWorld(vPos);
  vec3 grass = texture2D(iChannel0, vPos / 169.0).rgb;
  float inside = step(0.0, w.x) * step(0.0, w.y) * step(w.x, WORLD.x) * step(w.y, WORLD.y);
  vec3 a = masks(iChannel3, w, vec2(0.0, 0.0)); // dirt, water, forest
  vec3 b = masks(iChannel3, w, vec2(1.0, 0.0)); // plaza, soil, east-west road
  vec3 c = masks(iChannel3, w, vec2(0.0, 1.0)); // shade, water depth
  float forest = mix(1.0, a.b, inside);
  vec3 col = grass * (0.88 + 0.22 * c.r);
  col = mix(col, col * vec3(0.6, 0.7, 0.58), forest);
  if (inside < 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  float grain = lum(grass) - GRASS_LUM;

  // dirt roads: ruts turned along the road, grass blades breaking the edge, a dark rim on the grass side
  // (most of the map is plain grass: skip the texture reads there)
  float e = a.r + grain * 2.0;
  if (e > 0.3) {
    vec3 dx = texture2D(iChannel1, rot(vPos, -1.1071) / 187.0).rgb;
    vec3 dy = texture2D(iChannel1, rot(vPos, 1.1071) / 187.0).rgb;
    vec3 dirt = mix(dy, dx, clamp(b.b * 2.0 - 0.5, 0.0, 1.0)) * (0.93 + 0.1 * c.r);
    float dirtA = smoothstep(0.47, 0.53, e);
    float rim = smoothstep(0.37, 0.47, e) * (1.0 - dirtA);
    col = mix(col, vec3(0.247, 0.416, 0.165), rim * 0.55);
    col = mix(col, dirt, dirtA);
  }

  // water: a slow drift, darker away from the bank, an earth bank line and light foam at the edge
  float we = a.g + grain * 1.2;
  float waterA = smoothstep(0.48, 0.52, we);
  if (we > 0.3) {
    vec2 uv = vec2(vPos.x / 231.0, vPos.y / 289.0) + time * vec2(0.004, 0.0025) + 0.003 * sin(vPos.yx * 0.06 + time * 0.8);
    vec3 water = texture2D(iChannel2, uv).rgb * (1.0 - 0.28 * c.g);
    float bank = smoothstep(0.34, 0.47, we) * (1.0 - waterA);
    float foam = (1.0 - smoothstep(0.52, 0.6, we)) * waterA;
    col = mix(col, vec3(0.29, 0.227, 0.141), bank * 0.7);
    col = mix(col, water, waterA);
    col = mix(col, vec3(0.91, 1.0, 0.973), foam * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const PAVING_FRAG = `${COMMON}
uniform sampler2D iChannel0; // plaza slabs
uniform sampler2D iChannel1; // soil
uniform sampler2D iChannel2; // masks
void main () {
  vec2 w = toWorld(vPos);
  vec3 b = masks(iChannel2, w, vec2(1.0, 0.0)); // plaza, soil
  if ((b.r < 0.25 && b.g < 0.4) || w.x < 0.0 || w.y < 0.0 || w.x > WORLD.x || w.y > WORLD.y) discard;
  // slabs are laid on the world grid (one per tile), so they come out as diamonds
  vec3 slab = texture2D(iChannel0, w / 128.0).rgb;
  float plazaA = smoothstep(0.45, 0.55, b.r);
  float edge = smoothstep(0.25, 0.45, b.r) * (1.0 - plazaA);
  vec3 soil = texture2D(iChannel1, rot(vPos, -0.4636) / 116.0).rgb;
  float soilA = smoothstep(0.46, 0.54, b.g);
  vec3 col = mix(vec3(0.431, 0.4, 0.306), slab, plazaA);
  float alpha = max(plazaA + edge * 0.7, soilA);
  col = mix(col, soil, soilA);
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const repeat = { repeat: true, minFilter: 'linear_mipmap_linear', magFilter: 'linear' };
const clampLinear = { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge', minFilter: 'linear', magFilter: 'linear' };

/** True when the shaders can run (WebGL renderer). */
export function canShadeGround(scene: Phaser.Scene): boolean {
  return scene.game.renderer.type === Phaser.WEBGL;
}

/** The two ground layers over the whole isometric map (game px of the drawing layer, origin top-left). */
export function makeGroundShaders(scene: Phaser.Scene): [Phaser.GameObjects.Shader, Phaser.GameObjects.Shader] {
  const ground = scene.add.shader(new Phaser.Display.BaseShader('ground', GROUND_FRAG, VERT), 0, 0, ISO.width, ISO.height).setOrigin(0);
  ground.setSampler2D('iChannel0', TERRAIN_TEX.grass, 0, repeat);
  ground.setSampler2D('iChannel1', TERRAIN_TEX.dirt, 1, repeat);
  ground.setSampler2D('iChannel2', TERRAIN_TEX.water, 2, repeat);
  ground.setSampler2D('iChannel3', TERRAIN_TEX.masks, 3, clampLinear);
  const paving = scene.add.shader(new Phaser.Display.BaseShader('paving', PAVING_FRAG, VERT), 0, 0, ISO.width, ISO.height).setOrigin(0);
  paving.setSampler2D('iChannel0', TERRAIN_TEX.plaza, 0, repeat);
  paving.setSampler2D('iChannel1', TERRAIN_TEX.soil, 1, repeat);
  paving.setSampler2D('iChannel2', TERRAIN_TEX.masks, 2, clampLinear);
  return [ground, paving];
}
