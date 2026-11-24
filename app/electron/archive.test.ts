import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE_LIMITS, ArchiveError, archiveCampaignName, extractArchive, planExtraction, writeArchive, type ArchiveEntryInfo } from './archive';

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
  it('accepts a campaign at the top or inside one folder; skips OS junk and directories', () => {
    const top = planExtraction([f('campaign.dm.json'), f('maps/'), f('maps/a.webp'), f('.DS_Store'), f('__MACOSX/._a')]);
    expect(top.prefix).toBe('');
    expect([...top.files.values()]).toEqual(['campaign.dm.json', 'maps/a.webp']);
    const nested = planExtraction([f('Ashes/'), f('Ashes/campaign.dm.json'), f('Ashes/maps/a.webp')]);
    expect(nested.prefix).toBe('Ashes/');
    expect([...nested.files.values()]).toEqual(['campaign.dm.json', 'maps/a.webp']);
  });

  it('refuses archives without a campaign', () => {
    expect(code(() => planExtraction([f('notes.md')]))).toBe('notCampaign');
    expect(code(() => planExtraction([f('A/campaign.dm.json'), f('B/x.md')]))).toBe('notCampaign');
  });

  it('refuses paths that leave the target, and symbolic links', () => {
    expect(code(() => planExtraction([f('campaign.dm.json'), f('../evil.sh')]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign.dm.json'), f('maps/../../evil')]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign.dm.json'), f('/etc/passwd')]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign.dm.json'), f('C:\\Windows\\x')]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign.dm.json'), f('maps\\..\\..\\x')]))).toBe('unsafe');
    expect(code(() => planExtraction([f('campaign.dm.json'), f('link', 10, 0o120777)]))).toBe('unsafe');
  });

  it('refuses archives that are too large or have too many entries', () => {
    expect(code(() => planExtraction([f('campaign.dm.json'), f('big.mp4', ARCHIVE_LIMITS.maxBytes)]))).toBe('tooLarge');
    const many = Array.from({ length: ARCHIVE_LIMITS.maxEntries + 1 }, (_, i) => f(`x/${i}`));
    expect(code(() => planExtraction(many))).toBe('tooLarge');
  });
});

describe('writeArchive / extractArchive', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dc-archive-'));
  });
  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  async function campaign(): Promise<string> {
    const root = path.join(dir, 'Ashes of Vhal');
    await fs.promises.mkdir(path.join(root, 'maps'), { recursive: true });
    await fs.promises.writeFile(path.join(root, 'campaign.dm.json'), JSON.stringify({ kind: 'campaign', name: 'Ashes of Vhal' }));
    await fs.promises.writeFile(path.join(root, 'maps', 'crypt.webp'), Buffer.alloc(5000, 7));
    await fs.promises.writeFile(path.join(root, 'notes.md'), '# Notes\n');
    await fs.promises.writeFile(path.join(root, '.DS_Store'), 'junk');
    return root;
  }

  it('round-trips a campaign folder (hidden files stay out)', async () => {
    const root = await campaign();
    const zip = path.join(dir, 'ashes.zip');
    expect(await writeArchive(root, zip, 'Ashes of Vhal')).toBe(3);
    expect(await archiveCampaignName(zip)).toBe('Ashes of Vhal');
    const target = path.join(dir, 'imported');
    await extractArchive(zip, target);
    expect((await fs.promises.readdir(target)).sort()).toEqual(['campaign.dm.json', 'maps', 'notes.md']);
    expect(await fs.promises.readFile(path.join(target, 'maps', 'crypt.webp'))).toEqual(Buffer.alloc(5000, 7));
    expect(fs.existsSync(`${zip}.part`)).toBe(false);
  });

  it('never extracts into a folder that has files', async () => {
    const root = await campaign();
    const zip = path.join(dir, 'ashes.zip');
    await writeArchive(root, zip, 'Ashes');
    await expect(extractArchive(zip, root)).rejects.toMatchObject({ code: 'targetNotEmpty' });
  });
});
