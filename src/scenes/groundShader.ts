// The isometric home map's ground at full screen resolution, so it is as sharp as the owner's house
// sprites (one pre-painted picture had to be stretched ~2.4x on a phone and looked soft).
//
// A fragment shader paints the ground from the owner's textures and the edge fields baked by
// tools/village/build_ground.py (src/assets/terrain/masks.webp): grass (forest-tinted under the
// trees), dirt roads with a dark rim, water with a bank line and foam, the plaza's slabs projected
// into diamonds, the vegetable plot's soil. Edges come from the baked fields (0.5 = the edge)
// roughened by the grass painting itself, so they stay crisp at any zoom.
//
// Painting every screen pixel every frame was too slow on phones, so the ground is cut into square
// tiles (TILE game px) that are each painted once into their own texture at the screen's pixel
// density and then drawn as plain images: the tiles on screen are painted right away, one more tile
// around the view per frame, and tiles far from the view are recycled. Needs WebGL; WorldScene
// falls back to the small ground.webp picture without it.
import Phaser from 'phaser';
import { MH, MW, T } from '../core/mapgen';

export const TERRAIN_TEX = {
  grass: 'terrain:grass',
  dirt: 'terrain:dirt',
  water: 'terrain:water',
  soil: 'terrain:soil',
  plaza: 'terrain:plaza',
  masks: 'terrain:masks',
} as const;

/** tile edge in game px of the drawing layer */
const TILE = 96;
/** tiles kept ready around the view (game px) */
const PREFETCH = 64;
/** spare tile textures kept for reuse */
const POOL_MAX = 12;

const VERT = `
precision highp float;
attribute vec2 aPos;
uniform vec4 uRect;
varying vec2 vPos;
void main () {
  vPos = uRect.xy + aPos * uRect.zw;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vPos; // game px on the isometric drawing layer
uniform sampler2D uGrass;
uniform sampler2D uDirt;
uniform sampler2D uWater;
uniform sampler2D uSoil;
uniform sampler2D uPlaza;
uniform sampler2D uMasks;
const float OX = ${(MH * T).toFixed(1)};
const vec2 WORLD = vec2(${(MW * T).toFixed(1)}, ${(MH * T).toFixed(1)});
const float GRASS_LUM = 0.556;

vec2 toWorld (vec2 p) {
  float u = p.x - OX;
  return vec2(p.y + u * 0.5, p.y - u * 0.5);
}
vec3 masks (vec2 w, vec2 quad) {
  vec2 uv = (clamp(w, vec2(0.5), WORLD - 0.5) + quad * 1024.0) / 2048.0;
  return texture2D(uMasks, uv).rgb;
}
vec2 rot (vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main () {
  vec2 w = toWorld(vPos);
  vec3 grass = texture2D(uGrass, vPos / 169.0).rgb;
  float inside = step(0.0, w.x) * step(0.0, w.y) * step(w.x, WORLD.x) * step(w.y, WORLD.y);
  vec3 a = masks(w, vec2(0.0, 0.0)); // dirt, water, forest
  vec3 c = masks(w, vec2(0.0, 1.0)); // shade, water depth
  vec3 col = grass * (0.88 + 0.22 * c.r);
  col = mix(col, col * vec3(0.6, 0.7, 0.58), mix(1.0, a.b, inside));
  if (inside > 0.5) {
    float grain = dot(grass, vec3(0.299, 0.587, 0.114)) - GRASS_LUM;
    vec3 b = masks(w, vec2(1.0, 0.0)); // plaza, soil, east-west road

    // dirt roads: ruts turned along the road, grass blades breaking the edge, a dark rim on the grass side
    float e = a.r + grain * 2.0;
    if (e > 0.3) {
      vec3 dx = texture2D(uDirt, rot(vPos, -1.1071) / 187.0).rgb;
      vec3 dy = texture2D(uDirt, rot(vPos, 1.1071) / 187.0).rgb;
      vec3 dirt = mix(dy, dx, clamp(b.b * 2.0 - 0.5, 0.0, 1.0)) * (0.93 + 0.1 * c.r);
      float dirtA = smoothstep(0.47, 0.53, e);
      float rim = smoothstep(0.37, 0.47, e) * (1.0 - dirtA);
      col = mix(col, vec3(0.247, 0.416, 0.165), rim * 0.55);
      col = mix(col, dirt, dirtA);
    }

    // water: darker away from the bank, an earth bank line and light foam at the edge
    float we = a.g + grain * 1.2;
    if (we > 0.3) {
      vec2 uv = vec2(vPos.x / 231.0, vPos.y / 289.0) + 0.003 * sin(vPos.yx * 0.06);
      vec3 water = texture2D(uWater, uv).rgb * (1.0 - 0.28 * c.g);
      float waterA = smoothstep(0.48, 0.52, we);
      float bank = smoothstep(0.34, 0.47, we) * (1.0 - waterA);
      float foam = (1.0 - smoothstep(0.52, 0.6, we)) * waterA;
      col = mix(col, vec3(0.29, 0.227, 0.141), bank * 0.7);
      col = mix(col, water, waterA);
      col = mix(col, vec3(0.91, 1.0, 0.973), foam * 0.55);
    }

    // the plaza's slabs lie on the world grid (one per tile), so they come out as diamonds
    if (b.r > 0.25) {
      vec3 slab = texture2D(uPlaza, w / 128.0).rgb;
      float plazaA = smoothstep(0.45, 0.55, b.r);
      float edge = smoothstep(0.25, 0.45, b.r) * (1.0 - plazaA);
      col = mix(col, vec3(0.431, 0.4, 0.306), edge * 0.7);
      col = mix(col, slab, plazaA);
    }
    // the vegetable plot's soil
    if (b.g > 0.4) {
      vec3 soil = texture2D(uSoil, rot(vPos, -0.4636) / 116.0).rgb;
      col = mix(col, soil, smoothstep(0.46, 0.54, b.g));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** True when the ground can be painted by the shader (WebGL renderer). */
export function canShadeGround(scene: Phaser.Scene): boolean {
  return scene.game.renderer.type === Phaser.WEBGL;
}

interface Tile {
  dt: Phaser.Textures.DynamicTexture;
  img: Phaser.GameObjects.Image;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('ground shader: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`ground shader: ${gl.getShaderInfoLog(sh) ?? 'compile failed'}`);
  return sh;
}

/** The home ground as cached tiles painted by the shader. */
export class GroundTiles {
  private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly quad: WebGLBuffer;
  private readonly aPos: number;
  private readonly uRect: WebGLUniformLocation | null;
  private readonly samplers: WebGLTexture[];
  private readonly tiles = new Map<string, Tile>();
  private readonly pool: Tile[] = [];
  /** texture px per tile edge (the screen's pixel density); 0 until the first update */
  private px = 0;
  private visible = true;
  private serial = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly add: <O extends Phaser.GameObjects.GameObject>(o: O) => O,
    private readonly depth: number,
  ) {
    this.renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = (this.gl = this.renderer.gl);
    const prog = gl.createProgram();
    if (!prog) throw new Error('ground shader: createProgram failed');
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`ground shader: ${gl.getProgramInfoLog(prog) ?? 'link failed'}`);
    this.program = prog;
    const buf = gl.createBuffer();
    if (!buf) throw new Error('ground shader: createBuffer failed');
    this.quad = buf;
    this.renderer.pipelines.clear();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.uRect = gl.getUniformLocation(prog, 'uRect');

    // the owner's textures repeat and are minified smoothly; the masks are read about once per world px
    const glTex = (key: string): WebGLTexture => {
      const t = scene.textures.get(key).source[0]?.glTexture?.webGLTexture;
      if (!t) throw new Error(`ground shader: no texture ${key}`);
      return t;
    };
    const names = ['uGrass', 'uDirt', 'uWater', 'uSoil', 'uPlaza', 'uMasks'] as const;
    const keys = [TERRAIN_TEX.grass, TERRAIN_TEX.dirt, TERRAIN_TEX.water, TERRAIN_TEX.soil, TERRAIN_TEX.plaza, TERRAIN_TEX.masks];
    this.samplers = keys.map(glTex);
    gl.useProgram(prog);
    this.samplers.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      const repeat = i < 5;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, repeat ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (repeat) gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(gl.getUniformLocation(prog, names[i] ?? ''), i);
    });
    gl.activeTexture(gl.TEXTURE0);
    this.renderer.pipelines.rebind();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const t of this.tiles.values()) t.img.setVisible(v);
  }

  /** Paints what the view needs: every tile on screen now, one more around it. `density` = screen px per game px. */
  update(view: Phaser.Geom.Rectangle, density: number): void {
    if (!this.visible) return;
    const px = Math.min(2048, Math.ceil(TILE * density));
    if (px !== this.px) {
      // new pixel density (resize, rotation): repaint everything at the new size
      for (const t of [...this.tiles.values(), ...this.pool]) this.destroyTile(t);
      this.tiles.clear();
      this.pool.length = 0;
      this.px = px;
    }
    const range = (pad: number): [number, number, number, number] => [
      Math.floor((view.x - pad) / TILE),
      Math.floor((view.y - pad) / TILE),
      Math.floor((view.right + pad) / TILE),
      Math.floor((view.bottom + pad) / TILE),
    ];
    const [vx0, vy0, vx1, vy1] = range(0);
    const [px0, py0, px1, py1] = range(PREFETCH);
    // recycle tiles well away from the view
    for (const [k, t] of this.tiles) {
      const [tx = 0, ty = 0] = k.split(',').map(Number);
      if (tx < px0 - 1 || tx > px1 + 1 || ty < py0 - 1 || ty > py1 + 1) {
        this.tiles.delete(k);
        t.img.setVisible(false);
        if (this.pool.length < POOL_MAX) this.pool.push(t);
        else this.destroyTile(t);
      }
    }
    let spare = 1;
    for (let ty = py0; ty <= py1; ty++) {
      for (let tx = px0; tx <= px1; tx++) {
        if (this.tiles.has(`${tx},${ty}`)) continue;
        const onScreen = tx >= vx0 && tx <= vx1 && ty >= vy0 && ty <= vy1;
        if (!onScreen) {
          if (spare <= 0) continue;
          spare--;
        }
        this.paint(tx, ty);
      }
    }
  }

  private paint(tx: number, ty: number): void {
    const t = this.pool.pop() ?? this.newTile();
    const rt = t.dt.renderTarget;
    if (!rt) return;
    const { gl, renderer } = this;
    renderer.pipelines.clear();
    rt.bind(true);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(this.uRect, tx * TILE, ty * TILE, TILE, TILE);
    this.samplers.forEach((s, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, s);
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.aPos);
    gl.activeTexture(gl.TEXTURE0);
    rt.unbind();
    renderer.pipelines.rebind();
    t.img.setPosition(tx * TILE, ty * TILE).setDisplaySize(TILE, TILE).setVisible(this.visible);
    this.tiles.set(`${tx},${ty}`, t);
  }

  private newTile(): Tile {
    const key = `groundTile:${this.serial++}`;
    const dt = this.scene.textures.addDynamicTexture(key, this.px, this.px);
    if (!dt) throw new Error('ground shader: no dynamic texture');
    dt.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const img = this.add(this.scene.add.image(0, 0, key).setOrigin(0).setDepth(this.depth));
    return { dt, img };
  }

  private destroyTile(t: Tile): void {
    t.img.destroy();
    t.dt.destroy();
  }
}
