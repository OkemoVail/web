import argparse
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector


def image_node(nodes, path, non_color=False):
    node = nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path)
    if non_color:
        node.image.colorspace_settings.name = 'Non-Color'
    return node


def sphere(name, radius, location, material, segments=160):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def earth_material(day_path, night_path, normal_path, light_direction):
    mat = bpy.data.materials.new('Earth surface: day plus night-side cities')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    day = image_node(nodes, day_path)
    night = image_node(nodes, night_path)
    normal_tex = image_node(nodes, normal_path, True)
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = 0.3
    geometry = nodes.new('ShaderNodeNewGeometry')
    light = nodes.new('ShaderNodeVectorMath')
    light.operation = 'DOT_PRODUCT'
    light.inputs[1].default_value = light_direction
    dark = nodes.new('ShaderNodeMapRange')
    dark.inputs['From Min'].default_value = -0.16
    dark.inputs['From Max'].default_value = 0.08
    dark.inputs['To Min'].default_value = 1.0
    dark.inputs['To Max'].default_value = 0.0
    dark.clamp = True
    city_mask = nodes.new('ShaderNodeMath')
    city_mask.operation = 'MULTIPLY'
    links.new(day.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    links.new(geometry.outputs['Normal'], light.inputs[0])
    links.new(light.outputs['Value'], dark.inputs['Value'])
    links.new(night.outputs['Color'], bsdf.inputs['Emission Color'])
    links.new(night.outputs['Color'], city_mask.inputs[0])
    links.new(dark.outputs['Result'], city_mask.inputs[1])
    links.new(city_mask.outputs['Value'], bsdf.inputs['Emission Strength'])
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Metallic'].default_value = 0.02
    return mat


def cloud_material(path):
    mat = bpy.data.materials.new('Separate NASA cloud shell')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    texture = image_node(nodes, path)
    links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(texture.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.72
    mat.surface_render_method = 'DITHERED'
    return mat


def atmosphere_material():
    mat = bpy.data.materials.new('Rayleigh-like atmosphere rim')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    layer = nodes.new('ShaderNodeLayerWeight')
    layer.inputs['Blend'].default_value = 0.32
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.86
    ramp.color_ramp.elements[1].color = (0.03, 0.28, 1.0, 1)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 0.7
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(layer.outputs['Facing'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], emission.inputs['Color'])
    links.new(layer.outputs['Fresnel'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    mat.surface_render_method = 'DITHERED'
    return mat


def moon_material(albedo_path, normal_path):
    mat = bpy.data.materials.new('LRO lunar regolith')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    albedo = image_node(nodes, albedo_path)
    normal_tex = image_node(nodes, normal_path, True)
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = 0.62
    links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.96
    bsdf.inputs['Specular IOR Level'].default_value = 0.18
    return mat


def solar_material():
    mat = bpy.data.materials.new('Procedural granular solar photosphere')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    texture = nodes.new('ShaderNodeTexNoise')
    texture.noise_dimensions = '4D'
    texture.inputs['Scale'].default_value = 34
    texture.inputs['Detail'].default_value = 7
    texture.inputs['Roughness'].default_value = 0.72
    texture.inputs['Distortion'].default_value = 3.2
    texture.inputs['W'].default_value = 0.19
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.12, 0.001, 0, 1)
    ramp.color_ramp.elements[0].position = 0.24
    ramp.color_ramp.elements[1].color = (1.0, 0.48, 0.025, 1)
    ramp.color_ramp.elements[1].position = 0.78
    hot = ramp.color_ramp.elements.new(0.58)
    hot.color = (1.0, 0.065, 0.002, 1)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 5.5
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.22
    bump.inputs['Distance'].default_value = 0.08
    links.new(texture.outputs['Fac'], ramp.inputs['Fac'])
    links.new(texture.outputs['Fac'], bump.inputs['Height'])
    links.new(ramp.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], output.inputs['Surface'])
    return mat


def corona_material():
    mat = bpy.data.materials.new('Restrained solar corona')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    layer = nodes.new('ShaderNodeLayerWeight')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.04
    ramp.color_ramp.elements[0].color = (1.0, 0.08, 0.002, 0.32)
    ramp.color_ramp.elements[1].position = 0.58
    ramp.color_ramp.elements[1].color = (0, 0, 0, 0)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1.7
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(layer.outputs['Fresnel'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], emission.inputs['Color'])
    links.new(ramp.outputs['Alpha'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
    mat.surface_render_method = 'DITHERED'
    return mat


def star_field():
    random.seed(1909)
    vertices = []
    for _ in range(1800):
        z = random.uniform(-1, 1)
        angle = random.uniform(0, 2 * math.pi)
        radius = 95
        r = math.sqrt(1 - z * z)
        vertices.append((radius * r * math.cos(angle), radius * r * math.sin(angle), radius * z))
    mesh = bpy.data.meshes.new('Distant star field points')
    mesh.from_pydata(vertices, [], [])
    obj = bpy.data.objects.new('Distant star field', mesh)
    bpy.context.collection.objects.link(obj)
    material = bpy.data.materials.new('Star emission')
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.45, 0.58, 0.9, 1)
    bsdf.inputs['Emission Color'].default_value = (0.45, 0.58, 0.9, 1)
    bsdf.inputs['Emission Strength'].default_value = 4
    obj.data.materials.append(material)
    geometry = obj.modifiers.new('Subpixel star disks', 'NODES')
    group = bpy.data.node_groups.new('Star point renderer', 'GeometryNodeTree')
    geometry.node_group = group
    group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    inp = group.nodes.new('NodeGroupInput')
    out = group.nodes.new('NodeGroupOutput')
    points = group.nodes.new('GeometryNodeMeshToPoints')
    points.mode = 'VERTICES'
    points.inputs['Radius'].default_value = 0.035
    group.links.new(inp.outputs['Geometry'], points.inputs['Mesh'])
    group.links.new(points.outputs['Points'], out.inputs['Geometry'])


def track_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()


parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--width', type=int, required=True)
parser.add_argument('--height', type=int, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = os.path.abspath(args.root)
assets = os.path.join(root, 'AI', 'assets', 'lumen')
with open(os.path.join(root, 'AI', 'js', 'lumen-timeline.json'), encoding='utf-8') as file:
    timeline = json.load(file)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
world = scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.00008, 0.00012, 0.0003, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.008

light_direction = timeline['light']['direction']
bodies = timeline['bodies']
sun = sphere('Solar photosphere', bodies['sun']['radius'], bodies['sun']['position'], solar_material())
corona = sphere('Solar corona shell', bodies['sun']['radius'] * 1.075, bodies['sun']['position'], corona_material())
earth_position = list(bodies['earth']['position'])
moon_position = list(bodies['moon']['position'])
if args.height > args.width:
    earth_position[0] = timeline['mobile']['earthX']
    moon_position[0] = timeline['mobile']['moonX']
earth = sphere('Terra surface', bodies['earth']['radius'], earth_position, earth_material(
    os.path.join(assets, 'earth-day-desktop.webp'), os.path.join(assets, 'earth-night-desktop.webp'),
    os.path.join(assets, 'earth-normal-desktop.webp'), light_direction))
clouds = sphere('Terra cloud shell', bodies['earth']['radius'] * 1.012, earth_position,
                cloud_material(os.path.join(assets, 'earth-clouds-desktop.webp')))
atmosphere = sphere('Terra atmosphere shell', bodies['earth']['radius'] * 1.045, earth_position, atmosphere_material())
moon = sphere('Luna regolith', bodies['moon']['radius'], moon_position, moon_material(
    os.path.join(assets, 'moon-albedo-desktop.webp'), os.path.join(assets, 'moon-normal-desktop.webp')))
star_field()

light_data = bpy.data.lights.new('Solar directional light', 'SUN')
light_data.energy = 4.0
light_data.angle = timeline['light']['angularDiameter']
light = bpy.data.objects.new('Solar directional light', light_data)
bpy.context.collection.objects.link(light)
# The timeline vector points from the bodies toward the Sun; lamp rays travel opposite it.
light.rotation_euler = (-Vector(light_direction)).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = 'Timeline camera'
scene.camera = camera
for keyframe in timeline['camera']:
    frame = round(keyframe['ms'] * timeline['fps'] / 1000) + 1
    camera.location = keyframe['position']
    if args.height > args.width:
        camera.data.shift_x = timeline['mobile']['cameraShiftX']
    camera.data.lens = keyframe['lens']
    track_camera(camera, keyframe['target'])
    camera.keyframe_insert('location', frame=frame)
    camera.keyframe_insert('rotation_euler', frame=frame)
    camera.data.keyframe_insert('lens', frame=frame)

earth.rotation_euler[2] = math.radians(8)
earth.keyframe_insert('rotation_euler', frame=1)
earth.rotation_euler[2] = math.radians(14)
earth.keyframe_insert('rotation_euler', frame=240)
clouds.rotation_euler[2] = math.radians(10)
clouds.keyframe_insert('rotation_euler', frame=1)
clouds.rotation_euler[2] = math.radians(19)
clouds.keyframe_insert('rotation_euler', frame=240)

scene.frame_start = 1
scene.frame_end = 240
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
scene.render.fps = timeline['fps']
scene.render.filepath = os.path.abspath(args.output) + os.sep
scene.render.film_transparent = False
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.use_file_extension = True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(args.output)), 'lumen-render.blend'))
bpy.ops.render.render(animation=True)
