import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { ARCHIVE_LIMITS, ArchiveError, importArchive, planExtraction, writeArchive, type ArchiveEntryInfo } from './archive';

const f = (fileName: string, uncompressedSize = 10, mode = 0o100644): ArchiveEntryInfo => ({ fileName, uncompressedSize, mode });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ArchiveError ? e.code : String(e);
  }
  return 'ok';
};

describe('planExtraction', () => {
  it('reads the campaign/ + library/ layout; library files are flat', () => {
    const p = planExtraction([f('campaign/campaign.dm.json'), f('campaign/scenes/a.scene.json'), f('library/krypta.webp'), f('library/krypta.webp.dm.json'), f('library/deep/x.png'), f('.DS_Store')]);
    expect([...p.campaign.values()]).toEqual(['campaign.dm.json', 'scenes/a.scene.json']);
    expect([...p.library.values()]).toEqual(['krypta.webp', 'krypta.webp.dm.json']);
  });

  it('reads older archives (campaign at the top or in one folder) as campaign-only', () => {
    expect([...planExtraction([f('campaign.dm.json'), f('maps/a.webp')]).campaign.values()]).toEqual(['campaign.dm.json', 'maps/a.webp']);
    const nested = planExtraction([f('Ashes/campaign.dm.json'), f('Ashes/notes.md')]);
    expect([...nested.campaign.values()]).toEqual(['campaign.dm.json', 'notes.md']);
    expect(nested.library.size).toBe(0);
  });

  it('refuses archives without a campaign, unsafe paths, links, and oversize archives', () => {
    expect(code(() => planExtraction([f('notes.md')]))).toBe('notCampaign');
    expect(code(() => planExtraction([f('A/campaign.dm.json'), f('B/x.md')]))).toBe('notCampaign');
    for (const bad of ['../evil.sh', 'campaign/../../evil', '/etc/passwd', 'C:\\Windows\\x', 'library\\..\\..\\x']) {
      expect(code(() => planExtraction([f('campaign/campaign.dm.json'), f(bad)]))).toBe('unsafe');
    }
    expect(code(() => planExtraction([f('campaign/campaign.dm.json'), f('campaign/link', 10, 0o120777)]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign/campaign.dm.json'), f('library/big.mp4', ARCHIVE_LIMITS.maxBytes)]))).toBe('tooLarge');
    expect(code(() => planExtraction(Array.from({ length: ARCHIVE_LIMITS.maxEntries + 1 }, (_, i) => f(`x/${i}`))))).toBe('tooLarge');
  });
});

describe('writeArchive / importArchive', () => {
  let dir: string;
  let root: string;
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dc-archive-'));
    root = path.join(dir, 'root');
    await fs.promises.mkdir(path.join(root, 'library'), { recursive: true });
    await fs.promises.mkdir(path.join(root, 'campaigns'), { recursive: true });
  });
  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  const write = (rel: string, content: string | Buffer) => {
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const read = (rel: string) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');

  function campaign(): void {
    write('campaigns/ashes/campaign.dm.json', JSON.stringify({ kind: 'campaign', name: 'Ashes of Vhal' }));
    write('campaigns/ashes/scenes/crypt.scene.json', JSON.stringify({ kind: 'scene', mapSidecar: 'library/crypt.webp.dm.json', ambience: [{ path: 'library/wind.ogg', volume: 1 }] }));
    write('campaigns/ashes/.DS_Store', 'junk');
    write('library/crypt.webp', Buffer.alloc(3000, 1));
    write('library/crypt.webp.dm.json', JSON.stringify({ kind: 'map', grid: 'mine' }));
    write('library/wind.ogg', Buffer.alloc(100, 2));
  }

  it('exports with library files and imports into another root: same content is not copied twice', async () => {
    campaign();
    const zip = path.join(dir, 'ashes.zip');
    expect(await writeArchive(path.join(root, 'campaigns/ashes'), path.join(root, 'library'), ['crypt.webp', 'wind.ogg'], zip)).toBe(5);
    // Into the same root: the campaign gets a free folder name, the library files are reused.
    const r = await importArchive(zip, root);
    expect(r.slug).toBe('ashes-of-vhal');
    expect(r.library).toEqual({ added: 0, reused: 2, renamed: 0, kept: 0 });
    expect(JSON.parse(read('campaigns/ashes-of-vhal/scenes/crypt.scene.json')).mapSidecar).toBe('library/crypt.webp.dm.json');
    expect(fs.existsSync(path.join(root, 'campaigns/ashes-of-vhal/.DS_Store'))).toBe(false);
    // A second import of the same archive: another free folder name.
    expect((await importArchive(zip, root)).slug).toBe('ashes-of-vhal-2');
    expect(fs.readdirSync(root).filter((n) => n.startsWith('.import'))).toEqual([]);
  });

  it('a library file with the same name but other content is renamed and the campaign follows it', async () => {
    campaign();
    const zip = path.join(dir, 'ashes.zip');
    await writeArchive(path.join(root, 'campaigns/ashes'), path.join(root, 'library'), ['crypt.webp', 'wind.ogg'], zip);
    // Another library: its own, different crypt.webp.
    const other = path.join(dir, 'other');
    fs.mkdirSync(path.join(other, 'library'), { recursive: true });
    fs.writeFileSync(path.join(other, 'library/crypt.webp'), Buffer.alloc(10, 9));
    fs.writeFileSync(path.join(other, 'library/crypt.webp.dm.json'), '{"theirs":true}');
    const r = await importArchive(zip, other);
    expect(r.library).toEqual({ added: 1, reused: 0, renamed: 1, kept: 0 });
    expect(fs.readdirSync(path.join(other, 'library')).sort()).toEqual(['crypt-2.webp', 'crypt-2.webp.dm.json', 'crypt.webp', 'crypt.webp.dm.json', 'wind.ogg']);
    expect(fs.readFileSync(path.join(other, 'library/crypt.webp.dm.json'), 'utf8')).toBe('{"theirs":true}');
    const scene = JSON.parse(fs.readFileSync(path.join(other, 'campaigns', r.slug, 'scenes/crypt.scene.json'), 'utf8'));
    expect(scene.mapSidecar).toBe('library/crypt-2.webp.dm.json');
    expect(scene.ambience[0].path).toBe('library/wind.ogg');
  });

  it('map copies (E-32) come along: a renamed picture is followed inside the copy, a different copy of that name is renamed', async () => {
    campaign();
    write('library/crypt-cellar.map.json', JSON.stringify({ kind: 'map', name: 'Cellar', resource: 'library/crypt.webp' }));
    write('campaigns/ashes/scenes/cellar.scene.json', JSON.stringify({ kind: 'scene', mapSidecar: 'library/crypt-cellar.map.json' }));
    const zip = path.join(dir, 'ashes.zip');
    await writeArchive(path.join(root, 'campaigns/ashes'), path.join(root, 'library'), ['crypt.webp', 'wind.ogg', 'crypt-cellar.map.json'], zip);
    // Another library: a different crypt.webp and a different copy of the same name.
    const other = path.join(dir, 'other');
    fs.mkdirSync(path.join(other, 'library'), { recursive: true });
    fs.writeFileSync(path.join(other, 'library/crypt.webp'), Buffer.alloc(10, 9));
    fs.writeFileSync(path.join(other, 'library/crypt-cellar.map.json'), '{"theirs":true}');
    const r = await importArchive(zip, other);
    expect(r.library).toMatchObject({ renamed: 2 });
    const lib = (f: string) => fs.readFileSync(path.join(other, 'library', f), 'utf8');
    expect(lib('crypt-cellar.map.json')).toBe('{"theirs":true}');
    expect(JSON.parse(lib('crypt-cellar-2.map.json'))).toMatchObject({ name: 'Cellar', resource: 'library/crypt-2.webp' });
    const scene = JSON.parse(fs.readFileSync(path.join(other, 'campaigns', r.slug, 'scenes/cellar.scene.json'), 'utf8'));
    expect(scene.mapSidecar).toBe('library/crypt-cellar-2.map.json');
  });

  it('campaign-only export leaves the library out; older archives still import', async () => {
    campaign();
    const zip = path.join(dir, 'only.zip');
    expect(await writeArchive(path.join(root, 'campaigns/ashes'), path.join(root, 'library'), [], zip)).toBe(2);
    const legacy = path.join(dir, 'legacy.zip');
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(JSON.stringify({ kind: 'campaign', name: 'Old One' })), 'Old One/campaign.dm.json');
    z.end();
    await new Promise<void>((res) => z.outputStream.pipe(fs.createWriteStream(legacy)).on('close', () => res()));
    expect((await importArchive(legacy, root)).slug).toBe('old-one');
  });
});
