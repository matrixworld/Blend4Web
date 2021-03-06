"use strict";

/**
 * Camera animation add-on.
 * Provides extended support for camera.
 * @module camera_anim
 */
b4w.module["camera_anim"] = function(exports, require) {

// Global temporary vars
var _vec3_tmp   = new Float32Array(3);
var _vec3_tmp2  = new Float32Array(3);
var _vec3_tmp3  = new Float32Array(3);
var _quat4_tmp  = new Float32Array(4);

var PI = Math.PI;

var m_ctl  = require("controls");

var m_vec3 = require("vec3");
var m_quat = require("quat");

/**
 * Track camera to target
 * @param camobj Camera Object ID
 * @param target Target object or target position
 * @param rot_speed Rotation speed in radians per second
 * @param zoom_mult The multiplicity of zooming to the object
 * @param zoom_time Zooming time
 * @param zoom_delay Delay after zooming
 * @param callback Optional callback
 */
exports.track_to_target = function(cam_obj, target, rot_speed, zoom_mult,
                                    zoom_time, zoom_delay, callback, zoom_cb) {

    if (!cam_obj)
        return;

    if (!target)
        return;
    else if (b4w.util.is_vector(target))
        var obj_pos = target;
    else {
        var obj_pos = _vec3_tmp3;
        b4w.transform.get_object_center(target, false, obj_pos);
    }

    var rot_sp  = rot_speed  || 1;
    var zoom_m  = zoom_mult  || 2;
    var zoom_t  = zoom_time  || 1;
    var zoom_d  = zoom_delay || 1;

    var def_dir    = _vec3_tmp2;
    def_dir[0]     = 0;
    def_dir[1]     = -1;
    def_dir[2]     = 0;

    var cam_quat   = b4w.transform.get_rotation_quat(cam_obj);
    var cam_dir    = b4w.util.quat_to_dir(cam_quat, def_dir);
    var cam_angles = b4w.camera.get_angles(cam_obj);

    // direction vector to the target
    var dir_to_obj = _vec3_tmp;
    var cam_pos    = b4w.transform.get_translation(cam_obj);
    m_vec3.subtract(obj_pos, cam_pos, dir_to_obj);
    m_vec3.normalize(dir_to_obj, dir_to_obj);

    // quaternion between current camera vector and new camera vector
    var rot_quat = m_quat.rotationTo(cam_dir, dir_to_obj, m_quat.create());

    // final quaternion for the camera
    var quat = _quat4_tmp;
    m_quat.multiply(rot_quat, cam_quat, quat);

    b4w.util.correct_cam_quat_up(quat, false);

    // distance to zoom point
    var sub_vec = _vec3_tmp2;
    m_vec3.subtract(obj_pos, cam_pos, sub_vec);
    var zoom_distance = m_vec3.length(sub_vec) * (1 - 1 / zoom_m);

    // destination angles
    var angle_to_obj_y = Math.asin(dir_to_obj[1]);
    var angle_to_obj_x =
                 Math.acos(-dir_to_obj[2] / Math.abs(Math.cos(angle_to_obj_y)));

    if (dir_to_obj[0] > 0)
        angle_to_obj_x = 2 * Math.PI - angle_to_obj_x;

    // delta rotate angles
    var angle_x = angle_to_obj_x - cam_angles[0];
    var angle_y = angle_to_obj_y - cam_angles[1];

    var cam_dir_z = _vec3_tmp3;
    cam_dir_z[0]  = 0;
    cam_dir_z[1]  = 0;
    cam_dir_z[2]  = -1;

    var cam_rot_quat = b4w.transform.get_rotation_quat(cam_obj);
    var cam_rot_dir  = b4w.util.quat_to_dir(cam_rot_quat, cam_dir_z);

    if (cam_rot_dir[1] < 0) {
        if (cam_dir[1] > 0)
            angle_y = angle_to_obj_y - Math.PI + cam_angles[1];
        else
            angle_y = angle_to_obj_y + Math.PI + cam_angles[1];

        if (angle_x > 0)
            angle_x = -Math.PI + angle_x;
        else
            angle_x = Math.PI + angle_x;

    } else {
        if(Math.abs(angle_x) > Math.PI)
            if (angle_x > 0)
                angle_x = angle_x - 2 * Math.PI;
            else
                angle_x = angle_x + 2 * Math.PI;
    }

    angle_y = -angle_y;

    // action conditions
    var cur_time       = 0;
    var elapsed        = m_ctl.create_elapsed_sensor();
    var rot_end_time_x = Math.abs(angle_x / rot_sp);
    var rot_end_time_y = Math.abs(angle_y / rot_sp);
    var rot_end_time   =
        rot_end_time_x > rot_end_time_y ? rot_end_time_x : rot_end_time_y;
    var zoom_end_time  = rot_end_time + zoom_t;
    var zoom_end_delay = zoom_end_time + zoom_d;
    var finish_time    = zoom_end_delay + zoom_t;

    var dest_ang_x   = angle_x;
    var dest_ang_y   = angle_y;
    var dest_trans_x = zoom_distance;

    var smooth_function = function(x) {
        var f = 6 * x * (1 - x);
        return f;
    }

    var track_cb = function(obj, id, value, pulse) {

        if (pulse) {
            cur_time += value;

            if (cur_time < rot_end_time) {

                var delta_x = angle_x / rot_end_time * value;
                var delta_y = angle_y / rot_end_time * value;

                // smoothing
                var time_ratio = cur_time / rot_end_time;
                var slerp      = smooth_function(time_ratio);

                delta_x *= slerp;
                delta_y *= slerp;

                dest_ang_x -= delta_x;
                dest_ang_y -= delta_y;

                b4w.camera.rotate(obj, delta_x, delta_y);

            } else if (cur_time < zoom_end_time) {

                if (dest_ang_x) {
                    b4w.camera.rotate(obj, dest_ang_x, dest_ang_y);
                    dest_ang_x = 0;

                    if (zoom_cb)
                        zoom_cb();
                }

                var time_ratio = (cur_time - rot_end_time)/ zoom_t;
                var delta      = -zoom_distance * value / zoom_t;
                dest_trans_x  -= delta_x;

                delta *= smooth_function(time_ratio);
                b4w.transform.move_local(obj, 0, delta, 0);

            } else if (cur_time < zoom_end_delay) {
                if (dest_trans_x) {
                    b4w.transform.move_local(obj, 0, dest_trans_x, 0);
                    dest_trans_x = 0;
                }
                // waiting for zoom delay

            } else if (cur_time < finish_time) {
                var time_ratio = (cur_time - zoom_end_delay)/ zoom_t;
                var delta      = zoom_distance * value / zoom_t;

                delta *= smooth_function(time_ratio);
                b4w.transform.move_local(obj, 0, delta, 0);

            } else {
                b4w.transform.set_translation_v(obj, cam_pos);
                m_ctl.remove_sensor_manifold(obj, id);

                if (callback)
                    callback();
            }
        }
    }

    m_ctl.create_sensor_manifold(cam_obj,
                                "TRACK_TO_TARGET",
                                m_ctl.CT_CONTINUOUS,
                                [elapsed],
                                null,
                                track_cb);
}

/**
 * Auto rotate camera around object
 * @param auto_rotate_ratio Speed ratio of the camera
 */
exports.auto_rotate = function(auto_rotate_ratio) {

    var obj   = b4w.scenes.get_active_camera();

    if (obj.data["b4w_move_style"] !== "TARGET") {
        throw "wrong camera type";
    }

    function elapsed_cb(obj, id, value, pulse) {
        if (pulse == 1)
            b4w.camera.rotate_pivot(obj, value * auto_rotate_ratio, 0);
    }

    function mouse_cb() {
        m_ctl.remove_sensor_manifold(obj, "AUTO_ROTATE");
        m_ctl.remove_sensor_manifold(obj, "DISABLE_AUTO_ROTATE");
    }

    if (!m_ctl.check_sensor_manifold(obj, "AUTO_ROTATE")) {
        var mouse_move_x = m_ctl.create_mouse_move_sensor("X");
        var mouse_move_y = m_ctl.create_mouse_move_sensor("Y");
        var mouse_down   = m_ctl.create_mouse_click_sensor();
        var elapsed      = m_ctl.create_elapsed_sensor();

        var logic_func = function(s) {return (s[0] && s[2]) || (s[1] && s[2])};

        m_ctl.create_sensor_manifold(obj, "DISABLE_AUTO_ROTATE", m_ctl.CT_LEVEL,
                                    [mouse_move_x, mouse_move_y, mouse_down],
                                    logic_func,
                                    mouse_cb);

        m_ctl.create_sensor_manifold(obj, "AUTO_ROTATE", m_ctl.CT_CONTINUOUS,
                                    [elapsed], function(s) {return s[0]},
                                    elapsed_cb);
    } else
        mouse_cb();
}

}

if (window["b4w"])
    window["b4w"]["camera_anim"] = b4w.require("camera_anim");
else
    throw "Failed to register camera_anim, load b4w first";
