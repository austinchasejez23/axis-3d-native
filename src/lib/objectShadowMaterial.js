// Studio/environment illumination must not erase the shadow on an object's
// surface. Direct lighting already samples the shadow map; apply the same
// visibility to its indirect fill, leaving unoccluded surfaces unchanged.
export default function objectShadowMaterial(material) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
float axisIndirectVisibility = mix(0.2, 1.0, getShadowMask());
reflectedLight.indirectDiffuse *= axisIndirectVisibility;
reflectedLight.indirectSpecular *= axisIndirectVisibility;`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:axis-object-shadows-v1`;
  return material;
}