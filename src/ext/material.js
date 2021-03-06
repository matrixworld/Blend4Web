"use strict";

/** 
 * Material external API.
 * For expert use only
 * @module material
 */
b4w.module["material"] = function(exports, require) {

var m_batch = require("__batch");
var config  = require("__config");
var m_print = require("__print");
var util    = require("__util");
var shaders = require("__shaders");
var renderer = require("__renderer");
var cfg_def = config.defaults;
var cfg_scs = config.scenes;

var BATCH_INHERITED_TEXTURES = ["u_colormap0", "u_colormap1", "u_stencil0", 
        "u_specmap", "u_normalmap0", "u_mirrormap"];

/**
 * @method module:material.max_bones
 * @deprecated External call is not allowed anymore
 */
exports["max_bones"] = function() {
    m_print.error("max_bones() deprecated, return default value");
    return cfg_def.max_bones;
}
/**
 * @method module:material.set_max_bones
 * @deprecated External call is not alowed anymore
 */
exports["set_max_bones"] = function(num) {
    m_print.error("set_max_bones() deprecated");
}

/**
 * Dangerous method to set batch param
 * @method module:material.set_batch_param
 * @deprecated Use dedicated method to change param
 */
exports["set_batch_param"] = function() {
    m_print.error("set_batch_param() deprecated");
}

/**
 * Inherit batch material from another object.
 * @method module:material.inherit_material
 * @param obj_to Destination Object ID 
 * @param mat_to_name Destination material name
 * @param obj_from Source Object ID 
 * @param mat_from_name Source material name
 */
exports["inherit_material"] = function(obj_from, mat_from_name, obj_to, 
        mat_to_name) {

    var batch_from = find_batch_material(obj_from, mat_from_name, "MAIN");
    var batch_to = find_batch_material(obj_to, mat_to_name, "MAIN");

    if (!util.is_dynamic_mesh(obj_to) || !util.is_dynamic_mesh(obj_from)) {
        m_print.error("Wrong or batched object(s)");
        return;
    }

    if (batch_from && batch_to) {
        batch_to.diffuse_color[0] = batch_from.diffuse_color[0];
        batch_to.diffuse_color[1] = batch_from.diffuse_color[1];
        batch_to.diffuse_color[2] = batch_from.diffuse_color[2];
        batch_to.diffuse_color[3] = batch_from.diffuse_color[3];

        batch_to.diffuse_intensity = batch_from.diffuse_intensity;

        batch_to.specular_color[0] = batch_from.specular_color[0];
        batch_to.specular_color[1] = batch_from.specular_color[1];
        batch_to.specular_color[2] = batch_from.specular_color[2];

        batch_to.specular_params[0] = batch_from.specular_params[0];
        batch_to.specular_params[1] = batch_from.specular_params[1];

        batch_to.emit = batch_from.emit;
        batch_to.ambient = batch_from.ambient;
        batch_to.ambient = batch_from.ambient;

        if (!isNaN(batch_to.diffuse_color_factor) 
                && !isNaN(batch_from.diffuse_color_factor))
            batch_to.diffuse_color_factor = batch_from.diffuse_color_factor;

        // inherit textures for MAIN batches
        for (var i = 0; i < batch_to.texture_names.length; i++) {
            var to_name = batch_to.texture_names[i];
            if (BATCH_INHERITED_TEXTURES.indexOf(to_name) !== -1) {
                var from_index = batch_from.texture_names.indexOf(to_name);
                if (from_index !== -1)
                    batch_to.textures[i] = batch_from.textures[from_index];
            }
        }

        // inherit textures for DEPTH batches
        var depth_batch_from = find_batch_material(obj_from, mat_from_name, 
                "DEPTH");
        var depth_batch_to = find_batch_material(obj_to, mat_to_name, "DEPTH");

        for (var i = 0; i < depth_batch_to.texture_names.length; i++) {
            var to_name = depth_batch_to.texture_names[i];
            if (BATCH_INHERITED_TEXTURES.indexOf(to_name) !== -1) {
                var from_index 
                        = depth_batch_from.texture_names.indexOf(to_name);
                if (from_index !== -1) {
                    depth_batch_to.textures[i] 
                            = depth_batch_from.textures[from_index];

                    // inherit textures for forked DEPTH batches
                    if (depth_batch_to.childs)
                        for (var j = 0; j < depth_batch_to.childs.length; j++) {
                            var child_batch = depth_batch_to.childs[j];
                            var child_index 
                                    = child_batch.texture_names.indexOf(to_name);
                            if (child_index !== -1)
                                child_batch.textures[child_index] 
                                        = depth_batch_from.textures[from_index];
                        }
                }
            }
        }
    } else
        m_print.error("Wrong objects for inheriting material!")
}

/**
 * Find MAIN batch using material name
 */
function find_batch_material(obj, mat_name, type) {
    var mesh = obj["data"];
    var materials = mesh["materials"];
    var slots = obj._batch_slots;

    for (var i = 0; i < materials.length; i++) {
        var mat = materials[i];
        if (mat["name"] === mat_name) {
            for (var j = 0; j < slots.length; j++) {
                var slot = slots[j];
                var batch = slot.batch;

                // sumesh index === material index
                if (slot.submesh_index === i)
                    if (type && batch.type == type || !type)
                        return batch;
            }
        }
    }
    return null;
}

function check_batch_material(obj, mat_name) {
    var mesh = obj["data"];
    var materials = mesh["materials"];
    var slots = obj._batch_slots;

    for (var i = 0; i < materials.length; i++) {
        var mat = materials[i];

        if (mat["name"] === mat_name) {
            for (var j = 0; j < slots.length; j++) {
                var slot = slots[j];
                var batch = slot.batch;

                // sumesh index === material index
                if (slot.submesh_index === i) {
                    if (batch.type == "MAIN" || batch.type == "SHADELESS")
                        return true;
                }
            }
        }
    }
    return false;
}

function find_material(obj, mat_name) {
    var mesh = obj["data"];
    var materials = mesh["materials"];

    for (var i = 0; i < materials.length; i++) {
        var mat = materials[i];

        if (mat["name"] == mat_name)
            return mat;
    }

    return null;
}

/**
 * Get materials' names for given object
 * @method module:material.get_materials_names
 * @param obj Object 
 */
exports["get_materials_names"] = function(obj) {
    
    var mat_names = new Array();

    var mesh = obj["data"];
    var materials = mesh["materials"];

    for (var i = 0; i < materials.length; i++) 
        mat_names.push(materials[i]["name"]);

    return mat_names;
}

/**
 * Set diffuse color and alpha for object material.
 * @method module:material.set_diffuse_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {vec4} color Color+alpha vector
 */
exports["set_diffuse_color"] = function(obj, mat_name, color) {
    if (!check_diffuse_color(obj, mat_name))
        m_print.error("Property \"diffuse_color\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.diffuse_color[0] = color[0];
    batch.diffuse_color[1] = color[1];
    batch.diffuse_color[2] = color[2];
    batch.diffuse_color[3] = color[3];
}

/**
 * Get diffuse color and alpha for object material.
 * @method module:material.get_diffuse_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Material diffuse color+alpha
 */
exports["get_diffuse_color"] = function(obj, mat_name) {
    if (!check_diffuse_color(obj, mat_name))
        m_print.error("Property \"diffuse_color\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    var color = new Array(4);
    color[0] = batch.diffuse_color[0];
    color[1] = batch.diffuse_color[1];
    color[2] = batch.diffuse_color[2];
    color[3] = batch.diffuse_color[3];

    return color;
}

/**
 * Check diffuse color for object material
 * @method module:material.check_diffuse_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Diffuse color presence
 */
exports["check_diffuse_color"] = check_diffuse_color;
function check_diffuse_color(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.diffuse_color;
}

/**
 * Set diffuse color intensity for object material.
 * @method module:material.set_diffuse_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} intensity Diffuse intencity value
 */
exports["set_diffuse_intensity"] = function(obj, mat_name, intensity) {
    if (!check_diffuse_intensity(obj, mat_name))
        m_print.error("Property \"diffuse_intensity\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.diffuse_intensity = intensity;
}

/**
 * Get diffuse color intensity for object material.
 * @method module:material.get_diffuse_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Diffuse color intensity
 */
exports["get_diffuse_intensity"] = function(obj, mat_name) {
    if (!check_diffuse_intensity(obj, mat_name))
        m_print.error("Property \"diffuse_intensity\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.diffuse_intensity;
}

/**
 * Check diffuse intensity for object material
 * @method module:material.check_diffuse_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Diffuse intensity presence
 */
exports["check_diffuse_intensity"] = check_diffuse_intensity;
function check_diffuse_intensity(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.diffuse_intensity;
}

/**
 * Set specular color for object material.
 * @method module:material.set_specular_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {vec3} color Color vector
 */
exports["set_specular_color"] = function(obj, mat_name, color) {
    if (!check_specular_color(obj, mat_name))
        m_print.error("Property \"specular_color\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.specular_color[0] = color[0];
    batch.specular_color[1] = color[1];
    batch.specular_color[2] = color[2];
}

/**
 * Get specular color for object material.
 * @method module:material.get_specular_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Material specular color
 */
exports["get_specular_color"] = function(obj, mat_name) {
    if (!check_specular_color(obj, mat_name))
        m_print.error("Property \"specular_color\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    var color = new Array(3);
    color[0] = batch.specular_color[0];
    color[1] = batch.specular_color[1];
    color[2] = batch.specular_color[2];

    return color;
}

/**
 * Check specular color for object material
 * @method module:material.check_specular_color
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Specular color presence
 */
exports["check_specular_color"] = check_specular_color;
function check_specular_color(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.specular_color;
}

/**
 * Set specular color intensity for object material.
 * @method module:material.set_specular_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} intensity Specular intensity value
 */
exports["set_specular_intensity"] = function(obj, mat_name, intensity) {
    if (!check_specular_intensity(obj, mat_name))
        m_print.error("Property \"specular_intensity\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.specular_params[0] = intensity;
}

/**
 * Get specular color intensity for object material.
 * @method module:material.get_specular_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Specular color intensity
 */
exports["get_specular_intensity"] = function(obj, mat_name) {
    if (!check_specular_intensity(obj, mat_name))
        m_print.error("Property \"specular_intensity\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.specular_params[0];
}

/**
 * Check specular intensity for object material
 * @method module:material.check_specular_intensity
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Specular intensity presence
 */
exports["check_specular_intensity"] = check_specular_intensity;
function check_specular_intensity(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.specular_params && batch.specular_params[0];
}

/**
 * Set specular color hardness for object material.
 * @method module:material.set_specular_hardness
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} hardness Specular hardness value
 */
exports["set_specular_hardness"] = function(obj, mat_name, hardness) {
    if (!check_specular_hardness(obj, mat_name))
        m_print.error("Property \"specular_hardness\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.specular_params[1] = hardness;
}

/**
 * Get specular color hardness for object material.
 * @method module:material.get_specular_hardness
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Specular color hardness
 */
exports["get_specular_hardness"] = function(obj, mat_name) {
    if (!check_specular_hardness(obj, mat_name))
        m_print.error("Property \"specular_hardness\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.specular_params[1];
}

/**
 * Check specular hardness for object material
 * @method module:material.check_specular_hardness
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Specular hardness presence
 */
exports["check_specular_hardness"] = check_specular_hardness;
function check_specular_hardness(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.specular_params && batch.specular_params[1];
}

/**
 * Set emit factor for object material.
 * @method module:material.set_emit_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} emit_factor Emit factor value
 */
exports["set_emit_factor"] = function(obj, mat_name, emit_factor) {
    if (!check_emit_factor(obj, mat_name))
        m_print.error("Property \"emit\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.emit = emit_factor;
}

/**
 * Get emit factor for object material.
 * @method module:material.get_emit_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Emit factor value
 */
exports["get_emit_factor"] = function(obj, mat_name) {
    if (!check_emit_factor(obj, mat_name))
        m_print.error("Property \"emit\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.emit;
}

/**
 * Check emit factor for object material
 * @method module:material.check_emit_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Emit factor presence
 */
exports["check_emit_factor"] = check_emit_factor;
function check_emit_factor(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.emit;
}

/**
 * Set ambient factor for object material.
 * @method module:material.set_ambient_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} ambient_factor Ambient factor value
 */
exports["set_ambient_factor"] = function(obj, mat_name, ambient_factor) {
    if (!check_ambient_factor(obj, mat_name))
        m_print.error("Property \"ambient\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.ambient = ambient_factor;
}

/**
 * Get ambient factor for object material.
 * @method module:material.get_ambient_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Ambient factor value
 */
exports["get_ambient_factor"] = function(obj, mat_name) {
    if (!check_ambient_factor(obj, mat_name))
        m_print.error("Property \"ambient\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.ambient;
}

/**
 * Check ambient factor for object material
 * @method module:material.check_ambient_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Ambient factor presence
 */
exports["check_ambient_factor"] = check_ambient_factor;
function check_ambient_factor(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.ambient;
}

/**
 * Set diffuse color factor for object material.
 * @method module:material.set_diffuse_color_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @param {Number} diffuse_color_factor Diffuse color factor value
 */
exports["set_diffuse_color_factor"] = function(obj, mat_name, 
        diffuse_color_factor) {
    if (!check_diffuse_color_factor(obj, mat_name))
        m_print.error("Property \"diffuse_color_factor\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    batch.diffuse_color_factor = diffuse_color_factor;
}

/**
 * Get diffuse color factor for object material.
 * @method module:material.get_diffuse_color_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns Diffuse color factor value
 */
exports["get_diffuse_color_factor"] = function(obj, mat_name) {
    if (!check_diffuse_color_factor(obj, mat_name))
        m_print.error("Property \"diffuse_color_factor\" is missing!");

    var batch = find_batch_material(obj, mat_name);
    return batch.diffuse_color_factor;
}

/**
 * Check diffuse color factor for object material
 * @method module:material.check_diffuse_color_factor
 * @param obj Object ID 
 * @param mat_name Material name
 * @returns {Boolean} Diffuse color factor presence
 */
exports["check_diffuse_color_factor"] = check_diffuse_color_factor;
function check_diffuse_color_factor(obj, mat_name) {
    var batch = find_batch_material(obj, mat_name);
    return batch && batch.diffuse_color_factor;
}

/**
 * Get material extended params
 * @method module:material.get_material_extended_params
 * @param {object} obj Object
 * @param {string} mat_name Material name
 * @returns Material extended params or null
 */
exports["get_material_extended_params"] = function(obj, mat_name) {

    if (!obj || !mat_name) {
        m_print.error("B2W Error: missing arguments in get_material_params");
        return null;
    }

    // check that getting material params is possible
    if (!check_batch_material(obj, mat_name))
        return null;

    var batch = find_batch_material(obj, mat_name);
    if (!batch) {
        m_print.warn("B2W Warning: material not found");
        return null;
    }

    var mat_params = {};

    if (batch.type == "MAIN") {
        mat_params["reflect_factor"] = batch.reflect_factor;
        mat_params["fresnel"]        = batch.fresnel_params[2];
        mat_params["fresnel_factor"] = 5 * (1 - batch.fresnel_params[3]);
        mat_params["parallax_scale"] = batch.parallax_scale;
        mat_params["parallax_steps"] = m_batch.get_batch_directive(batch,
                "PARALLAX_STEPS")[1];
    }

    return mat_params;
}

/**
 * Get water material params
 * @method module:material.get_water_material_params
 * @param {object} obj Object
 * @param {string} water_mat_name Water material name
 * @returns Water material params or null
 */
exports["get_water_material_params"] = function(obj, water_mat_name) {

    if (!obj || !water_mat_name) {
        m_print.error("B2W Error: missing arguments in get_water_material_params");
        return null;
    }

    // check that getting material params is possible
    if (!check_batch_material(obj, water_mat_name))
        return null;
    var batch = find_batch_material(obj, water_mat_name);

    if (!batch.water)
        return null;

    if (!batch) {
        m_print.warn("B2W Warning: material not found");
        return null;
    }
    var water_mat_params = {};

    if (batch.type == "MAIN") {

        if (cfg_def.shore_distance) {

            var shlwc = water_mat_params["shallow_water_col"] = new Array(3);

            shlwc[0]  = batch.shallow_water_col[0];
            shlwc[1]  = batch.shallow_water_col[1];
            shlwc[2]  = batch.shallow_water_col[2];

            var shrwc = water_mat_params["shore_water_col"] = new Array(3);

            shrwc[0]  = batch.shore_water_col[0];
            shrwc[1]  = batch.shore_water_col[1];
            shrwc[2]  = batch.shore_water_col[2];

            water_mat_params["shallow_water_col_fac"] = batch.shallow_water_col_fac;
            water_mat_params["shore_water_col_fac"] = batch.shore_water_col_fac;
        }

        water_mat_params["foam_factor"] = batch.foam_factor;
        water_mat_params["absorb_factor"] = m_batch.get_batch_directive(batch,
                "ABSORB")[1];
        water_mat_params["sss_strength"] = m_batch.get_batch_directive(batch,
                "SSS_STRENGTH")[1];
        water_mat_params["sss_width"] = m_batch.get_batch_directive(batch,
                "SSS_WIDTH")[1];
        water_mat_params["dst_noise_scale0"] = m_batch.get_batch_directive(batch,
                "DST_NOISE_SCALE_0")[1];
        water_mat_params["dst_noise_scale1"] = m_batch.get_batch_directive(batch,
                "DST_NOISE_SCALE_1")[1];
        water_mat_params["dst_noise_freq0"] = m_batch.get_batch_directive(batch,
                "DST_NOISE_FREQ_0")[1];
        water_mat_params["dst_noise_freq1"] = m_batch.get_batch_directive(batch,
                "DST_NOISE_FREQ_1")[1];
        water_mat_params["dir_min_shore_fac"] = m_batch.get_batch_directive(batch,
                "DIR_MIN_SHR_FAC")[1];
        water_mat_params["dir_freq"] = m_batch.get_batch_directive(batch,
                "DIR_FREQ")[1];
        water_mat_params["dir_noise_scale"] = m_batch.get_batch_directive(batch,
                "DIR_NOISE_SCALE")[1];
        water_mat_params["dir_noise_freq"] = m_batch.get_batch_directive(batch,
                "DIR_NOISE_FREQ")[1];
        water_mat_params["dir_min_noise_fac"] = m_batch.get_batch_directive(batch,
                "DIR_MIN_NOISE_FAC")[1];
        water_mat_params["dst_min_fac"] = m_batch.get_batch_directive(batch,
                "DST_MIN_FAC")[1];
        water_mat_params["waves_hor_fac"] = m_batch.get_batch_directive(batch,
                "WAVES_HOR_FAC")[1];
    }

    return water_mat_params;
}

/**
 * Set material params
 * @method module:material.set_material_params
 * @param {object} obj Object
 * @param {string} mat_name Material name
 * @param {object} mat_params Material params
 */
exports["set_material_extended_params"] = function(obj, mat_name, mat_params) {

    if (!obj || !mat_name || !mat_params) {
        m_print.error("B2W Error: missing arguments in set_material_params");
        return;
    }

    // check that setting material params is possible
    if (!check_batch_material(obj, mat_name)) {
        m_print.warn("B2W Warning: setting material params is not possible");
        return null;
    }
    
    var batch = find_batch_material(obj, mat_name);

    if (!batch) {
        m_print.warn("B2W Warning: material not found");
        return;
    }

    if (batch.type == "MAIN") {
        if ("material_reflectivity" in mat_params && obj._render.reflective) {
            var refl = mat_params["material_reflectivity"];
            batch.reflect_factor = refl;
        }

        if ("material_fresnel" in mat_params) {
            var fresnel = mat_params["material_fresnel"];
            batch.fresnel_params[2] = fresnel;
        }

        if ("material_fresnel_factor" in mat_params) {
            var fresnel_factor = 1 - mat_params["material_fresnel_factor"] / 5;
            batch.fresnel_params[3] = fresnel_factor;
        }

        if ("material_parallax_scale" in mat_params) {
            var parallax_scale = mat_params["material_parallax_scale"];
            batch.parallax_scale = parallax_scale;
        }

        if ("material_parallax_steps" in mat_params) {
            var parallax_steps = shaders.glsl_value(parseFloat(mat_params["material_parallax_steps"]));
            m_batch.set_batch_directive(batch, "PARALLAX_STEPS", parallax_steps);
            m_batch.update_shader(batch, true);
        }
    }
}

/**
 * Set water material params
 * @method module:material.set_water_material_params
 * @param {object} obj Object
 * @param {string} water_mat_name  Water material name
 * @param {object} water_mat_params Water material params
 */
exports["set_water_material_params"] = function(obj, water_mat_name, water_mat_params) {

    if (!obj || !water_mat_name || !water_mat_params) {
        m_print.error("B2W Error: missing arguments in set_water_material_params");
        return null;
    }

    // check that setting material params is possible
    if (!check_batch_material(obj, water_mat_name)) {
        m_print.warn("B2W Warning: setting water material params is not possible");
        return null;
    }

    var batch = find_batch_material(obj, water_mat_name);

    if (!batch) {
        m_print.warn("B2W Warning: material not found");
        return null;
    }

    if (batch.type == "MAIN") {

        if (cfg_def.shore_distance) {
            if ("shallow_water_col" in  water_mat_params) {
                var swc = water_mat_params["shallow_water_col"];
                batch.shallow_water_col[0] = swc[0];
                batch.shallow_water_col[1] = swc[1];
                batch.shallow_water_col[2] = swc[2];
            }
            if ("shallow_water_col_fac" in  water_mat_params) {
                batch.shallow_water_col_fac = water_mat_params["shallow_water_col_fac"];
            }
            if ("shore_water_col" in  water_mat_params) {
                var swc = water_mat_params["shore_water_col"];
                batch.shore_water_col[0] = swc[0];
                batch.shore_water_col[1] = swc[1];
                batch.shore_water_col[2] = swc[2];
            }
            if ("shore_water_col_fac" in  water_mat_params) {
                batch.shore_water_col_fac = water_mat_params["shore_water_col_fac"];
            }
        }

        if (cfg_def.shore_smoothing && batch.water_shore_smoothing) {
            if ("shore_smoothing" in water_mat_params) {
                if (water_mat_params["shore_smoothing"])
                    m_batch.set_batch_directive(batch, "SHORE_SMOOTHING", 1);
                else
                    m_batch.set_batch_directive(batch, "SHORE_SMOOTHING", 0);
            }
            if ("absorb_factor" in water_mat_params) {
                var absorb_factor = shaders.glsl_value(parseFloat(water_mat_params["absorb_factor"]));
                m_batch.set_batch_directive(batch, "ABSORB", absorb_factor);
            }
        }

        if ("foam_factor" in water_mat_params && cfg_def.foam) {
            batch.foam_factor = water_mat_params["foam_factor"];
        }

        if (cfg_def.water_dynamic && batch.water_dynamic) {
            if ("water_dynamic" in water_mat_params) {
                if (water_mat_params["water_dynamic"])
                    m_batch.set_batch_directive(batch, "DYNAMIC", 1);
                else
                    m_batch.set_batch_directive(batch, "DYNAMIC", 0);
            }
            if ("waves_height" in water_mat_params) {
                var waves_height = shaders.glsl_value(parseFloat(
                                       water_mat_params["waves_height"]));
                m_batch.set_batch_directive(batch, "WAVES_HEIGHT", waves_height);
            }
            if ("waves_length" in water_mat_params) {
                var waves_length = shaders.glsl_value(parseFloat(
                                       water_mat_params["waves_length"]));
                m_batch.set_batch_directive(batch, "WAVES_LENGTH", waves_length);
            }
            if ("sss_strength" in water_mat_params) {
                var waves_length = shaders.glsl_value(parseFloat(
                                       water_mat_params["sss_strength"]));
                m_batch.set_batch_directive(batch, "SSS_STRENGTH", waves_length);
            }
            if ("sss_width" in water_mat_params) {
                var waves_length = shaders.glsl_value(parseFloat(
                                       water_mat_params["sss_width"]));
                m_batch.set_batch_directive(batch, "SSS_WIDTH", waves_length);
            }
            if ("dst_noise_scale0" in water_mat_params) {
                var dst_noise_scale0 = shaders.glsl_value(parseFloat(
                                       water_mat_params["dst_noise_scale0"]));
                m_batch.set_batch_directive(batch, "DST_NOISE_SCALE_0", dst_noise_scale0);
            }
            if ("dst_noise_scale1" in water_mat_params) {
                var dst_noise_scale1 = shaders.glsl_value(parseFloat(
                                       water_mat_params["dst_noise_scale1"]));
                m_batch.set_batch_directive(batch, "DST_NOISE_SCALE_1", dst_noise_scale1);
            }
            if ("dst_noise_freq0" in water_mat_params) {
                var dst_noise_freq0 = shaders.glsl_value(parseFloat(
                                      water_mat_params["dst_noise_freq0"]));
                m_batch.set_batch_directive(batch, "DST_NOISE_FREQ_0", dst_noise_freq0);
            }
            if ("dst_noise_freq1" in water_mat_params) {
                var dst_noise_freq1 = shaders.glsl_value(parseFloat(
                                      water_mat_params["dst_noise_freq1"]));
                m_batch.set_batch_directive(batch, "DST_NOISE_FREQ_1", dst_noise_freq1);
            }
            if ("dir_min_shore_fac" in water_mat_params) {
                var dir_min_shore_fac = shaders.glsl_value(parseFloat(
                                        water_mat_params["dir_min_shore_fac"]));
                m_batch.set_batch_directive(batch, "DIR_MIN_SHR_FAC", dir_min_shore_fac);
            }
            if ("dir_freq" in water_mat_params) {
                var dir_freq = shaders.glsl_value(parseFloat(
                               water_mat_params["dir_freq"]));
                m_batch.set_batch_directive(batch, "DIR_FREQ", dir_freq);
            }
            if ("dir_noise_scale" in water_mat_params) {
                var dir_noise_scale = shaders.glsl_value(parseFloat(
                                      water_mat_params["dir_noise_scale"]));
                m_batch.set_batch_directive(batch, "DIR_NOISE_SCALE", dir_noise_scale);
            }
            if ("dir_noise_freq" in water_mat_params) {
                var dir_noise_freq = shaders.glsl_value(parseFloat(
                                     water_mat_params["dir_noise_freq"]));
                m_batch.set_batch_directive(batch, "DIR_NOISE_FREQ", dir_noise_freq);
            }
            if ("dir_min_noise_fac" in water_mat_params) {
                var dir_min_noise_fac = shaders.glsl_value(parseFloat(
                                        water_mat_params["dir_min_noise_fac"]));
                m_batch.set_batch_directive(batch, "DIR_MIN_NOISE_FAC", dir_min_noise_fac);
            }
            if ("dst_min_fac" in water_mat_params) {
                var dst_min_fac = shaders.glsl_value(parseFloat(
                                  water_mat_params["dst_min_fac"]));
                m_batch.set_batch_directive(batch, "DST_MIN_FAC", dst_min_fac);
            }
            if ("waves_hor_fac" in water_mat_params) {
                var waves_hor_fac = shaders.glsl_value(parseFloat(
                                    water_mat_params["waves_hor_fac"]));
                m_batch.set_batch_directive(batch, "WAVES_HOR_FAC", waves_hor_fac);
            }
        }
        m_batch.update_shader(batch, true);
    }
    return true;
}

}
