"use strict";

/**
 * Main module of blen4web engine. 
 * Implements methods to initialize and change global params of engine operation.
 * @module main
 */
b4w.module["main"] = function(exports, require) {

var animation  = require("__animation");
var config     = require("__config");
var m_print    = require("__print");
var controls   = require("__controls");
var data       = require("__data");
var debug      = require("__debug");
var extensions = require("__extensions");
var geometry   = require("__geometry");
var hud        = require("__hud");
var assets     = require("__assets");
var physics    = require("__physics");
var renderer   = require("__renderer");
var scenes     = require("__scenes");
var sfx        = require("__sfx");
var shaders    = require("__shaders");
var textures   = require("__textures");
var transform  = require("__transform");
var util       = require("__util");
var version    = require("__version");

var cfg_ctx = config.context;
var cfg_def = config.defaults;

var _elem_canvas_webgl = null;
var _elem_canvas_hud = null;

// global time since main init
var _global_timeline = 0;
var _last_abs_time = 0;

var _fps_callback = function() {};
var _fps_counter = function() {};

var _render_callback = function() {};
var _canvas_data_url_callback = null;

var _do_render = true;

var CONTEXT_NAMES = ["webgl", "experimental-webgl"];

var gl = null;

/**
 * NOTE: According to spec, this function takes only one param
 */
var _requestAnimFrame = (function() {
  return window["requestAnimationFrame"] ||
         window["webkitRequestAnimationFrame"] ||
         window["mozRequestAnimationFrame"] ||
         window["oRequestAnimationFrame"] ||
         window["msRequestAnimationFrame"] ||
         function(callback) {return window.setTimeout(callback, 
             1000/cfg_def.max_fps);};
})();

// public enums

/**
 * @const module:main.INIT_OK
 */
exports["INIT_OK"] = 100;
/**
 * @const module:main.BROWSER_NOT_SUPPORTED
 */
exports["BROWSER_NOT_SUPPORTED"] = 110;
/**
 * @const module:main.UNDERLYING_ERROR
 */
exports["UNDERLYING_ERROR"] = 120;

/**
 * Create WebGL context and initialize engine.
 * @method module:main.init
 * @param elem_canvas_webgl Canvas element for WebGL
 * @param [elem_canvas_hud] Canvas element for HUD
 * @returns Init status: INIT_OK, BROWSER_NOT_SUPPORTED, UNDERLYING_ERROR
 */
exports["init"] = function(elem_canvas_webgl, elem_canvas_hud) {

    // NOTE: for debug purposes
    // works in chrome with --enable-memory-info --js-flags="--expose-gc"
    //window.setInterval(function() {window.gc();}, 1000);

    m_print.set_verbose(cfg_def.console_verbose);

    var ver_str = version.version() + " " + version.type() + 
            " (" + version.date() + ")";
    m_print.log("%cINIT B2W ENGINE", "color: #00a", ver_str);

    // check gl context and performance.now()
    if (!window["WebGLRenderingContext"]) {
        return exports["BROWSER_NOT_SUPPORTED"];
    }

    if (!window["performance"]) {
        m_print.log("Apply performance workaround");
        window["performance"] = {};
    }

    if (!window["performance"]["now"]) {
        m_print.log("Apply performance.now() workaround");
        window["performance"]["now"] = function() {
            return new Date().getTime();
        }
    }

    _elem_canvas_webgl = elem_canvas_webgl;

    gl = get_context(elem_canvas_webgl);
    if (!gl)
        return exports["UNDERLYING_ERROR"];

    init_context(_elem_canvas_webgl);
    config.set_hardware_defaults(gl);
    config.apply_quality();

    m_print.log("%cSET PRECISION:", "color: #00a", cfg_def.precision);

    if (elem_canvas_hud) {
        hud.init(elem_canvas_hud);
        _elem_canvas_hud = elem_canvas_hud;
    } else {
        // disable features which depend on HUD
        config.defaults.show_hud_debug_info = false;
        config.sfx.mix_mode = false;
    }

    physics.init_engine();

    return exports["INIT_OK"];
}

function get_context(canvas) {

    var ctx = null;

    for (var i = 0; i < CONTEXT_NAMES.length; i++) {
        var name = CONTEXT_NAMES[i];

        try {
            ctx = canvas.getContext(name, cfg_ctx);
        } catch(e) {}

        if (ctx)
            break;
    }

    return ctx;
}

function init_context(canvas) {
    canvas.addEventListener("webglcontextlost", 
            function(event) {
                event.preventDefault();

                m_print.error("B2W Error: WebGL context lost");

                // at least prevent freeze
                pause();

            }, false);

    extensions.setup_context(gl);

    var rinfo = extensions.get_renderer_info();
    if (rinfo)
        m_print.log("%cRENDERER INFO:", "color: #00a", 
            gl.getParameter(rinfo.UNMASKED_VENDOR_WEBGL) + ", " + 
            gl.getParameter(rinfo.UNMASKED_RENDERER_WEBGL));
    
    renderer.setup_context(gl);
    geometry.setup_context(gl);
    textures.setup_context(gl);
    shaders.setup_context(gl);
    debug.setup_context(gl);

    scenes.setup_dim(canvas.width, canvas.height);
    //scenes.setup_dim(gl.drawingBufferWidth, gl.drawingBufferHeight);

    sfx.init();

    _global_timeline = 0;

    _fps_counter = init_fps_counter();

    loop();
}

/**
 * Perform or not checks of WebGL errors during rendering.
 * Note: additional checks can slow-down the engine
 * @method module:main.set_check_gl_errors
 */
exports["set_check_gl_errors"] = function(val) {
    debug.set_check_gl_errors(val);
}

/**
 * Resize canvas
 * @method module:main.resize
 * @param {Number} width New canvas width
 * @param {Number} height New canvas height
 */
exports["resize"] = function(width, height) {

    _elem_canvas_webgl.style.width = width + "px";
    _elem_canvas_webgl.style.height = height + "px";

    if (_elem_canvas_hud) {
        _elem_canvas_hud.style.width = width + "px";
        _elem_canvas_hud.style.height = height + "px";
    }

    _elem_canvas_webgl.width  = width;
    _elem_canvas_webgl.height = height;

    if (_elem_canvas_hud) {
        _elem_canvas_hud.width  = width;
        _elem_canvas_hud.height = height;
    }
    hud.update_dim();

    scenes.setup_dim(width, height);
    //scenes.setup_dim(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.clear();

    frame(_global_timeline, 0);
}

/**
 * @callback fps_callback
 * @param fps_avg Averaged rendering FPS
 * @param phy_fps_avg Averaged physics FPS
 */

/**
 * Set callback for FPS counter
 * @method module:main.set_fps_callback
 * @param {fps_callback} fps_cb FPS callback
 */
exports["set_fps_callback"] = function(fps_cb) {
    _fps_callback = fps_cb;
}
/**
 * Remove callbacks for FPS counters
 * @method module:main.clear_fps_callback
 */
exports["clear_fps_callback"] = function() {
    _fps_callback = function() {};
}

/**
 * @method module:main.set_on_before_render_callback
 * @deprecated Use set_render_callback() instead
 */
exports["set_on_before_render_callback"] = function(callback) {
    set_render_callback(callback);
}

/**
 * @callback render_callback
 * @param {Number} delta Delta
 * @param {Number} timeline Timeline
 */
/**
 * Set rendering callback executed on every frame
 * @method module:main.set_render_callback
 * @param {render_callback} callback Render callback
 */
exports["set_render_callback"] = function(callback) {
    set_render_callback(callback);
}
function set_render_callback(callback) {
    _render_callback = callback;
}

/**
 * @method module:main.clear_on_before_render_callback
 * @deprecated Use clear_render_callback() instead
 */
exports["clear_on_before_render_callback"] = function() {
    clear_render_callback();
}
/**
 * Remove rendering callback
 * @method module:main.clear_render_callback
 */
exports["clear_render_callback"] = function() {
    clear_render_callback();
}
function clear_render_callback() {
    _render_callback = function() {};
}




/**
 * Return engine global timeline value
 * @method module:main.global_timeline
 * @returns {Number} Number of float seconds since engine start-up
 */
exports["global_timeline"] = function() {
    return _global_timeline;
}

/**
 * Reset engine global timeline.
 * Note: reset of engine's timeline is strongly discouraged
 * @method module:main.reset_timeline
 */
exports["reset_timeline"] = function() {
    _global_timeline = 0;
    _last_abs_time = 0;
}


/**
 * @method module:main.set_texture_quality
 * @deprecated Use engine's default values
 */
exports["set_texture_quality"] = function(level) {
    m_print.error("set_texture_quality() deprecated");
}

/**
 * @method module:main.set_shaders_dir
 * @deprecated Use one place for all shaders
 */
exports["set_shaders_dir"] = function(shdir) {
    m_print.error("set_shaders_dir() deprecated");
}

/**
 * Force engine's redraw
 * @method module:main.redraw
 * @deprecated
 */
exports["redraw"] = function() {
    frame(_global_timeline, 0);
}

/**
 * Resume engine operation (after pause)
 * @method module:main.resume
 */
exports["resume"] = function() {
    _do_render = true;
    sfx.resume();
    physics.resume();
}

exports["pause"] = pause;
/**
 * Set engine on pause
 * @method module:main.pause
 */
function pause() {
    _do_render = false;

    sfx.pause();
    physics.pause();
}
/**
 * Check if engine is paused
 * @method module:main.is_paused
 */
exports["is_paused"] = function() {
    return !_do_render;
}

function loop() {
    _requestAnimFrame(loop);

    // float sec
    var abstime = performance.now() / 1000;

    if (!_last_abs_time)
        _last_abs_time = abstime;

    var delta = abstime - _last_abs_time;

    // do not render short frames
    if (delta < 1/cfg_def.max_fps)
        return;

    if (renderer.is_locked()) {
        return;
    }

    _last_abs_time = abstime;

    if (!_do_render)
        return;

    _global_timeline += delta;
    
    debug.update();

    assets.update();
    data.update();
    frame(_global_timeline, delta);

    _fps_counter(delta);

}

function frame(timeline, delta) {
    // possible unload between frames
    if (!data.is_loaded())
        return;

    hud.reset();

    transform.update(delta);

    // sound
    sfx.update(timeline, delta);

    // animation
    animation.update(delta);

    // possible unload in animation callbacks
    if (!data.is_loaded())
        return;

    physics.update(timeline, delta);

    // possible unload in physics callbacks
    if (!data.is_loaded())
        return;

    // user callback
    _render_callback(delta, timeline);

    // possible unload in render callback
    if (!data.is_loaded())
        return;

    // controls
    controls.update(timeline, delta);

    // possible unload in controls callbacks
    if (!data.is_loaded())
        return;

    // rendering
    scenes.update(timeline, delta);

    // NOTE: disable unused feature to save time
    //if (_canvas_data_url_callback) {
    //    _canvas_data_url_callback(_elem_canvas_webgl.toDataURL());
    //    _canvas_data_url_callback = null;
    //}
}

function init_fps_counter() {
    var fps_avg = 60;       // decent default value
    var phy_fps_avg = 0;    // stays zero for disabled physics 

    var fps_frame_counter = 0;
    var interval = cfg_def.fps_measurement_interval;
    var interval_cb = cfg_def.fps_callback_interval;

    var fps_counter = function(delta) {
        fps_avg = util.smooth(1/delta, fps_avg, delta, interval);
        phy_fps_avg = util.smooth(physics.get_fps(), phy_fps_avg, delta, interval);

        fps_frame_counter = (fps_frame_counter + 1) % interval_cb;
        if (fps_frame_counter == 0) {
            _fps_callback(Math.round(fps_avg), Math.round(phy_fps_avg));
        }
    }

    return fps_counter;
}

/**
 * Reset engine.
 * @method module:main.reset
 */
exports["reset"] = function() {
    data.unload();

    _elem_canvas_webgl = null;
    _elem_canvas_hud = null;

    _global_timeline = 0;
    _last_abs_time = 0;

    _fps_callback = function() {};
    _fps_counter = function() {};

    _render_callback = function() {};

    _do_render = true;

    gl = null;
}

exports["canvas_data_url"] = function(callback) {
    _canvas_data_url_callback = callback;
}

}

// NOTE: for compatibility with old apps

b4w["animation"]   = b4w.require("animation");
b4w["assets"]      = b4w.require("assets");
b4w["camera"]      = b4w.require("camera");
b4w["config"]      = b4w.require("config");
b4w["controls"]    = b4w.require("controls");
b4w["constraints"] = b4w.require("constraints");
b4w["data"]        = b4w.require("data");
b4w["debug"]       = b4w.require("debug");
b4w["lights"]      = b4w.require("lights");
b4w["main"]        = b4w.require("main");
b4w["material"]    = b4w.require("material");
b4w["physics"]     = b4w.require("physics");
b4w["scenes"]      = b4w.require("scenes");
b4w["shaders"]     = b4w.require("shaders");
b4w["sfx"]         = b4w.require("sfx");
b4w["transform"]   = b4w.require("transform");
b4w["util"]        = b4w.require("util");
b4w["version"]     = b4w.require("version");

b4w["vec3"] = b4w.require("vec3");
b4w["vec4"] = b4w.require("vec4");
b4w["quat"] = b4w.require("quat");
b4w["mat3"] = b4w.require("mat3");
b4w["mat4"] = b4w.require("mat4");

for (var prop in b4w["main"])
    b4w[prop] = b4w["main"][prop];

