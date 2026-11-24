"""Restore source material slot identity after glTF Transform deduplication."""
import copy
import json
import struct
import sys
from pathlib import Path


def read(path):
    data = Path(path).read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size]), data[20 + size:]


source, _ = read(sys.argv[1])
model, binary = read(sys.argv[2])
nodes = {node['name']: node for node in source['nodes'] if 'mesh' in node}
materials = []
indices = {}
processed = set()
for node in model['nodes']:
    if 'mesh' not in node or node['mesh'] in processed:
        continue
    processed.add(node['mesh'])
    before = source['meshes'][nodes[node['name']]['mesh']]['primitives']
    after = model['meshes'][node['mesh']]['primitives']
    for old, new in zip(before, after, strict=True):
        if 'material' not in old:
            continue
        key = (old['material'], new['material'])
        if key not in indices:
            material = copy.deepcopy(model['materials'][new['material']])
            material['name'] = source['materials'][old['material']].get('name', '')
            indices[key] = len(materials)
            materials.append(material)
        new['material'] = indices[key]
model['materials'] = materials
assert {n['name'] for n in source['nodes']} == {n['name'] for n in model['nodes']}
def tracks(document):
    return [(clip.get('name'), sorted((document['nodes'][c['target']['node']]['name'],
            c['target']['path']) for c in clip['channels'])) for clip in document.get('animations', [])]
assert tracks(model) == tracks(source)
assert 'KHR_draco_mesh_compression' in model['extensionsRequired']
assert all(i['mimeType'] == 'image/webp' for i in model['images'])
chunk = json.dumps(model, separators=(',', ':')).encode()
chunk += b' ' * (-len(chunk) % 4)
out = struct.pack('<4sIIII', b'glTF', 2, 20 + len(chunk) + len(binary), len(chunk), 0x4e4f534a)
Path(sys.argv[3]).write_bytes(out + chunk + binary)
