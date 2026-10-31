from html.parser import HTMLParser
from pathlib import Path
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'svg'):
            self.skip += 1
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'br', 'section', 'button'):
            self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg') and self.skip:
            self.skip -= 1
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'section'):
            self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

root = Path(__file__).parent
for path in (root / 'raw').glob('*.html'):
    parser = Text()
    parser.feed(path.read_text(encoding='utf-8'))
    text = '\n'.join(line for raw in ''.join(parser.parts).splitlines() if (line := re.sub(r'\s+', ' ', raw).strip()))
    path.with_suffix('.txt').write_text(text, encoding='utf-8')
    if not path.stem.startswith('discovery'):
        matches = list(re.finditer(r'(?i)(all ingredients|inactive ingredients|ingredients:|purified water|aqua / water|aqua,)', text))
        print(path.stem, 'ingredient_sections', len(matches))
        if matches:
            start = matches[-1].start()
            print(text[start:start+1700])
