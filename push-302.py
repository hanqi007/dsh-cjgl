"""把 dsh-cjgl 3.0.2（含 dist 包）推到 GitHub；github.com 不通时走 API。

用法：
    $env:GITHUB_TOKEN = '<token>'
    python push-302.py
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

OWNER = 'hanqi007'
REPO = 'dsh-cjgl'
BRANCH = 'main'
WORK = r'D:\xm\deepseek\dsh-cjgl'
API = 'https://api.github.com'
MESSAGE = 'dsh-cjgl 3.0.2: fix default-boot button binding and enable being auto-disabled'

SKIP_DIRS = {'.git', '.tools', 'node_modules', '.shots', '.edge'}
SKIP_FILES = {'.gitignore'}

TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
if not TOKEN:
    sys.exit('GITHUB_TOKEN is empty')


def call(method, path, payload=None):
    url = API + path
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + TOKEN)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    req.add_header('User-Agent', 'dsh-cjgl-push')
    if data:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        return json.loads(body) if body else {}


def collect():
    out = []
    for root, dirs, files in os.walk(WORK):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith('.tmp') or name.endswith('.bak'):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, WORK).replace(os.sep, '/')
            if rel in SKIP_FILES:
                continue
            out.append((rel, full))
    return sorted(out)


def main():
    files = collect()
    print('files:', len(files))
    ref = call('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
    parent = ref['object']['sha']
    base_tree = call('GET', f'/repos/{OWNER}/{REPO}/git/commits/{parent}')['tree']['sha']
    print('parent:', parent[:10])

    tree = []
    for rel, full in files:
        raw = open(full, 'rb').read()
        blob = call('POST', f'/repos/{OWNER}/{REPO}/git/blobs', {
            'content': base64.b64encode(raw).decode('ascii'),
            'encoding': 'base64',
        })
        tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        print('  blob', rel, len(raw), 'B')

    new_tree = call('POST', f'/repos/{OWNER}/{REPO}/git/trees', {'base_tree': base_tree, 'tree': tree})
    new_commit = call('POST', f'/repos/{OWNER}/{REPO}/git/commits', {
        'message': MESSAGE, 'tree': new_tree['sha'], 'parents': [parent],
    })
    call('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {
        'sha': new_commit['sha'], 'force': False,
    })
    print('PUSHED -> https://github.com/%s/%s/commit/%s' % (OWNER, REPO, new_commit['sha']))


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, e.read().decode('utf-8', 'replace')[:600])
        sys.exit(1)
