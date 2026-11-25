/**
 * Snapshot: a PNG of the tab exactly as it looks — page, measurements and
 * dock — for a review or a PR. Browsers can't screenshot a page from inside
 * it, so this asks to capture the current tab (the browser shows its own
 * prompt), grabs one frame and stops. The image goes to the clipboard and
 * downloads.
 */
export async function snapshot(name: string): Promise<'copied' | 'saved' | 'unsupported' | 'cancelled'> {
  const media = navigator.mediaDevices;
  if (!media?.getDisplayMedia) return 'unsupported';
  let stream: MediaStream;
  try {
    stream = await media.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: false,
      // Chrome: offer this tab first and allow capturing it.
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
  } catch {
    return 'cancelled';
  }
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Two frames in, the browser's own "sharing" flash has gone.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return 'cancelled';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `x-ray-${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      return 'saved';
    }
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
