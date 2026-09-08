import argparse
import math
import os
import random
import sys

import bpy


def material(name, image_path, roughness=0.65, normal_path=None, emission_path=None, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    image = bpy.data.images.load(image_path)
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    mat.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_path:
        normal_texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
        normal_texture.image = bpy.data.images.load(normal_path)
        normal_texture.image.colorspace_settings.name = 'Non-Color'
        normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = 0.42
        mat.node_tree.links.new(normal_texture.outputs['Color'], normal.inputs['Color'])
        mat.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    if emission_path:
        night_texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
        night_texture.image = bpy.data.images.load(emission_path)
        mat.node_tree.links.new(night_texture.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 0.28
    if alpha:
        mat.node_tree.links.new(texture.outputs['Alpha'], bsdf.inputs['Alpha'])
        bsdf.inputs['Roughness'].default_value = 0.8
        mat.surface_render_method = 'DITHERED'
    return mat


def sphere(name, radius, location, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def key(obj, frame, location, scale=None):
    obj.location = location
    if scale:
        obj.scale = scale
    obj.keyframe_insert('location', frame=frame)
    if scale:
        obj.keyframe_insert('scale', frame=frame)


parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--width', type=int, required=True)
parser.add_argument('--height', type=int, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

root = os.path.abspath(args.root)
assets = os.path.join(root, 'AI', 'assets', 'lumen')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.0004, 0.0008, 0.002, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.035

earth_mat = material(
    'Earth NASA Blue Marble',
    os.path.join(assets, 'earth-day-desktop.webp'),
    0.48,
    os.path.join(assets, 'earth-normal-desktop.webp'),
    os.path.join(assets, 'earth-night-desktop.webp'),
)
cloud_mat = material('Earth NASA clouds', os.path.join(assets, 'earth-clouds-desktop.webp'), 0.8, alpha=True)
moon_mat = material(
    'Moon NASA LRO',
    os.path.join(assets, 'moon-albedo-desktop.webp'),
    0.88,
    os.path.join(assets, 'moon-normal-desktop.webp'),
)
sun_mat = bpy.data.materials.new('Solar plasma')
sun_mat.use_nodes = True
sun_bsdf = sun_mat.node_tree.nodes.get('Principled BSDF')
sun_bsdf.inputs['Base Color'].default_value = (1.0, 0.11, 0.008, 1)
sun_bsdf.inputs['Emission Color'].default_value = (1.0, 0.055, 0.003, 1)
sun_bsdf.inputs['Emission Strength'].default_value = 8

sun = sphere('Solar limb', 5.2, (-6.5, 0, -1), sun_mat)
earth = sphere('Terra', 2.35, (8, 0, 1.8), earth_mat)
clouds = sphere('Terra clouds', 2.385, (8, 0, 1.8), cloud_mat)
moon = sphere('Luna', 0.74, (12, -1, -1), moon_mat)

random.seed(19)
star_mat = bpy.data.materials.new('Distant stars')
star_mat.diffuse_color = (0.55, 0.66, 0.88, 1)
for index in range(90):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1,
        radius=random.uniform(0.008, 0.025),
        location=(random.uniform(-14, 14), random.uniform(-1.5, 2.5), random.uniform(-9, 9)),
    )
    bpy.context.object.name = f'Star {index:03d}'
    bpy.context.object.data.materials.append(star_mat)

light_data = bpy.data.lights.new('Sunlight', 'SUN')
light_data.energy = 4.5
light_data.angle = math.radians(2.5)
light = bpy.data.objects.new('Sunlight', light_data)
bpy.context.collection.objects.link(light)
light.rotation_euler = (math.radians(20), math.radians(-35), math.radians(-50))

bpy.ops.object.camera_add(location=(0, -19, 0), rotation=(math.radians(90), 0, 0))
camera = bpy.context.object
bpy.context.scene.camera = camera
camera.data.lens = 46

key(sun, 1, (-4.2, 0, -0.3), (1.5, 1.5, 1.5))
key(sun, 60, (-10.5, 1, 1.5), (0.7, 0.7, 0.7))
key(sun, 150, (-14, 2, 2), (0.35, 0.35, 0.35))
key(sun, 240, (-16, 3, 3), (0.25, 0.25, 0.25))
key(earth, 1, (10, 0, 2.8), (0.18, 0.18, 0.18))
key(earth, 60, (5.3, 0, 0.7), (0.75, 0.75, 0.75))
key(earth, 150, (2.4, 0, 0.2), (1.15, 1.15, 1.15))
key(earth, 195, (3.3, 0, 1.0), (1.0, 1.0, 1.0))
key(earth, 240, (4.1, 0, 2.3), (1.05, 1.05, 1.05))
key(clouds, 1, (10, 0, 2.8), (0.18, 0.18, 0.18))
key(clouds, 60, (5.3, 0, 0.7), (0.75, 0.75, 0.75))
key(clouds, 150, (2.4, 0, 0.2), (1.15, 1.15, 1.15))
key(clouds, 195, (3.3, 0, 1.0), (1.0, 1.0, 1.0))
key(clouds, 240, (4.1, 0, 2.3), (1.05, 1.05, 1.05))
key(moon, 1, (12, 0, -2), (0.1, 0.1, 0.1))
key(moon, 150, (4.8, -1, -1.8), (1.35, 1.35, 1.35))
key(moon, 195, (-1.2, -2, -0.8), (1.1, 1.1, 1.1))
key(moon, 240, (0.9, -1, -0.4), (0.55, 0.55, 0.55))

if args.height > args.width:
    for obj in (earth, clouds):
        for frame, x in ((1, 4.5), (60, 2.1), (150, 1.1), (195, 1.2), (240, 1.45)):
            obj.location.x = x
            obj.keyframe_insert('location', frame=frame)
    for frame, x in ((1, 5.5), (150, 2.0), (195, -0.7), (240, 0.1)):
        moon.location.x = x
        moon.keyframe_insert('location', frame=frame)

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 240
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.fps = 30
scene.render.filepath = os.path.abspath(args.output) + os.sep
scene.render.film_transparent = False
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.image_settings.color_depth = '8'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(args.output)), 'lumen-render.blend'))
bpy.ops.render.render(animation=True)
