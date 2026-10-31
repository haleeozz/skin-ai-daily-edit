"""Data pipeline only. Default is offline; network refresh is explicit."""
from pathlib import Path
import argparse,subprocess,sys
root=Path(__file__).resolve().parent
project=root.parent
parser=argparse.ArgumentParser()
parser.add_argument('--refresh',action='store_true',help='Revalidate official sources older than seven days.')
parser.add_argument('--force',action='store_true',help='Refresh fresh sources too, still honoring blocked-source cooldowns.')
parser.add_argument('--discover',action='store_true',help='Discover new product links in the category cache.')
args=parser.parse_args()
if args.force and not args.refresh:parser.error('--force requires --refresh')
def run(*cmd):subprocess.run(cmd,cwd=project,check=True)
if not (root/'fetch-manifest.json').exists():
    run('node','--import','tsx','data-research/collect.mts')
if not (root/'expanded-manifest.json').exists() or args.discover:
    run('node','--import','tsx','data-research/expand.mts')
if args.refresh:
    command=['node','--import','tsx','data-research/refresh.mts']
    if args.force:command.append('--force')
    run(*command)
run(sys.executable,'-X','utf8','data-research/build_dataset.py')
run(sys.executable,'-X','utf8','data-research/validate_dataset.py')
run(sys.executable,'-X','utf8','data-research/release_catalog.py')
