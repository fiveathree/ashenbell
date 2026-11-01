import { Camera, Color, HalfFloatType, Scene, Uniform, WebGLRenderer } from 'three';
import {
  BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, NoiseEffect, RenderPass,
  SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { PALETTE, POST } from '../data/art';

const gradeFrag = /* glsl */ `
uniform float saturation;
uniform vec3 shadowColor;
uniform float shadowAmount;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = mix(vec3(l), inputColor.rgb, saturation);
  c += shadowColor * shadowAmount * (1.0 - smoothstep(0.0, 0.25, l));
  outputColor = vec4(c, inputColor.a);
}`;

/** 調色：降飽和，陰影推向 #1a0f0a */
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      uniforms: new Map<string, Uniform>([
        ['saturation', new Uniform(POST.saturation)],
        ['shadowColor', new Uniform(new Color(PALETTE.shadow))],
        ['shadowAmount', new Uniform(POST.shadowTint)],
      ]),
    });
  }
}

export function createComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number, q: { ao: boolean; aoHalf: boolean; smaa: boolean }) {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const ao = new N8AOPostPass(scene, camera, w, h);
  ao.configuration.aoRadius = POST.aoRadius;
  ao.configuration.distanceFalloff = POST.aoFalloff;
  ao.configuration.intensity = POST.aoIntensity;
  ao.configuration.gammaCorrection = false;
  ao.configuration.halfRes = q.aoHalf;
  ao.setQualityMode(q.aoHalf ? 'Low' : 'Medium');
  if (q.ao) composer.addPass(ao);

  const bloom = new BloomEffect({
    luminanceThreshold: POST.bloomThreshold,
    luminanceSmoothing: 0.2,
    intensity: POST.bloomStrength,
    mipmapBlur: true,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: POST.vignette });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = POST.grain * 4; // OVERLAY 對暗部影響細，要放大先見到約 0.04 嘅顆粒
  // 全部效果擠埋一個 pass，每多一個全畫面 pass 內置顯示卡都會慢好多
  composer.addPass(new EffectPass(camera, bloom, tone, new GradeEffect(), vignette, noise));
  if (q.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })));
  return composer;
}
