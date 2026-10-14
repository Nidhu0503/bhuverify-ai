"""Offline binary checks and contact sheets. Requires pypdf, Pillow, pdftoppm."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path(__file__).resolve().parent
metadata = json.loads((root / 'manifest.json').read_text())
assert hashlib.sha256((root / 'dataset.json').read_bytes()).hexdigest() == metadata['datasetSha256']
manifest = metadata['documents']
qa = root / 'tmp/pdfs'
qa.mkdir(parents=True, exist_ok=True)
poppler = os.environ.get('PDFTOPPM', 'pdftoppm')
tiles = []
for document in manifest:
    file = root / document['path']
    data = file.read_bytes()
    assert len(data) == document['bytes'] and len(data) <= 10 * 1024 * 1024
    assert hashlib.sha256(data).hexdigest() == document['sha256']
    previews = []
    if file.suffix == '.pdf':
        reader = PdfReader(file)
        assert len(reader.pages) == document['pages'], document['documentId']
        if document['quality'] == 'severe':
            assert not ''.join(p.extract_text() for p in reader.pages).strip(), 'Scan leaked text'
        else:
            assert all('FICTIONAL TEST DOCUMENT' in p.extract_text() for p in reader.pages)
        prefix = qa / document['documentId']
        subprocess.run([poppler, '-scale-to', '1200', '-png', str(file), str(prefix)], check=True)
        previews = sorted(qa.glob(document['documentId'] + '-[0-9]*.png'))
        assert len(previews) == document['pages']
    elif file.suffix in ('.png', '.jpeg', '.jpg'):
        with Image.open(file) as scan:
            assert scan.size == (794, 1122), file
        previews = [file]
    else:
        assert data.decode('utf8').startswith('FICTIONAL TEST DOCUMENT')
    for index, preview in enumerate(previews, 1):
        with Image.open(preview) as source:
            thumb = source.convert('RGB')
        thumb.thumbnail((260, 368))
        tile = Image.new('RGB', (280, 402), '#e9efec')
        tile.paste(thumb, ((280-thumb.width)//2, 25))
        ImageDraw.Draw(tile).text((10, 6), f"{document['documentId']} / page {index}", fill='black')
        tiles.append(tile)
for start in range(0, len(tiles), 16):
    selected = tiles[start:start+16]
    sheet = Image.new('RGB', (1120, ((len(selected)+3)//4)*402), 'white')
    for index, tile in enumerate(selected):
        sheet.paste(tile, ((index%4)*280, (index//4)*402))
    sheet.save(qa / f'contact-{start//16+1}.png')
summary = {
    'documents': len(manifest), 'pdfs': sum(d['path'].endswith('.pdf') for d in manifest),
    'rendered_pages_and_images': len(tiles), 'hashes_sizes_page_counts': 'passed',
    'severe_scan_hidden_text': 'none', 'gemini_calls': 0,
    'note': 'Binary and rendering checks only; visual review is separate. Not model accuracy.'
}
(qa/'binary-checks.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps(summary, indent=2))
