// Flowing gradient background (WebGL): today's colours ripple and drift like water.
// Rendered at a reduced resolution and ~30 fps — a soft gradient needs no more — so it stays
// cheap even under the glass panels. Returns null when WebGL is unavailable (caller falls back
// to the static CSS gradient).
import type { GradientScene, Hsl } from './background'

export type FlowSpeedKey = 'slow' | 'normal' | 'fast'

/** Time multiplier per speed setting. */
export const FLOW_RATE: Record<FlowSpeedKey, number> = { slow: 0.5, normal: 1, fast: 1.8 }

/** Angular speed of the main ripple in the shader (rad per second at rate 1). */
const RIPPLE = 1.2

/** Seconds for one ripple to pass at a speed (shown next to the speed buttons). */
export function rippleSeconds(speed: FlowSpeedKey): number {
  return Math.round((2 * Math.PI) / (RIPPLE * FLOW_RATE[speed]))
}

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec2 uDir;
uniform vec3 uBase0;
uniform vec3 uBase1;
uniform vec3 uCol[4];
uniform vec2 uPos[4];

vec3 hueShift(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float h = atan(yiq.z, yiq.y) + a;
  float ch = length(yiq.yz);
  return toRGB * vec3(yiq.x, ch * cos(h), ch * sin(h));
}

void main() {
  vec2 p = vUv;
  float t = uTime;
  // water: travelling sine waves bend the whole gradient, so colour edges ripple and flow
  vec2 w = p;
  w.x += 0.08 * sin(p.y * 5.0 + t * ${RIPPLE.toFixed(1)}) + 0.035 * sin(p.y * 11.0 - t * 1.9 + 1.3);
  w.y += 0.07 * sin(p.x * 4.0 - t * 1.0 + 0.7) + 0.03 * sin(p.x * 9.0 + t * 1.6);
  float g = dot(w - 0.5, uDir) / (0.5 * (abs(uDir.x) + abs(uDir.y))) * 0.5 + 0.5;
  vec3 col = mix(uBase0, uBase1, clamp(g, 0.0, 1.0));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = uPos[i] + vec2(0.16 * sin(t * 0.45 + fi * 1.7), 0.12 * cos(t * 0.38 + fi * 2.3));
    vec2 d = w - c;
    d.x *= uAspect;
    col = mix(col, uCol[i], 0.85 * (1.0 - smoothstep(0.0, 0.62, length(d))));
  }
  col = hueShift(col, 0.28 * sin(t * 0.12)); // today's colours slowly shift (about ±16°)
  // dither: wide, soft gradients would otherwise show bands on 8-bit screens
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(clamp(col + (n - 0.5) / 255.0, 0.0, 1.0), 1.0);
}
`

export function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

export interface FlowOptions {
  scene: GradientScene
  rate: number
  /** false: draw one still frame */
  animate: boolean
  paused: boolean
}

export interface FlowHandle {
  update(opts: FlowOptions): void
  destroy(): void
}

/** Debug info on the canvas element (read by browser tests). */
export interface FlowDebug {
  frames: number
  time: number
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null
}

export function startFlow(canvas: HTMLCanvasElement, initial: FlowOptions, cfg: { scale: number; fps: number }): FlowHandle | null {
  const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const prog = gl.createProgram()
  if (!vs || !fs || !prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(prog, name)
  const uTime = u('uTime')
  const uAspect = u('uAspect')

  let opts = initial
  const debug: FlowDebug = { frames: 0, time: 0 }
  ;(canvas as HTMLCanvasElement & { flowDebug?: FlowDebug }).flowDebug = debug

  const setScene = (scene: GradientScene) => {
    const rad = (scene.angle * Math.PI) / 180
    gl.uniform2f(u('uDir'), Math.sin(rad), Math.cos(rad)) // CSS angle: 0° = towards the top
    gl.uniform3fv(u('uBase0'), hslToRgb(scene.baseHsl[0]))
    gl.uniform3fv(u('uBase1'), hslToRgb(scene.baseHsl[1]))
    gl.uniform3fv(u('uCol'), scene.blobs.flatMap((b) => hslToRgb(b.hsl)))
    gl.uniform2fv(u('uPos'), scene.blobs.flatMap((b) => [b.x / 100, 1 - b.y / 100]))
  }

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * cfg.scale))
    const h = Math.max(1, Math.round(canvas.clientHeight * cfg.scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    gl.uniform1f(uAspect, w / h)
  }

  const draw = () => {
    gl.uniform1f(uTime, debug.time)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    debug.frames++
  }

  let raf = 0
  let last = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (!last) last = now
    const dt = now - last
    if (dt < 1000 / cfg.fps - 2) return
    last = now
    debug.time += Math.min(dt, 100) / 1000 * opts.rate // integrate, so speed changes never jump
    draw()
  }
  const run = () => {
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    if (opts.animate && !opts.paused) raf = requestAnimationFrame(loop)
  }

  const ro = new ResizeObserver(() => {
    resize()
    draw()
  })
  ro.observe(canvas)

  setScene(opts.scene)
  resize()
  draw()
  run()

  return {
    update(next) {
      if (next.scene !== opts.scene) setScene(next.scene)
      opts = next
      draw()
      run()
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
