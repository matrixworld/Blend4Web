#var ABSORB 0.0
#var WATER_LEVEL 0.0
#var SSS_STRENGTH 6.0
#var SSS_WIDTH 0.0

/*============================================================================
                                  INCLUDES
============================================================================*/

#include <std_enums.glsl>
#include <precision_statement.glslf>
#include <fog.glslf>
#include <procedural.glslf>
#include <lighting.glslf>
#include <pack.glslf>
#include <gamma.glslf>

#define REFL_BUMP 0.001  //How much normal affects reflection displacement
#define REFR_BUMP 0.0001 //How much normal affects refraction displacement

/*============================================================================
                               GLOBAL UNIFORMS
============================================================================*/

uniform float u_time;

uniform vec3  u_zenith_color;
uniform float u_environment_energy;

uniform vec3 u_light_positions[NUM_LIGHTS];
uniform vec3 u_light_directions[NUM_LIGHTS];
uniform vec3 u_light_color_intensities[NUM_LIGHTS];
uniform vec4 u_light_factors1[NUM_LIGHTS];
uniform vec4 u_light_factors2[NUM_LIGHTS];
uniform vec3 u_sun_intensity;
uniform vec3 u_sun_direction;

#if REFLECTIVE || REFRACTIVE || WATER_EFFECTS
uniform float u_cam_water_depth;
#endif

#if !DISABLE_FOG 
uniform vec4 u_fog_color_density;
# if WATER_EFFECTS
uniform vec4 u_underwater_fog_color_density;
# endif
#endif

#if !DISABLE_FOG && PROCEDURAL_FOG
uniform mat4 u_cube_fog;
#endif

/*============================================================================
                               SAMPLER UNIFORMS
============================================================================*/

#if NUM_NORMALMAPS > 0
uniform sampler2D u_normalmap0;
#endif

#if REFRACTIVE
uniform sampler2D u_refractmap;
#endif

#if REFLECTIVE
uniform sampler2D u_reflectmap;
#elif TEXTURE_MIRROR
uniform samplerCube u_mirrormap;
#endif

#if SHORE_SMOOTHING
uniform sampler2D u_shore_depth;
#elif ALPHA_MAP
uniform sampler2D u_alphamap;
#endif

#if FOAM
uniform sampler2D u_foam;
#endif

/*============================================================================
                               MATERIAL UNIFORMS
============================================================================*/

uniform vec4  u_diffuse_color; // water color and alpha
uniform vec2  u_diffuse_params;
uniform float u_diffuse_intensity;
uniform float u_ambient; 

uniform vec4 u_fresnel_params;

uniform vec3 u_specular_color;
uniform vec2 u_specular_params;

#if NUM_NORMALMAPS > 0
uniform vec2 u_normalmap0_uv_velocity;
uniform vec2 u_normalmap0_scale;
# if NUM_NORMALMAPS > 1
uniform vec2 u_normalmap1_uv_velocity;
uniform vec2 u_normalmap1_scale;
#  if NUM_NORMALMAPS > 2
uniform vec2 u_normalmap2_uv_velocity;
uniform vec2 u_normalmap2_scale;
#   if NUM_NORMALMAPS > 3
uniform vec2 u_normalmap3_uv_velocity;
uniform vec2 u_normalmap3_scale;
#   endif
#  endif
# endif
#endif

#if REFLECTIVE
uniform float u_reflect_factor;
#elif TEXTURE_MIRROR
uniform float u_mirror_factor;
#endif

#if SHORE_SMOOTHING || !DISABLE_FOG
uniform float u_view_max_depth;
#endif

#if SHORE_PARAMS
uniform vec3 u_shallow_water_col;
uniform vec3 u_shore_water_col;
uniform float u_water_shallow_col_fac;
uniform float u_water_shore_col_fac;
#endif

#if FOAM
uniform float u_foam_factor;
uniform vec2 u_foam_uv_freq;
uniform vec2 u_foam_mag;
uniform vec2 u_foam_scale;
#endif

/*============================================================================
                                   VARYINGS
============================================================================*/

varying vec3 v_eye_dir;
varying vec3 v_pos_world;

#if !GENERATED_MESH
varying vec2 v_texcoord;
#endif

#if DYNAMIC
varying vec3 v_normal;
# if NUM_NORMALMAPS > 0
varying vec3 v_tangent;
varying vec3 v_binormal;
# endif
# if GENERATED_MESH
varying vec3 v_calm_pos_world;
# endif
#endif

#if SHORE_PARAMS
varying vec3 v_shore_params;
#endif

#if SHORE_SMOOTHING || REFLECTIVE || REFRACTIVE
varying vec3 v_tex_pos_clip;
#endif

#if SHORE_SMOOTHING || REFLECTIVE || REFRACTIVE || !DISABLE_FOG
varying float v_view_depth;
#endif

#if REFRACTIVE && SHORE_SMOOTHING
float refraction (in float shore_depth,
                 inout vec2 refract_coord, in vec2 screen_coord) {

    vec4  shore_depth_refr_rgba = texture2D(u_shore_depth, refract_coord);
    float shore_depth_refr      = unpack_depth(shore_depth_refr_rgba);

    // if refracted object is closer than water surface use undisturbed coords
    if (shore_depth_refr < v_view_depth) {
        refract_coord = screen_coord;
        return shore_depth;
    } else {
        return shore_depth_refr;
    }
}
#endif

/*============================================================================
                                    MAIN
============================================================================*/

void main(void) {

#if DYNAMIC
# if NUM_NORMALMAPS > 0
    mat3 tbn_matrix = mat3(v_tangent, v_binormal, v_normal);
# endif
    vec3 normal = normalize(v_normal);
#else // DYNAMIC
# if NUM_NORMALMAPS > 0
    mat3 tbn_matrix = mat3(1.0, 0.0, 0.0,
                           0.0, 0.0, -1.0,
                           0.0, 1.0, 0.0);
# endif
    vec3 normal = vec3(0.0, 1.0, 0.0);
#endif // DYNAMIC

#if DYNAMIC && (REFLECTIVE || FOAM || (WATER_EFFECTS && !DISABLE_FOG)) || GENERATED_MESH
    float dist_to_water = v_pos_world.y - WATER_LEVEL;
#endif

#if GENERATED_MESH
# if DYNAMIC
    vec2 texcoord = vec2(v_calm_pos_world.x, -v_calm_pos_world.z) + 0.5;
# else
    vec2 texcoord = vec2(v_pos_world.x, -v_pos_world.z) + 0.5;
# endif // DYNAMIC
#else
    vec2 texcoord = v_texcoord;
#endif

#if NUM_NORMALMAPS > 0
    // wave motion
    vec3 n_sum = vec3(0.0);
    vec3 tex_norm = texture2D(u_normalmap0, texcoord * u_normalmap0_scale
                                 + u_normalmap0_uv_velocity * u_time).xyz - 0.5;
    n_sum += tex_norm;
# if FOAM
    vec3 n_foam = vec3(0.0);
#  if NORM_FOAM0
    n_foam += tex_norm;
#  endif
# endif
#endif
#if NUM_NORMALMAPS > 1
    tex_norm = texture2D(u_normalmap0, texcoord * u_normalmap1_scale
                                 + u_normalmap1_uv_velocity * u_time).xyz - 0.5;
    n_sum += tex_norm;
# if FOAM
#  if NORM_FOAM1
    n_foam += tex_norm;
#  endif
# endif
#endif
#if NUM_NORMALMAPS > 2
    tex_norm = texture2D(u_normalmap0, texcoord * u_normalmap2_scale
                                 + u_normalmap2_uv_velocity * u_time).xyz - 0.5;
    n_sum += tex_norm;
# if FOAM
#  if NORM_FOAM2
    n_foam += tex_norm;
#  endif
# endif
#endif
#if NUM_NORMALMAPS > 3
    tex_norm = texture2D(u_normalmap0, texcoord * u_normalmap3_scale
                                 + u_normalmap3_uv_velocity * u_time).xyz - 0.5;
    n_sum += tex_norm;
# if FOAM
#  if NORM_FOAM3
    n_foam += tex_norm;
#  endif
# endif
#endif

#if NUM_NORMALMAPS > 0
    // converting normals to tangent space
# if FOAM
    vec3 normal_foam = mix(normal, normalize(tbn_matrix * n_foam), 0.2);
    normal_foam = normalize(normal_foam);
# endif
#  if DYNAMIC
    normal = mix(normal, normalize(tbn_matrix * n_sum), 0.3);
#  else
    normal = mix(normal, normalize(tbn_matrix * n_sum), 0.5);
#  endif
    normal = normalize(normal);
#endif

    vec3 eye_dir = normalize(v_eye_dir);
    vec3 eye_reflected = reflect(-eye_dir, normal);

#if REFLECTIVE || REFRACTIVE
    vec2 screen_coord = v_tex_pos_clip.xy/v_tex_pos_clip.z;
#endif

#if SHORE_SMOOTHING || !DISABLE_FOG
    float surf_dist = v_view_depth * u_view_max_depth;
#endif

#if SHORE_SMOOTHING
    float alpha = u_diffuse_color.a;

    vec4 shore_depth_rgba = texture2DProj(u_shore_depth, v_tex_pos_clip);
    float shore_depth = unpack_depth(shore_depth_rgba);
    float delta = max(shore_depth - v_view_depth, 0.0);

# if REFRACTIVE
    vec2 refract_coord = screen_coord.xy + normal.xz * REFR_BUMP
                                                  / v_view_depth;
    float shore_depth_refr = refraction(shore_depth, refract_coord, screen_coord);
    float delta_refr = max(shore_depth_refr - v_view_depth, 0.0);
    float depth_diff_refr = u_view_max_depth / ABSORB * delta_refr;

    float refract_factor;

    if (u_cam_water_depth < 0.0)
        refract_factor = 0.0;
    else
        refract_factor = min(alpha * depth_diff_refr, 1.0);

    float depth_diff = u_view_max_depth / ABSORB * delta;

    // refraction stuff represent disturbed underwater surface
    // so leave alpha slightly transparent only close to the shore
    alpha = min(15.0 * alpha * u_view_max_depth * delta, 1.0);
# else
    float depth_diff = u_view_max_depth / ABSORB * delta;
    alpha = min(alpha * depth_diff, 1.0);
# endif // REFRACTIVE

    // alpha correction for close to eye pixels
    alpha *= min(5.0 * surf_dist, 1.0);

#else // SHORE_SMOOTHING
# if ALPHA_MAP
    vec4 alphamap = texture2D(u_alphamap, texcoord);
    float alpha = alphamap.r;
# else
    float alpha = u_diffuse_color.a;
# endif // ALPHA_MAP

# if REFRACTIVE
    float refract_factor = 1.0 - alpha;
    vec2 refract_coord = screen_coord.xy + normal.xz * REFR_BUMP
                                                  / v_view_depth;
# endif

#endif // SHORE_SMOOTHING

#if REFRACTIVE
    vec3 refract_color = texture2D(u_refractmap, refract_coord).rgb;
    srgb_to_lin(refract_color);
#endif

#if SHORE_PARAMS
    // shallow gradient
    float grad_f = pow(min(v_shore_params.b / u_water_shallow_col_fac, 1.0), 0.3);
    vec3 diffuse_color = mix(u_shallow_water_col, u_diffuse_color.rgb, grad_f);
    // shore water gradient
    grad_f = pow(min(v_shore_params.b / u_water_shore_col_fac, 1.0), 0.3);
    diffuse_color = mix(u_shore_water_col, diffuse_color, grad_f);
#else
    vec3 diffuse_color = u_diffuse_color.rgb;
#endif

    vec3 color = u_diffuse_intensity * diffuse_color;

#if FOAM
    // water foam near the shore and on top of the waves

# if SHORE_SMOOTHING
    float foam_factor = max(1.0 - u_view_max_depth * delta, 0.0);
# else
    float foam_factor = 1.0 - alpha;
# endif // SHORE_SMOOTHING

# if DYNAMIC

    float foam_waves_factor = max( 3.0 * dist_to_water, 0.0);
    foam_waves_factor *= foam_waves_factor;

#  if SHORE_PARAMS
    // add foam to directional waves
    vec3 dir_shore = normalize(vec3(v_shore_params.r, 0.0, v_shore_params.g));
    vec3 foam_dir = normalize(mix(vec3(0.0, 1.0, 0.0), dir_shore, 0.8));
    float foam_shore_waves = max(2.5 * dot(normal_foam, foam_dir) - 0.7, 0.0);
    foam_factor += foam_shore_waves * (1.0 - v_shore_params.b);
    foam_waves_factor *= (1.0 - 0.95 * pow(v_shore_params.b, 0.1));
#  endif // SHORE_PARAMS

    foam_factor += foam_waves_factor;

    foam_factor = min(u_foam_factor * foam_factor, 1.0);

# endif // DYNAMIC

    vec4 foam = texture2D(u_foam,
                          u_foam_mag * sin(u_foam_uv_freq * u_time)
                          + texcoord * u_foam_scale);
#endif // FOAM

    // specular
    float specint = u_specular_params[0];
    float spec_param = u_specular_params[1];
    vec3 S = specint * u_specular_color;

    // ambient
    vec3 environment_color = u_environment_energy * u_zenith_color;
    vec3 A = u_ambient * environment_color;

    vec3 light_energies = A + u_sun_intensity;

    // reflections of world objects or environment map
#if REFLECTIVE
    vec2 reflect_coord = screen_coord.xy + normal.xz * REFL_BUMP
                                                  / v_view_depth;
    float mirror_factor = u_reflect_factor;

    vec3 reflect_color;
    if (u_cam_water_depth < 0.0) {
# if !DISABLE_FOG && WATER_EFFECTS
        reflect_color = u_underwater_fog_color_density.rgb;
# else
        reflect_color = u_diffuse_color.rgb;
# endif
        float eye_dot_norm = dot(eye_dir, normal);
        mirror_factor *= max(1.0 - 1.0 / eye_dot_norm, 1.0);
    } else {
        reflect_color = texture2D(u_reflectmap, reflect_coord).rgb;
        srgb_to_lin(reflect_color);
    }
#elif TEXTURE_MIRROR
    float mirror_factor = u_mirror_factor;
    vec3 reflect_color = light_energies * textureCube(u_mirrormap, eye_reflected).rgb;
    srgb_to_lin(reflect_color);
#else
    float mirror_factor = 1.0;
    vec3 reflect_color = light_energies * vec3(0.3,0.5,1.0);
    srgb_to_lin(reflect_color);
#endif

    // calculate mirror factor using fresnel 
    vec3 reflected_halfway = normalize(eye_reflected + eye_dir);
    float one_minus_cos_theta = 1.0 - dot(eye_dir, reflected_halfway);
    float r0 = u_fresnel_params[3];
    float N = u_fresnel_params[2];
    float r = r0 + (1.0 - r0) * pow(one_minus_cos_theta, N);

    mirror_factor = min(mirror_factor * r, 1.0);

    /*==========================================================================
                            Apply all needed colors
    ==========================================================================*/

#if SHORE_PARAMS && DYNAMIC
    // fake subsurface scattering (SSS)

    float sss_fact = max(dot(u_sun_direction, -v_normal) + SSS_WIDTH, 0.0)
                     * max(dot(-eye_dir, u_sun_direction) - 0.5, 0.0)
                     * max(0.0, length(u_sun_intensity) - 0.1);

    sss_fact = clamp(SSS_STRENGTH * sss_fact, 0.0, 1.0);
    color = mix(color, u_shallow_water_col, sss_fact);
    color = mix(color, u_shore_water_col, sss_fact);
#endif

    lighting_result lresult = lighting(vec3(0.0), vec3(0.0), color, S, v_pos_world,
        normal, eye_dir, spec_param, u_diffuse_params, 1.0,
        u_light_positions, u_light_directions, u_light_color_intensities,
        u_light_factors1, u_light_factors2, 0.0, vec4(0.0));

    color = lresult.color.rgb;

#if REFRACTIVE
    // refraction
    color = mix(refract_color, color, refract_factor);
#endif

    // reflection
    color = mix(color, reflect_color, mirror_factor);

#if FOAM
    float foam_sum = mix(foam.g, foam.r, clamp(4.0 * (foam_factor - 0.75), 0.0, 1.0));
    foam_sum = mix(foam.b, foam_sum, clamp(2.0 * foam_factor - 1.0, 0.0, 1.0));
    foam_sum = mix(0.0, foam_sum, foam_factor);
    color = mix(color, light_energies, foam_sum);
#endif

    // specular
    color += lresult.specular;

#if !DISABLE_FOG
    // fog stuff
# if PROCEDURAL_FOG
    vec3 cube_fog  = procedural_fog_color(u_cube_fog, eye_dir);
    vec4 fog_color = vec4(cube_fog, u_fog_color_density.a);
    srgb_to_lin(fog_color.rgb);
# else
    vec4 fog_color = u_fog_color_density;
# endif //PROCEDURAL_FOG

# if WATER_EFFECTS
    if (u_cam_water_depth < 0.0) {
        //Underwater fog
        water_fog(color, surf_dist, u_cam_water_depth,
                  u_underwater_fog_color_density,
                  length(u_sun_intensity) + u_environment_energy);
    } else {
        fog(color, surf_dist, fog_color);
    }
# else
    fog(color, surf_dist, fog_color);
# endif //WATER_EFFECTS
#endif //!DISABLE_FOG
    
    lin_to_srgb(color);

#if !REFRACTIVE
    // when there is no refraction make alpha stronger
    // in shiny areas and in ares with foam
    alpha = min(max(alpha, lresult.specular.r), 1.0);
 #if FOAM
    alpha += foam_sum;
 #endif //FOAM
#endif //!REFRACTIVE

#if ALPHA
    premultiply_alpha(color, alpha);
#endif

    gl_FragColor = vec4(color, alpha);
}
