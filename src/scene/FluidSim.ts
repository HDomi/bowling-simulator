import { PAINT_HEIGHT, PAINT_WIDTH } from '@/domain/paintTexture'
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'

/** 유체 파라미터. */
export const FLUID = {
  /** 속도가 프레임마다 줄어드는 비율. 1에 가까울수록 오래 흐른다. */
  velocityDissipation: 0.982,
  /** 색이 옅어지는 비율. 1이면 칠한 색이 사라지지 않는다. */
  colorDissipation: 1,
  /** 물방울 한 방울의 색 세기. */
  // 1을 넘으면 falloff가 가장자리까지 포화해 물방울 테두리가 원형 계단으로 보인다.
  dropStrength: 1.1,
  /** 물방울이 사방으로 퍼지는 속도. */
  dropSpeed: 0.42,
  /** 손가락으로 휘저을 때 속도 배율. */
  smudgeStrength: 2.6,
  /** 마지막 주입 뒤 이만큼 지나면 멈춘 것으로 본다. */
  settleSeconds: 3,
  /** 시뮬 한 스텝의 최대 시간. 프레임이 밀려도 튀지 않게 한다. */
  maxStep: 1 / 30,
} as const

/** 섞기(랜덤 회전) 설정. */
export const SPIN = {
  /** 총 회전 시간(초). */
  seconds: 2.4,
  /** 축과 속도를 다시 뽑는 주기(초). 방향이 바뀌어야 색이 접히며 섞인다. */
  turnEvery: 0.4,
  /** 표면 각속도 범위(rad/s). 하한이 낮으면 섞이지 않고 그냥 돈다. */
  minRate: 4,
  maxRate: 7.5,
  /**
   * 회전축 기준 위도에 따른 속도 차이(차등 회전).
   *
   * 강체처럼 통째로 돌면 그림이 이동만 하고 안 섞인다. 축 적도와 축 극의 속도를
   * 다르게 줘야 전단이 생겨 펄 볼처럼 결이 늘어난다. 계수를 키울수록 결이 길어진다.
   *
   * 반드시 '회전축 기준' 위도여야 한다 — 텍스처 극 기준으로 재면 발산이 생긴다.
   */
  shearBase: 0.35,
  shearGain: 2,
} as const

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * 이음매를 넘어가는 최단 가로 거리를 구한다. 텍스처는 수평으로 이어져 있다.
 * 위도 보정도 여기서 건다 — 극으로 갈수록 같은 u 차이가 실제로는 짧은 거리다.
 */
const DISTANCE_HELPERS = /* glsl */ `
  float wrapDx(float a, float b) {
    float d = a - b;
    if (d > 0.5) d -= 1.0;
    if (d < -0.5) d += 1.0;
    return d;
  }
  float latScale(float v) {
    return max(0.25, cos((v - 0.5) * 3.14159265));
  }

  /**
   * 구 위에서 이어지도록 UV를 감싼다.
   *
   * v가 0이나 1을 넘는 건 극을 넘어갔다는 뜻이다. 평면에서는 위아래로 벗어나지만
   * 구에서는 반대편 경도로 이어진다. 이걸 clamp로 막으면 색이 극에 쌓이고,
   * 극을 지나야 할 흐름이 통째로 막혀 자오선 하나를 경계로 반구가 갈라진다.
   */
  vec2 wrapSphere(vec2 c) {
    if (c.y < 0.0) {
      c.y = -c.y;
      c.x += 0.5;
    } else if (c.y > 1.0) {
      c.y = 2.0 - c.y;
      c.x += 0.5;
    }
    c.x = fract(c.x + 1.0);
    return c;
  }

  /**
   * 속도는 더하고(uMix 0) 색은 섞는다(uMix 1).
   *
   * 색까지 더하면 밝은 바탕에 물방울을 떨어뜨렸을 때 흰색으로 타 버린다.
   * 물감은 쌓이는 게 아니라 덮는 것이므로 목표 색으로 당겨 준다.
   */
  vec3 blendSplat(vec3 base, vec3 value, float falloff, float strength, float uMix) {
    vec3 added = base + value * falloff * strength;
    vec3 painted = mix(base, value, clamp(falloff * strength, 0.0, 1.0));
    return mix(added, painted, uMix);
  }
`

/** 색과 속도를 한 지점에 주입한다. */
const SPLAT = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uPoint;
  uniform vec3 uValue;
  uniform float uRadius;
  uniform float uAspect;
  uniform float uMix;
  uniform float uStrength;
  uniform float uRadial;
  varying vec2 vUv;
  ${DISTANCE_HELPERS}
  void main() {
    float dx = wrapDx(vUv.x, uPoint.x) * uAspect * latScale(vUv.y);
    float dy = vUv.y - uPoint.y;
    float falloff = exp(-(dx * dx + dy * dy) / max(uRadius * uRadius, 1e-6));
    vec4 base = texture2D(uSource, vUv);

    // 물방울이 사방으로 퍼지게 미는 속도. 중심에서 0이고 반경 부근에서 가장 세다.
    // 짧은 선분 여러 개로 흉내내면 퍼진 자국이 다각형으로 각진다.
    if (uRadial != 0.0) {
      vec2 push = vec2(dx, dy) / max(uRadius, 1e-6) * falloff * uRadial;
      gl_FragColor = vec4(base.xy + push, 0.0, 1.0);
      return;
    }
    gl_FragColor = vec4(blendSplat(base.rgb, uValue, falloff, uStrength, uMix), 1.0);
  }
`

/** 선분을 따라 속도를 주입한다. 드래그 한 번이 끊기지 않게 한다. */
const SPLAT_LINE = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uFrom;
  uniform vec2 uTo;
  uniform vec3 uValue;
  uniform float uRadius;
  uniform float uAspect;
  uniform float uMix;
  uniform float uStrength;
  varying vec2 vUv;
  ${DISTANCE_HELPERS}
  void main() {
    // 선분 위에서 가장 가까운 점을 찾아 그 거리로 감쇠한다.
    float segDx = wrapDx(uTo.x, uFrom.x);
    vec2 seg = vec2(segDx * uAspect, uTo.y - uFrom.y);
    vec2 rel = vec2(wrapDx(vUv.x, uFrom.x) * uAspect, vUv.y - uFrom.y);
    float len2 = max(dot(seg, seg), 1e-8);
    float t = clamp(dot(rel, seg) / len2, 0.0, 1.0);
    vec2 diff = rel - seg * t;
    diff.x *= latScale(vUv.y);
    float falloff = exp(-dot(diff, diff) / max(uRadius * uRadius, 1e-6));
    vec4 base = texture2D(uSource, vUv);
    gl_FragColor = vec4(blendSplat(base.rgb, uValue, falloff, uStrength, uMix), 1.0);
  }
`

/** 속도장을 따라 값을 역추적해 옮긴다. */
const ADVECT = /* glsl */ `
  uniform sampler2D uSource;
  uniform sampler2D uVelocity;
  uniform float uDt;
  uniform float uDissipation;
  uniform float uAspect;
  varying vec2 vUv;
  ${DISTANCE_HELPERS}
  void main() {
    vec2 vel = texture2D(uVelocity, vUv).xy;
    // 속도는 구 위의 각도 단위다. UV로 옮기려면 가로 비율과 위도를 되돌려야 한다.
    // 이 보정이 없으면 물방울이 가로로만 길게 퍼진다.
    vel.x /= uAspect * latScale(vUv.y);
    vec2 coord = wrapSphere(vUv - vel * uDt);
    gl_FragColor = texture2D(uSource, coord) * uDissipation;
  }
`

/** 단색으로 덮는다. */
const FILL = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`

/** 외부 이미지를 색 버퍼로 들여온다. 저장된 페인팅을 이어서 편집할 때 쓴다. */
const COPY = /* glsl */ `
  uniform sampler2D uSource;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uSource, vUv);
  }
`

/**
 * 저장용 읽기 패스. 선형 값을 sRGB로 인코딩해 8비트 타깃에 넣는다.
 *
 * 색 버퍼는 선형이고 캔버스는 sRGB다. 그대로 읽으면 저장한 그림이 밝게 뜬다.
 */
const READ = /* glsl */ `
  uniform sampler2D uSource;
  varying vec2 vUv;

  float toSRGB(float x) {
    return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
  }

  void main() {
    vec4 texel = texture2D(uSource, vUv);
    gl_FragColor = vec4(toSRGB(texel.r), toSRGB(texel.g), toSRGB(texel.b), texel.a);
  }
`

/**
 * MacCormack 보정 이류. 색이 뭉개지는 걸 막는다.
 *
 * 단순 semi-Lagrangian은 매 스텝 이중선형 보간을 한 번씩 하고, 그 보간이 곧 흐림이다.
 * 2초만 돌려도 백 번 넘게 쌓여 두 색이 평균나 버린다 — 펄 볼이 아니라 흙탕물이 된다.
 *
 * 앞으로 한 번, 뒤로 한 번 옮겨 보고 원래 자리와의 차이를 오차로 보아 되돌린다.
 * 오차 보정은 오버슛을 만들므로 역추적 지점 주변 값으로 가둔다.
 */
const MACCORMACK = /* glsl */ `
  uniform sampler2D uSource;
  uniform sampler2D uForward;
  uniform sampler2D uBackward;
  uniform sampler2D uVelocity;
  uniform float uDt;
  uniform float uAspect;
  uniform float uDissipation;
  uniform vec2 uTexel;
  varying vec2 vUv;
  ${DISTANCE_HELPERS}

  void main() {
    vec4 forward = texture2D(uForward, vUv);
    vec4 backward = texture2D(uBackward, vUv);
    vec4 origin = texture2D(uSource, vUv);
    vec4 corrected = forward + 0.5 * (origin - backward);

    vec2 vel = texture2D(uVelocity, vUv).xy;
    vel.x /= uAspect * latScale(vUv.y);
    vec2 coord = wrapSphere(vUv - vel * uDt);

    vec4 a = texture2D(uSource, wrapSphere(coord + vec2(-uTexel.x, -uTexel.y)));
    vec4 b = texture2D(uSource, wrapSphere(coord + vec2(uTexel.x, -uTexel.y)));
    vec4 c = texture2D(uSource, wrapSphere(coord + vec2(-uTexel.x, uTexel.y)));
    vec4 d = texture2D(uSource, wrapSphere(coord + vec2(uTexel.x, uTexel.y)));
    vec4 lo = min(min(a, b), min(c, d));
    vec4 hi = max(max(a, b), max(c, d));

    gl_FragColor = clamp(corrected, lo, hi) * uDissipation;
  }
`

/**
 * 구를 통째로 돌리는 흐름. 섞기 버튼이 쓴다.
 *
 * 속도장을 회전 접선 방향으로 덮어쓴다. 색은 건드리지 않으므로 두 색이 평균나
 * 새 색이 되는 게 아니라, 결이 늘어나며 겹친다 — 펄 볼 표면이 그렇게 생겼다.
 */
const SWIRL = /* glsl */ `
  uniform vec3 uAxis;
  uniform float uRate;
  varying vec2 vUv;

  void main() {
    float lon = (vUv.x - 0.5) * 6.28318531;
    float lat = (vUv.y - 0.5) * 3.14159265;
    float cl = cos(lat);
    float sl = sin(lat);

    // 표면 위의 점과, 그 점에서 경도·위도 방향 단위벡터.
    vec3 p = vec3(cl * cos(lon), sl, cl * sin(lon));
    vec3 eLon = vec3(-sin(lon), 0.0, cos(lon));
    vec3 eLat = vec3(-sl * cos(lon), cl, -sl * sin(lon));

    // 차등 회전. 전단 계수는 반드시 '회전축 기준 위도'만의 함수여야 한다.
    //
    // 그래야 계수의 기울기가 흐름 방향과 직교해 발산이 정확히 0이 된다.
    // 텍스처 극 기준 위도로 계산하면 축과 어긋나 발산이 생기고, 비압축이 깨지면
    // 색이 한쪽으로 쓸려 모인다 — 물방울 자리가 반구를 통째로 먹어 버린다.
    float axial = dot(uAxis, p);
    float shear = ${SPIN.shearBase.toFixed(3)}
      + ${SPIN.shearGain.toFixed(3)} * (1.0 - abs(axial));
    vec3 t = cross(uAxis, p) * uRate * shear;

    // 속도장 단위는 '표면 각도 / π'다. ADVECT가 종횡비와 위도를 되돌린다.
    // 기존 속도와 섞지 않고 통째로 덮는다. 섞으면 발산이 남는다.
    vec2 flow = vec2(dot(t, eLon), dot(t, eLat)) / 3.14159265;
    gl_FragColor = vec4(flow, 0.0, 1.0);
  }
`

/**
 * 렌더 타깃 한 쌍. 읽기와 쓰기를 번갈아 쓴다(핑퐁).
 */
class PingPong {
  private a: WebGLRenderTarget
  private b: WebGLRenderTarget

  constructor(width: number, height: number) {
    const options = {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this.a = new WebGLRenderTarget(width, height, options)
    this.b = new WebGLRenderTarget(width, height, options)
    for (const target of [this.a, this.b]) {
      // 텍스처가 수평으로 이어지므로 u는 반복, v는 가장자리로 물린다.
      target.texture.wrapS = RepeatWrapping
      target.texture.generateMipmaps = false
    }
  }

  get read(): WebGLRenderTarget {
    return this.a
  }

  get write(): WebGLRenderTarget {
    return this.b
  }

  swap(): void {
    const temp = this.a
    this.a = this.b
    this.b = temp
  }

  dispose(): void {
    this.a.dispose()
    this.b.dispose()
  }
}

/**
 * 볼 표면 텍스처 위에서 도는 2D 유체.
 *
 * 물리 엔진이 아니라 셰이더다 — 색을 주입하고(splat), 속도장을 따라 옮기고(advect),
 * 속도를 줄인다(감쇠). 속도가 죽으면 그 자리에 그대로 굳는다.
 */
export class FluidSim {
  private color = new PingPong(PAINT_WIDTH, PAINT_HEIGHT)
  private velocity = new PingPong(PAINT_WIDTH, PAINT_HEIGHT)
  private quadScene = new Scene()
  private quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: Mesh

  private splat: ShaderMaterial
  private splatLine: ShaderMaterial
  private advect: ShaderMaterial
  private fill: ShaderMaterial
  private copy: ShaderMaterial
  private read: ShaderMaterial
  private swirl: ShaderMaterial
  private maccormack: ShaderMaterial

  /** MacCormack 중간 결과를 담을 자리. read = 정방향, write = 역방향. */
  private scratch = new PingPong(PAINT_WIDTH, PAINT_HEIGHT)

  /** 섞기에 남은 시간(초). 0이면 회전하지 않는다. */
  private spinLeft = 0
  /** 지금 축으로 돈 시간. turnEvery를 넘기면 축을 다시 뽑는다. */
  private spinHeld = 0
  private spinAxis = new Vector3(0, 1, 0)
  private spinRate = 0

  /**
   * 저장용 8비트 타깃.
   *
   * 색 버퍼는 HalfFloat이라 Uint8Array로 바로 못 읽는다. 한 번 거쳐 간다.
   */
  private readTarget = new WebGLRenderTarget(PAINT_WIDTH, PAINT_HEIGHT, {
    type: UnsignedByteType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  })

  /** 마지막 주입 이후 흐른 시간. 정착 판정에 쓴다. */
  private sinceInput: number = FLUID.settleSeconds

  constructor(private renderer: WebGLRenderer) {
    const aspect = PAINT_WIDTH / PAINT_HEIGHT
    const uniformsSplat = {
      uSource: { value: null as Texture | null },
      uPoint: { value: new Vector2() },
      uValue: { value: new Vector3() },
      uRadius: { value: 0.05 },
      uAspect: { value: aspect },
      uMix: { value: 0 },
      uStrength: { value: 1 },
      uRadial: { value: 0 },
    }
    this.splat = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: SPLAT,
      uniforms: uniformsSplat,
      depthTest: false,
    })
    this.splatLine = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: SPLAT_LINE,
      uniforms: {
        uSource: { value: null as Texture | null },
        uFrom: { value: new Vector2() },
        uTo: { value: new Vector2() },
        uValue: { value: new Vector3() },
        uRadius: { value: 0.05 },
        uAspect: { value: aspect },
        uMix: { value: 0 },
        uStrength: { value: 1 },
      },
      depthTest: false,
    })
    this.advect = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: ADVECT,
      uniforms: {
        uSource: { value: null as Texture | null },
        uVelocity: { value: null as Texture | null },
        uDt: { value: 0 },
        uDissipation: { value: 1 },
        uAspect: { value: aspect },
      },
      depthTest: false,
    })
    this.fill = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FILL,
      uniforms: { uColor: { value: new Vector3() } },
      depthTest: false,
    })
    this.copy = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: COPY,
      uniforms: { uSource: { value: null as Texture | null } },
      depthTest: false,
    })
    this.read = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: READ,
      uniforms: { uSource: { value: null as Texture | null } },
      depthTest: false,
    })
    this.maccormack = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: MACCORMACK,
      uniforms: {
        uSource: { value: null as Texture | null },
        uForward: { value: null as Texture | null },
        uBackward: { value: null as Texture | null },
        uVelocity: { value: null as Texture | null },
        uDt: { value: 0 },
        uAspect: { value: aspect },
        uDissipation: { value: 1 },
        uTexel: { value: new Vector2(1 / PAINT_WIDTH, 1 / PAINT_HEIGHT) },
      },
      depthTest: false,
    })
    this.swirl = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: SWIRL,
      uniforms: {
        uAxis: { value: new Vector3(0, 1, 0) },
        uRate: { value: 0 },
      },
      depthTest: false,
    })

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.splat)
    this.quadScene.add(this.quad)
  }

  /** 볼 메시가 쓸 색 텍스처. */
  get texture(): Texture {
    return this.color.read.texture
  }

  /** 유체가 아직 흐르는 중인지. */
  get running(): boolean {
    return this.sinceInput < FLUID.settleSeconds
  }

  /**
   * 색 버퍼를 단색으로 덮고 속도를 지운다.
   * @param {string} css - 배경색
   */
  reset(css: string): void {
    const rgb = new Color(css)
    this.fill.uniforms.uColor.value.set(rgb.r, rgb.g, rgb.b)
    this.runPass(this.fill, this.color.write)
    this.color.swap()

    this.fill.uniforms.uColor.value.set(0, 0, 0)
    this.runPass(this.fill, this.velocity.write)
    this.velocity.swap()
    this.sinceInput = FLUID.settleSeconds
  }

  /**
   * 저장된 이미지를 색 버퍼로 들여온다.
   * @param {Texture} source - 불러온 텍스처
   */
  loadFrom(source: Texture): void {
    this.copy.uniforms.uSource.value = source
    this.runPass(this.copy, this.color.write)
    this.color.swap()
  }

  /**
   * 물방울을 떨어뜨린다. 그 자리에 색을 넣고 사방으로 밀어낸다.
   * @param {number} u - UV u
   * @param {number} v - UV v
   * @param {string} css - 색
   * @param {number} radius - UV 기준 반경
   */
  drop(u: number, v: number, css: string, radius: number): void {
    const rgb = new Color(css)
    this.splatColor(u, v, rgb.r, rgb.g, rgb.b, radius, FLUID.dropStrength)

    // 사방으로 퍼지도록 방사형 속도를 준다. 중심에서 바깥으로 미는 셈이다.
    this.splat.uniforms.uSource.value = this.velocity.read.texture
    this.splat.uniforms.uPoint.value.set(u, v)
    this.splat.uniforms.uRadius.value = radius
    this.splat.uniforms.uRadial.value = FLUID.dropSpeed
    this.runPass(this.splat, this.velocity.write)
    this.velocity.swap()
    this.splat.uniforms.uRadial.value = 0
    this.sinceInput = 0
  }

  /**
   * 손가락으로 휘젓는다. 색은 넣지 않고 속도만 준다.
   * @param {{ u: number, v: number }} from - 이전 지점
   * @param {{ u: number, v: number }} to - 현재 지점
   * @param {number} radius - UV 기준 반경
   */
  smudge(from: { u: number; v: number }, to: { u: number; v: number }, radius: number): void {
    let dx = to.u - from.u
    if (dx > 0.5) {
      dx -= 1
    } else if (dx < -0.5) {
      dx += 1
    }
    const dy = to.v - from.v
    if (Math.hypot(dx, dy) < 1e-5) {
      return
    }

    const material = this.splatLine
    material.uniforms.uSource.value = this.velocity.read.texture
    material.uniforms.uFrom.value.set(from.u, from.v)
    material.uniforms.uTo.value.set(to.u, to.v)
    material.uniforms.uRadius.value = radius
    material.uniforms.uMix.value = 0
    material.uniforms.uStrength.value = 1
    material.uniforms.uValue.value.set(
      dx * PAINT_WIDTH * FLUID.smudgeStrength / PAINT_HEIGHT,
      dy * FLUID.smudgeStrength,
      0,
    )
    this.runPass(material, this.velocity.write)
    this.velocity.swap()
    this.sinceInput = 0
  }

  /**
   * 한 스텝 진행한다.
   * @param {number} dt - 프레임 시간(초)
   */
  /**
   * 볼을 무작위로 돌려 색을 섞는다.
   *
   * 축·속도·방향을 매번 새로 뽑고, 도는 중에도 주기마다 다시 뽑는다.
   * 한 방향으로만 돌면 그림이 옆으로 이동만 하고 섞이지 않는다.
   */
  startSpin(): void {
    this.spinLeft = SPIN.seconds
    this.spinHeld = SPIN.turnEvery
    this.sinceInput = 0
  }

  /** 회전축과 속도를 새로 뽑는다. */
  private rollSpin(): void {
    // 구면 위 균일 분포. 한 축으로 몰리면 매번 비슷하게 섞인다.
    const z = Math.random() * 2 - 1
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    this.spinAxis.set(r * Math.cos(angle), z, r * Math.sin(angle))

    const rate = SPIN.minRate + Math.random() * (SPIN.maxRate - SPIN.minRate)
    this.spinRate = Math.random() < 0.5 ? -rate : rate
    this.spinHeld = 0
  }

  step(dt: number): void {
    if (!this.running) {
      return
    }
    const clamped = Math.min(dt, FLUID.maxStep)
    this.sinceInput += clamped

    const spinning = this.spinLeft > 0
    if (spinning) {
      this.spinLeft -= clamped
      this.spinHeld += clamped
      if (this.spinHeld >= SPIN.turnEvery) {
        this.rollSpin()
      }
      this.swirl.uniforms.uAxis.value.copy(this.spinAxis)
      this.swirl.uniforms.uRate.value = this.spinRate
      this.runPass(this.swirl, this.velocity.write)
      this.velocity.swap()
      // 회전이 끝나야 정착 판정이 시작된다.
      this.sinceInput = 0
    } else {
      // 속도를 감쇠시킨다. 회전 중에는 SWIRL이 매 프레임 덮으므로 필요 없다.
      //
      // 자기 이류(uDt = clamped)는 넣지 않는다. 이류는 발산을 만들고, 발산이 생기면
      // 색이 한쪽으로 쓸려 모인다. uDt = 0이면 좌표를 안 옮기고 감쇠만 한다.
      // 소용돌이가 스스로 떠다니지 않을 뿐, 그림으로는 이쪽이 낫다.
      this.advect.uniforms.uSource.value = this.velocity.read.texture
      this.advect.uniforms.uVelocity.value = this.velocity.read.texture
      this.advect.uniforms.uDt.value = 0
      this.advect.uniforms.uDissipation.value = FLUID.velocityDissipation
      this.runPass(this.advect, this.velocity.write)
      this.velocity.swap()
    }

    // 색은 MacCormack으로 옮긴다. 단순 이류로는 몇 초 만에 두 색이 평균나 버린다.
    this.advect.uniforms.uSource.value = this.color.read.texture
    this.advect.uniforms.uVelocity.value = this.velocity.read.texture
    this.advect.uniforms.uDt.value = clamped
    this.advect.uniforms.uDissipation.value = 1
    this.runPass(this.advect, this.scratch.read)

    this.advect.uniforms.uSource.value = this.scratch.read.texture
    this.advect.uniforms.uDt.value = -clamped
    this.runPass(this.advect, this.scratch.write)

    this.maccormack.uniforms.uSource.value = this.color.read.texture
    this.maccormack.uniforms.uForward.value = this.scratch.read.texture
    this.maccormack.uniforms.uBackward.value = this.scratch.write.texture
    this.maccormack.uniforms.uVelocity.value = this.velocity.read.texture
    this.maccormack.uniforms.uDt.value = clamped
    this.maccormack.uniforms.uDissipation.value = FLUID.colorDissipation
    this.runPass(this.maccormack, this.color.write)
    this.color.swap()
  }

  /**
   * 색 버퍼를 캔버스로 읽어 낸다. 저장할 때만 쓴다 — GPU에서 읽어오는 비싼 작업이다.
   * @param {HTMLCanvasElement} canvas - 대상 캔버스
   */
  readToCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    this.read.uniforms.uSource.value = this.color.read.texture
    this.runPass(this.read, this.readTarget)

    const pixels = new Uint8Array(PAINT_WIDTH * PAINT_HEIGHT * 4)
    this.renderer.readRenderTargetPixels(
      this.readTarget,
      0,
      0,
      PAINT_WIDTH,
      PAINT_HEIGHT,
      pixels,
    )

    const image = ctx.createImageData(PAINT_WIDTH, PAINT_HEIGHT)
    // WebGL은 아래에서 위로 읽으므로 행 순서를 뒤집는다. 행 단위로 옮긴다 —
    // 바이트 하나씩 돌면 1024×512에서 200만 번이다.
    const stride = PAINT_WIDTH * 4
    for (let y = 0; y < PAINT_HEIGHT; y += 1) {
      const src = (PAINT_HEIGHT - 1 - y) * stride
      image.data.set(pixels.subarray(src, src + stride), y * stride)
    }
    ctx.putImageData(image, 0, 0)
  }

  /**
   * 자원을 해제한다.
   */
  dispose(): void {
    this.color.dispose()
    this.velocity.dispose()
    this.scratch.dispose()
    this.quad.geometry.dispose()
    this.readTarget.dispose()
    for (const material of [
      this.splat,
      this.splatLine,
      this.advect,
      this.fill,
      this.copy,
      this.read,
      this.swirl,
      this.maccormack,
    ]) {
      material.dispose()
    }
  }

  /** 색 버퍼에 한 방울 찍는다. */
  private splatColor(
    u: number,
    v: number,
    r: number,
    g: number,
    b: number,
    radius: number,
    strength: number,
  ): void {
    const material = this.splat
    material.uniforms.uSource.value = this.color.read.texture
    material.uniforms.uPoint.value.set(u, v)
    material.uniforms.uRadius.value = radius
    material.uniforms.uMix.value = 1
    // strength가 1을 넘으면 가장자리까지 목표 색으로 완전히 당겨진다.
    material.uniforms.uStrength.value = strength
    material.uniforms.uValue.value.set(r, g, b)
    this.runPass(material, this.color.write)
    this.color.swap()
  }


  /** 풀스크린 쿼드를 한 번 그린다. */
  private runPass(material: ShaderMaterial, target: WebGLRenderTarget): void {
    const previous = this.renderer.getRenderTarget()
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.quadScene, this.quadCamera)
    this.renderer.setRenderTarget(previous)
  }
}
