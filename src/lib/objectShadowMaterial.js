// Studio/environment illumination must not erase a CAST shadow. Direct
// lighting already samples the shadow map; apply the same visibility to the
// indirect fill, but only where the surface faces a shadow-casting light. The
// side of an object turned away from the light keeps its sky/fill light, so
// turning shadows on adds shadows without darkening every shaded side.
export default function objectShadowMaterial(material) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
float axisShadowFacing = 0.0;
#if NUM_DIR_LIGHT_SHADOWS > 0
for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) axisShadowFacing = max(axisShadowFacing, dot(geometryNormal, directionalLights[i].direction));
#endif
#if NUM_SPOT_LIGHT_SHADOWS > 0
for (int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i++) axisShadowFacing = max(axisShadowFacing, dot(geometryNormal, normalize(spotLights[i].position - geometryPosition)));
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0
for (int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i++) axisShadowFacing = max(axisShadowFacing, dot(geometryNormal, normalize(pointLights[i].position - geometryPosition)));
#endif
float axisIndirectVisibility = mix(1.0, mix(0.2, 1.0, getShadowMask()), smoothstep(0.0, 0.25, axisShadowFacing));
reflectedLight.indirectDiffuse *= axisIndirectVisibility;
reflectedLight.indirectSpecular *= axisIndirectVisibility;`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:axis-object-shadows-v2`;
  return material;
}
