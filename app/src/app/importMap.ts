/** Imports an image or video map chosen by the user. */
import { setMapImage } from './store';

const IMAGE = /\.(png|jpe?g|webp)$/i;
const VIDEO = /\.(mp4|webm)$/i;

export function mapKind(name: string): 'image' | 'video' | null {
  if (IMAGE.test(name)) return 'image';
  if (VIDEO.test(name)) return 'video';
  return null;
}

export async function importMapFile(file: File): Promise<void> {
  const kind = mapKind(file.name);
  if (!kind) return;
  // Object URLs stay inside the DM window. Phase 1 note: the table window
  // loads files via the asset protocol once campaign folders are implemented.
  const url = URL.createObjectURL(file);
  if (kind === 'video') {
    const v = document.createElement('video');
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('video'));
    });
    setMapImage(url, true, v.videoWidth, v.videoHeight, file.name);
  } else {
    const img = new Image();
    img.src = url;
    await img.decode();
    setMapImage(url, false, img.naturalWidth, img.naturalHeight, file.name);
  }
}
