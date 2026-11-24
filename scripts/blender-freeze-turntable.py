import bpy
import math
import os
from mathutils import Vector


SCENE = bpy.context.scene
# Fast web preset. The site will cross-fade neighbouring frames, so 36 source
# views are enough for smooth pointer-controlled rotation.
FRAME_COUNT = 36
SAMPLES = 16
RESOLUTION_X = 1280
RESOLUTION_Y = 800


def scene_mesh_center():
    points = []
    for obj in SCENE.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return Vector((0.0, 0.0, 0.0))
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return (minimum + maximum) * 0.5


camera = bpy.data.objects.get("CAM MAIN") or SCENE.camera
if camera is None or camera.type != "CAMERA":
    raise RuntimeError("Nenalezena kamera 'CAM MAIN'.")

old_rig = bpy.data.objects.get("WEB_TURNTABLE_RIG")
if old_rig is not None:
    bpy.data.objects.remove(old_rig, do_unlink=True)

rig = bpy.data.objects.new("WEB_TURNTABLE_RIG", None)
rig.empty_display_type = "PLAIN_AXES"
rig.empty_display_size = 1.0
rig.location = scene_mesh_center()
SCENE.collection.objects.link(rig)

# Parent the camera while preserving its exact starting transform.
camera_world = camera.matrix_world.copy()
camera.parent = rig
camera.matrix_world = camera_world
SCENE.camera = camera

rig.rotation_mode = "XYZ"
rig.rotation_euler = (0.0, 0.0, 0.0)
rig.keyframe_insert(data_path="rotation_euler", frame=1)
rig.rotation_euler.z = math.tau
rig.keyframe_insert(data_path="rotation_euler", frame=FRAME_COUNT + 1)

if rig.animation_data and rig.animation_data.action:
    action = rig.animation_data.action
    if hasattr(action, "fcurves"):
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"

SCENE.frame_start = 1
SCENE.frame_end = FRAME_COUNT
SCENE.render.engine = "BLENDER_EEVEE_NEXT" if not hasattr(SCENE, "cycles") else "CYCLES"
if SCENE.render.engine == "CYCLES":
    SCENE.cycles.samples = SAMPLES
    SCENE.cycles.use_denoising = False

SCENE.render.resolution_x = RESOLUTION_X
SCENE.render.resolution_y = RESOLUTION_Y
SCENE.render.resolution_percentage = 100
SCENE.render.film_transparent = False
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.image_settings.color_mode = "RGB"
SCENE.render.image_settings.color_depth = "8"

output_dir = bpy.path.abspath("//turntable_frames")
os.makedirs(output_dir, exist_ok=True)
SCENE.render.filepath = os.path.join(output_dir, "freeze_")
SCENE.frame_set(1)

print("TURN_TABLE_READY")
print(f"Frames: 1-{FRAME_COUNT}")
print(f"Output: {output_dir}")
print("Spust Render > Render Animation (Cmd+F12).")
