# 生成寫實人物（MakeHuman CC0 素材 + MPFB），再轉接 Quaternius CC0 動作。
# 用法：blender -b --addons bl_ext.user_default.mpfb -P make_character.py -- <角色> <輸出.glb> <素材資料夾> <UAL1.glb> <UAL2.glb>
import importlib, json, math, os, sys
import bmesh
import numpy as np
import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ROLE, OUT, ASSETS, UAL1, UAL2 = argv[:5]


def mod(name, key):
    for m in list(sys.modules):
        if m.endswith(name):
            return getattr(importlib.import_module(m), key)
    raise ValueError(name)


HumanService = mod('mpfb.services.humanservice', 'HumanService')
TargetService = mod('mpfb.services.targetservice', 'TargetService')
Props = mod('mpfb.entities.objectproperties', 'HumanObjectProperties')
ExportService = mod('mpfb.services.exportservice', 'ExportService')
ObjectService = mod('mpfb.services.objectservice', 'ObjectService')

M = {'gender': 1.0, 'caucasian': 1.0, 'african': 0.0, 'asian': 0.0}
F = {'gender': 0.0, 'caucasian': 1.0, 'african': 0.0, 'asian': 0.0}
BASE = {'Idle': (1, 'Idle_Loop'), 'Walk': (1, 'Walk_Loop'), 'Attack': (2, 'Sword_Regular_A'), 'Hit': (1, 'Hit_Chest'), 'Death': (1, 'Death01')}
ZOMBIE = {'Idle': (2, 'Zombie_Idle_Loop'), 'Walk': (2, 'Zombie_Walk_Fwd_Loop'), 'Attack': (2, 'Zombie_Scratch'), 'Hit': (1, 'Hit_Chest'), 'Death': (1, 'Death01')}
ROLES = {
    'hero': {'macro': {**M, 'age': 0.5, 'muscle': 0.7, 'weight': 0.5, 'height': 0.55}, 'skin': 'middleage_caucasian_male.mhmat', 'armor': 'hunter', 'sword': (0.55, 0.54, 0.52),
             'clips': {'Idle': (1, 'Sword_Idle'), 'Walk': (1, 'Walk_Loop'), 'Run': (1, 'Jog_Fwd_Loop'), 'Attack1': (2, 'Sword_Regular_A'), 'Attack2': (2, 'Sword_Regular_B'),
                       'Death': (1, 'Death01'), 'Dash': (2, 'Sword_Dash')}},
    'ghoul': {'macro': {**M, 'age': 0.65, 'muscle': 0.2, 'weight': 0.1, 'height': 0.45}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.42, 0.45, 0.33), 'armor': 'rags', 'cloth': (0.2, 0.18, 0.14), 'clips': ZOMBIE},
    'drowned': {'macro': {**F, 'age': 0.4, 'muscle': 0.3, 'weight': 0.25, 'height': 0.5}, 'skin': 'young_caucasian_female.mhmat', 'skinTint': (0.3, 0.42, 0.4), 'armor': 'rags', 'cloth': (0.12, 0.18, 0.17), 'hair': 'long01.mhclo', 'clips': ZOMBIE},
    'brute': {'macro': {**M, 'age': 0.6, 'muscle': 1.0, 'weight': 0.9, 'height': 0.7}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.36, 0.4, 0.29), 'armor': 'rags', 'cloth': (0.15, 0.13, 0.1),
              'clips': {**ZOMBIE, 'Attack': (1, 'Punch_Cross')}},
    'skeleton': {'macro': {**M, 'age': 0.9, 'muscle': 0.0, 'weight': 0.0, 'height': 0.5}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.6, 0.55, 0.43), 'armor': 'rust', 'sword': (0.34, 0.26, 0.2), 'clips': {**BASE, 'Idle': (1, 'Sword_Idle')}},
    'archer': {'macro': {**M, 'age': 0.9, 'muscle': 0.0, 'weight': 0.0, 'height': 0.48}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.5, 0.46, 0.36), 'armor': 'rags', 'cloth': (0.2, 0.16, 0.12), 'bow': True,
               'clips': {**BASE, 'Attack': (1, 'Spell_Simple_Shoot')}},
    'monk': {'macro': {**M, 'age': 0.6, 'muscle': 0.2, 'weight': 0.3, 'height': 0.5}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.5, 0.44, 0.38), 'armor': 'robe', 'cloth': (0.2, 0.06, 0.06), 'hood': True,
             'clips': {**BASE, 'Attack': (1, 'Spell_Simple_Shoot')}},
    'abbot': {'macro': {**M, 'age': 0.75, 'muscle': 0.8, 'weight': 0.6, 'height': 0.8}, 'skin': 'old_caucasian_male.mhmat', 'skinTint': (0.5, 0.36, 0.33), 'armor': 'robe', 'cloth': (0.3, 0.05, 0.05), 'hood': True,
              'clips': {**BASE, 'Attack': (1, 'Punch_Cross')}},
    'npc_ge': {'macro': {**M, 'age': 0.95, 'muscle': 0.3, 'weight': 0.45, 'height': 0.5}, 'skin': 'old_caucasian_male.mhmat', 'armor': 'robe', 'cloth': (0.2, 0.2, 0.24), 'hair': 'short04.mhclo', 'clips': {'Idle': (1, 'Idle_Loop')}},
    'npc_dala': {'macro': {**F, 'age': 0.5, 'muscle': 0.8, 'weight': 0.55, 'height': 0.55}, 'skin': 'middleage_caucasian_female.mhmat', 'armor': 'smith', 'hair': 'ponytail01.mhclo', 'clips': {'Idle': (2, 'Idle_FoldArms_Loop')}},
    'npc_herb': {'macro': {**F, 'age': 0.95, 'muscle': 0.1, 'weight': 0.5, 'height': 0.4}, 'skin': 'old_caucasian_female.mhmat', 'armor': 'robe', 'cloth': (0.22, 0.27, 0.17), 'hair': 'bob01.mhclo', 'clips': {'Idle': (1, 'Idle_Loop')}},
}
LOOP = {'Idle', 'Walk', 'Run'}
role = ROLES[ROLE]
role.setdefault('hair', None)
role.setdefault('brow', 'eyebrow002.mhclo')


def find(sub, name):
    for root, _, files in os.walk(os.path.join(ASSETS, sub)):
        if name in files:
            return os.path.join(root, name)
    raise FileNotFoundError(name)


# 1. 人物
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
base = HumanService.create_human(macro_detail_dict=None)
for k, v in role['macro'].items():
    Props.set_value(k, v, entity_reference=base)
TargetService.reapply_macro_details(base)
HumanService.set_character_skin(find('skins', role['skin']), base, skin_type='GAMEENGINE')
rig = HumanService.add_builtin_rig(base, 'game_engine')
items = [('eyes', 'low-poly.mhclo', 'Eyes')]  # 鏡頭咁遠，牙、舌、睫毛睇唔到，慳 draw call
if role['hair']:
    items.append(('hair', role['hair'], 'Hair'))
for sub, f, kind in items:
    HumanService.add_mhclo_asset(find(sub, f), base, asset_type=kind, material_type='GAMEENGINE')

root = ExportService.create_character_copy(base, name_suffix='_x')
xbase = ObjectService.find_object_of_type_amongst_nearest_relatives(root, 'Basemesh')
ExportService.bake_modifiers_remove_helpers(xbase, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
print('ROOT', root.name, root.type, [o.name for o in bpy.data.objects])
arm = root if root.type == 'ARMATURE' else next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.endswith('_x'))

# 淨係留低要匯出嗰份
keep = {arm} | set(ObjectService.get_list_of_children(arm))
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)


def bake_keys(o):
    """體形喺 shape key 入面，匯出前要壓落 mesh，否則身體會行返預設形狀"""
    if o.type != 'MESH' or not o.data.shape_keys:
        return
    k = o.shape_key_add(name='mix', from_mix=True)
    co = [0.0] * (len(o.data.vertices) * 3)
    k.data.foreach_get('co', co)
    o.shape_key_clear()
    o.data.vertices.foreach_set('co', co)
    o.data.update()


for o in list(keep):
    bake_keys(o)
body = xbase


# 由身體模型生成合身裝備：一樣嘅頂點權重，自動跟骨架郁
TEX = os.path.join(os.path.dirname(ASSETS.rstrip('/')), 'tex')


def pbr_mat(name, tex, tint, metal=0.0, uv=6, rough=0.75):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n = m.node_tree
    b = n.nodes['Principled BSDF']

    def load(suffix, colorspace='Non-Color', mul=None):
        im = bpy.data.images.load(os.path.join(TEX, tex, f'{tex}_1K-JPG_{suffix}.jpg'))
        im.scale(512, 512)
        im.colorspace_settings.name = colorspace
        if mul:
            # 按亮度重新上色：保留貼圖細節，顏色由 mul 決定（貼圖本身係乜色都得）
            px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
            im.pixels.foreach_get(px)
            px = px.reshape(-1, 4)
            lum = px[:, 0] * 0.3 + px[:, 1] * 0.6 + px[:, 2] * 0.1
            lum = 1 + (lum / lum.mean() - 1) * 0.8
            for c in range(3):
                px[:, c] = np.clip(lum * mul[c], 0, 1)
            im.pixels.foreach_set(px.ravel())
        im.pack()
        t = n.nodes.new('ShaderNodeTexImage')
        t.image = im
        return t

    n.links.new(load('Color', 'sRGB', tint).outputs[0], b.inputs['Base Color'])
    n.links.new(load('Roughness', mul=(rough, rough, rough)).outputs[0], b.inputs['Roughness'])
    nm = n.nodes.new('ShaderNodeNormalMap')
    n.links.new(load('NormalGL').outputs[0], nm.inputs['Color'])
    n.links.new(nm.outputs[0], b.inputs['Normal'])
    b.inputs['Metallic'].default_value = metal
    m['uv'] = uv
    return m


def dominant(o):
    names = {g.index: g.name for g in o.vertex_groups if g.name in arm.pose.bones}  # 仲有 Left/Mid/Right 等非骨架組
    out = []
    for v in o.data.vertices:
        best = max((g for g in v.groups if g.group in names), key=lambda g: g.weight, default=None)
        out.append(names.get(best.group) if best else None)
    return out


# 高度條件以 1.82 米人為準，高矮唔同嘅角色按比例
TALL = max(v.co.z for v in body.data.vertices) / 1.82


def shell(name, bones, offset, mat, keep_co=lambda c: True):
    o = body.copy()
    o.data = body.data.copy()
    o.name = name
    o.parent = body.parent
    bpy.context.collection.objects.link(o)
    dom = dominant(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    drop = [f for f in bm.faces if not all(dom[v.index] in bones and keep_co(v.co / TALL) for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    uv = bm.loops.layers.uv.active
    k = mat.get('uv', 6)
    if uv:
        for f in bm.faces:
            for l in f.loops:
                l[uv].uv = l[uv].uv * k
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


L = lambda *a: {x + s for x in a for s in ('_l', '_r')}
FINGERS = {f'{n}_0{i}{s}' for n in ('index', 'middle', 'ring', 'pinky', 'thumb') for i in (1, 2, 3) for s in ('_l', '_r')}
TORSO = {'pelvis', 'spine_01', 'spine_02', 'spine_03'} | L('clavicle')


def box(bm, cx, cy, cz, sx, sy, sz, taper=1.0):
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']:
        k = 1 + (taper - 1) * (v.co.z + 0.5)
        v.co.x = cx + v.co.x * sx * k
        v.co.y = cy + v.co.y * sy * k
        v.co.z = cz + v.co.z * sz


SWORD = {'at': Vector((0.0, 0.09, 0.0)), 'rx': math.radians(90), 'rz': 0.0}


def make_sword(steel):
    """長劍：喺手骨座標砌好，全部權重畀 hand_r"""
    bm = bmesh.new()
    box(bm, 0, 0, 0.62, 0.05, 0.012, 0.88, 0.25)   # 劍身
    box(bm, 0, 0, 0.17, 0.19, 0.03, 0.028)         # 護手
    box(bm, 0, 0, 0.05, 0.03, 0.03, 0.2)           # 握柄
    box(bm, 0, 0, -0.07, 0.05, 0.05, 0.05)         # 劍首
    me = bpy.data.meshes.new('長劍')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('長劍', me)
    bpy.context.collection.objects.link(o)
    me.materials.append(steel)
    me.uv_layers.new()
    bone = arm.data.bones['hand_r'].matrix_local
    me.transform(bone @ Matrix.Translation(SWORD['at']) @ Matrix.Rotation(SWORD['rx'], 4, 'X') @ Matrix.Rotation(SWORD['rz'], 4, 'Z'))
    o.parent = arm
    g = o.vertex_groups.new(name='hand_r')
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = arm
    return o


def make_skirt(mat, top=1.02, bottom=0.04, r0=0.19, r1=0.27):
    """長袍下擺：圓錐面，上段跟盤骨，下段跟左右大腿"""
    rows, cols = 7, 20
    me = bpy.data.meshes.new('下擺')
    verts = []
    faces = []
    top *= TALL
    r0 *= TALL
    r1 *= TALL
    for i in range(rows):
        k = i / (rows - 1)
        z = top + (bottom - top) * k
        r = r0 + (r1 - r0) * k
        for j in range(cols):
            a = j / cols * math.tau
            verts.append((math.cos(a) * r, math.sin(a) * r * 0.8, z))
    for i in range(rows - 1):
        for j in range(cols):
            a, b = i * cols + j, i * cols + (j + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    me.from_pydata(verts, [], faces)
    me.update()
    me.uv_layers.new()
    for p in me.polygons:
        p.use_smooth = True
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            me.uv_layers.active.data[li].uv = (math.atan2(v.y, v.x) * 2, v.z * 4)
    o = bpy.data.objects.new('下擺', me)
    bpy.context.collection.objects.link(o)
    me.materials.append(mat)
    o.parent = arm
    hip, tl, tr = o.vertex_groups.new(name='pelvis'), o.vertex_groups.new(name='thigh_l'), o.vertex_groups.new(name='thigh_r')
    for v in me.vertices:
        k = (top - v.co.z) / (top - bottom)
        side = (v.co.x / 0.3 + 1) / 2
        side = max(0.0, min(1.0, side))
        leg = min(1.0, k * 2.2)
        hip.add([v.index], 1 - leg, 'REPLACE')
        tl.add([v.index], leg * side, 'REPLACE')
        tr.add([v.index], leg * (1 - side), 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = arm


def make_bow(mat):
    """短弓：喺左手骨砌，全部權重畀 hand_l"""
    bm = bmesh.new()
    n = 30
    for i in range(n):
        a0 = -1.1 + 2.2 * i / n
        a1 = -1.1 + 2.2 * (i + 1) / n
        p0 = Vector((math.cos(a0) * 0.55 - 0.55, 0, math.sin(a0) * 0.62))
        p1 = Vector((math.cos(a1) * 0.55 - 0.55, 0, math.sin(a1) * 0.62))
        mid = (p0 + p1) / 2
        box(bm, mid.x, mid.y, mid.z, 0.02, 0.025, (p1 - p0).length * 1.1)
    me = bpy.data.meshes.new('弓')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('弓', me)
    bpy.context.collection.objects.link(o)
    me.materials.append(mat)
    me.uv_layers.new()
    me.transform(arm.data.bones['hand_l'].matrix_local @ Matrix.Translation((0, 0.09, 0)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
    o.parent = arm
    o.vertex_groups.new(name='hand_l').add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = arm


def strip_body(keep_bones):
    """蓋住嘅身體刪走，唔會穿模"""
    dom = dominant(body)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(dom[v.index] in keep_bones for v in f.verts)], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()


HANDS = L('hand') | FINGERS
LIMBS = L('upperarm', 'lowerarm', 'thigh', 'calf')
FEET = L('foot', 'ball')
FACE_OPEN = lambda c: not (c.y < 0.0 and abs(c.x) < 0.07 and 1.55 < c.z < 1.71)


def dress():
    kind = role.get('armor')
    col = role.get('cloth', (0.29, 0.25, 0.22))
    cloth = pbr_mat('布衣', 'Fabric030', col, rough=0.9)
    leather = pbr_mat('皮甲', 'Leather026', (0.36, 0.23, 0.14))
    dark = pbr_mat('深皮', 'Leather026', (0.17, 0.13, 0.1))
    steel = pbr_mat('舊鐵', 'Metal034', role.get('sword', (0.55, 0.54, 0.52)), metal=0.6, uv=3, rough=0.5)
    if kind == 'hunter':
        shell('內衣', TORSO | LIMBS | {'neck_01'}, 0.012, cloth, lambda c: c.z < 1.57)
        shell('胸甲', TORSO, 0.032, leather, lambda c: 0.92 < c.z < 1.53)
        shell('肩甲', L('clavicle', 'upperarm'), 0.055, steel, lambda c: c.z > 1.33 and abs(c.x) > 0.13)
        shell('護腕', L('lowerarm'), 0.024, leather)
        shell('手套', HANDS, 0.005, dark)
        shell('靴', FEET | L('calf'), 0.02, dark, lambda c: c.z < 0.46)
        shell('腰帶', {'pelvis', 'spine_01'}, 0.045, dark, lambda c: 0.95 < c.z < 1.03)
        shell('戰裙', {'pelvis'} | L('thigh'), 0.05, cloth, lambda c: 0.55 < c.z < 1.0)
        shell('兜帽', {'head', 'neck_01'}, 0.03, cloth, FACE_OPEN)
        strip_body({'head'})
    elif kind == 'rust':
        rust = pbr_mat('鏽甲', 'Metal034', (0.3, 0.2, 0.14), metal=0.3, uv=3, rough=0.8)
        shell('破衣', {'pelvis', 'spine_01'} | L('thigh'), 0.014, cloth, lambda c: c.z > 0.6)
        shell('鏽胸甲', TORSO, 0.03, rust, lambda c: 0.98 < c.z < 1.52)
        shell('鏽肩', L('clavicle', 'upperarm'), 0.045, rust, lambda c: c.z > 1.36 and abs(c.x) > 0.13)
        shell('鏽脛', L('calf'), 0.02, rust, lambda c: 0.12 < c.z < 0.46)
        strip_body({'head', 'neck_01', 'spine_03'} | HANDS | L('lowerarm', 'upperarm', 'thigh', 'calf') | FEET | L('clavicle'))
    elif kind == 'rags':
        shell('破衣', {'pelvis', 'spine_01', 'spine_02'} | L('thigh'), 0.012, cloth, lambda c: 0.62 < c.z < 1.3 and (math.sin(c.x * 40) + math.sin(c.z * 30) > -1.2))
        strip_body({'head', 'neck_01', 'spine_03', 'spine_02', 'spine_01', 'pelvis'} | HANDS | LIMBS | FEET | L('clavicle'))
    elif kind == 'robe':
        shell('袍身', TORSO | L('upperarm', 'lowerarm') | {'neck_01'}, 0.03, cloth, lambda c: c.z < 1.56)
        shell('腰帶', {'pelvis', 'spine_01'}, 0.05, dark, lambda c: 0.96 < c.z < 1.03)
        make_skirt(cloth)
        keep = {'head'} | HANDS
        if role.get('hood'):
            shell('兜帽', {'head', 'neck_01'}, 0.035, cloth, lambda c: not (c.y < 0.0 and abs(c.x) < 0.075 and 1.5 < c.z < 1.72))
        else:
            keep |= {'neck_01'}
        strip_body(keep)
    elif kind == 'smith':
        shell('上衣', TORSO | L('upperarm') | {'neck_01'}, 0.012, cloth, lambda c: 0.9 < c.z < 1.5)
        shell('長褲', {'pelvis'} | L('thigh', 'calf'), 0.014, cloth, lambda c: c.z > 0.1)
        shell('圍裙', {'pelvis', 'spine_01', 'spine_02', 'spine_03'} | L('thigh'), 0.03, leather, lambda c: c.y < -0.01 and 0.55 < c.z < 1.42 and abs(c.x) < 0.17)
        shell('靴', FEET | L('calf'), 0.02, dark, lambda c: c.z < 0.34)
        strip_body({'head', 'neck_01'} | HANDS | L('lowerarm'))
    if 'sword' in role:
        make_sword(steel)
    if role.get('bow'):
        make_bow(dark)


dress()
tint = role.get('skinTint')
if tint:
    # 皮膚按亮度重新上色：灰綠、蒼白等
    for m in body.data.materials:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB':
                im = n.image
                px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
                im.pixels.foreach_get(px)
                px = px.reshape(-1, 4)
                lum = px[:, 0] * 0.3 + px[:, 1] * 0.6 + px[:, 2] * 0.1
                lum = lum / lum.mean()
                for c in range(3):
                    px[:, c] = np.clip(lum * tint[c], 0, 1)
                im.pixels.foreach_set(px.ravel())
                im.pack()
                break


# 皮膚唔可以半透明：透明排序會令面部穿洞
for m in {m for o in bpy.data.objects if o.type == 'MESH' for m in o.data.materials}:
    if not m.use_nodes or 'eyebrow' in m.name or 'eyelash' in m.name:
        continue
    m.blend_method = 'OPAQUE'
    b = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if b:
        for l in list(b.inputs['Alpha'].links):
            m.node_tree.links.remove(l)
        b.inputs['Alpha'].default_value = 1.0


# 2. 匯入動作骨架
def load_ual(path):
    before = set(bpy.data.objects)
    acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path, import_pack_images=False)
    new = set(bpy.data.objects) - before
    a = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    a.animation_data_create()
    return a, {x.name.split('_' + a.name)[0].split('.')[0]: x for x in set(bpy.data.actions) - acts}


src = {1: load_ual(UAL1), 2: load_ual(UAL2)}
print('ACTS', sorted(src[1][1])[:6])
NAME = {'Root': 'root', 'head': 'Head'}
src_bone = lambda b: NAME.get(b, b)


def action_named(acts, n):
    if n in acts:
        return acts[n]
    raise KeyError(n)


def world_rots(a, action, frame):
    a.animation_data.action = action
    bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
    bpy.context.view_layer.update()
    return {p.name: (a.matrix_world @ p.matrix).to_quaternion() for p in a.pose.bones}, {p.name: (a.matrix_world @ p.matrix).translation.copy() for p in a.pose.bones}


# 3. 校準：將人物擺到同動作庫 T-Pose 一樣嘅骨向
order = []
def walk(p):
    order.append(p)
    for c in p.children:
        walk(c)
for p in arm.pose.bones:
    if p.parent is None:
        walk(p)

bpy.context.view_layer.objects.active = arm
tgt_rest = {p.name: (arm.matrix_world @ p.bone.matrix_local) for p in arm.pose.bones}


def set_world(p, world_rot, world_pos, solved):
    """由父骨算返本地 basis"""
    rest = p.bone.matrix_local
    mw = arm.matrix_world.to_3x3().to_4x4().inverted()
    m = mw @ Matrix.Translation(world_pos - arm.matrix_world.translation) @ world_rot.to_matrix().to_4x4()
    if p.parent:
        pr = p.parent.bone.matrix_local
        basis = (solved[p.parent.name] @ pr.inverted() @ rest).inverted() @ m
    else:
        basis = rest.inverted() @ m
    p.matrix_basis = basis
    return m


src_a, src_acts = src[1]
tpose = action_named(src_acts, 'A_TPose')
T_rot, T_pos = world_rots(src_a, tpose, 1)
# 每條骨：目標世界方向 = 動作庫 T-Pose 骨方向，保留目標自己嘅 roll
dir_of = lambda q: (q @ Vector((0, 1, 0))).normalized()
NEXT = {'pelvis': 'spine_01', 'spine_03': 'neck_01', 'hand_l': 'middle_01_l', 'hand_r': 'middle_01_r'}


def src_dir(n):
    """動作骨架嘅骨向要睇下一節位置，匯入後 Y 軸唔一定沿住骨"""
    p = src_a.pose.bones[n]
    c = NEXT.get(n) or (p.children[0].name if p.children else None)
    return (T_pos[c] - T_pos[n]).normalized() if c else dir_of(T_rot[n])


T_tgt = {}
for p in order:
    n = src_bone(p.name)
    r = tgt_rest[p.name].to_quaternion()
    if n in T_rot:
        now = dir_of(r)
        want = src_dir(n)
        r = now.rotation_difference(want) @ r
    T_tgt[p.name] = r

src_hip = T_pos['pelvis'].z
tgt_hip = tgt_rest['pelvis'].translation.z
scale = tgt_hip / src_hip
print('HIP', src_hip, tgt_hip)

# 4. 烘焙
FPS = 30
bpy.context.scene.render.fps = FPS
arm.animation_data_create()
arm.rotation_mode = 'QUATERNION'
meta = {}
for game, (which, name) in role['clips'].items():
    loop = game in LOOP
    a, acts = src[which]
    act = action_named(acts, name)
    start, end = act.frame_range
    frames = max(2, int(round((end - start) / bpy.context.scene.render.fps * FPS)) + 1)
    out = bpy.data.actions.new(game)
    arm.animation_data.action = out
    a0_T_rot, _ = world_rots(a, action_named(acts, 'A_TPose'), 1)
    n_frames = int(end - start) + 1
    for i in range(n_frames):
        f = start + i
        rots, poss = world_rots(a, act, f)
        solved = {}
        for p in order:
            n = src_bone(p.name)
            q = (rots[n] @ a0_T_rot[n].inverted() @ T_tgt[p.name]) if n in rots else T_tgt[p.name]
            if p.parent:
                pm = solved[p.parent.name]
                pos = (arm.matrix_world @ (pm @ p.parent.bone.matrix_local.inverted() @ p.bone.matrix_local)).translation
            elif n in poss:
                d = poss[n] - T_pos[n]
                pos = tgt_rest[p.name].translation + d * scale
            else:
                pos = tgt_rest[p.name].translation
            if p.name == 'pelvis':
                d = poss['pelvis'] - T_pos['pelvis']
                pos = tgt_rest['pelvis'].translation + d * scale
            solved[p.name] = set_world(p, q, pos, solved)
        for p in order:
            p.rotation_mode = 'QUATERNION'
            p.keyframe_insert('rotation_quaternion', frame=i + 1, group=p.name)
            if p.name == 'pelvis':
                p.keyframe_insert('location', frame=i + 1, group=p.name)
    tr = arm.animation_data.nla_tracks.new()
    tr.name = game
    tr.strips.new(game, 1, out)
    arm.animation_data.action = None
    meta[game] = {'loop': loop, 'frames': n_frames}
    print('CLIP', game, n_frames)

for a, _ in src.values():
    bpy.data.objects.remove(a, do_unlink=True)
for p in arm.pose.bones:
    p.matrix_basis = Matrix.Identity(4)

# 全部併做一個 mesh：同材質只畫一次，draw call 大減
meshes = [o for o in arm.children_recursive if o.type == 'MESH']
for o in meshes:
    for mod_ in [x for x in o.modifiers if x.type != 'ARMATURE']:
        o.modifiers.remove(mod_)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
# 鏡頭遠，一萬二千面已經夠；蒙皮權重會跟住保留
d = body.modifiers.new('減面', 'DECIMATE')
d.ratio = min(1.0, 12000 / max(1, sum(len(p.vertices) - 2 for p in body.data.polygons)))
body.modifiers.move(len(body.modifiers) - 1, 0)
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=d.name)

# 5. 匯出：貼圖最大 384，九個角色先唔會太大
for im in bpy.data.images:
    if max(im.size) > 384:
        im.scale(384, 384)
        im.pack()
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for c in arm.children_recursive:
    c.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_morph=False, export_image_format='WEBP', export_image_quality=55, export_apply=False)
print('DONE', OUT, json.dumps(meta))
