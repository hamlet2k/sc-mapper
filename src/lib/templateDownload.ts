import { BUILTIN_PHOTO_RE, exportTemplates, imageSrc, resolveTemplateImage, type DeviceTemplate } from './templates';
import { templateFileName, templateSubmissionUrl } from './submitTemplate';

/** Resolve lazy art and embed site photos so downloaded copies remain portable. The feed keeps its site photo paths. */
async function templateWithPictures(t: DeviceTemplate): Promise<DeviceTemplate> {
  const resolved = await resolveTemplateImage(t);
  const embed = async (image: string | undefined) => {
    if (!image || !BUILTIN_PHOTO_RE.test(image)) return image;
    const response = await fetch(imageSrc(image));
    if (!response.ok) throw new Error(`Could not load template photo (${response.status})`);
    const blob = await response.blob();
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read template photo'));
      r.readAsDataURL(blob);
    });
  };
  return resolved.views?.length
    ? { ...resolved, views: await Promise.all(resolved.views.map(async (v) => ({ ...v, image: await embed(v.image) }))) }
    : { ...resolved, image: await embed(resolved.image) };
}

/** Both buttons download the same file. Reserve the issue tab during the click so async photo loading can't block the popup. */
export async function exportTemplateFile(t: DeviceTemplate, notify: (kind: 'ok' | 'err', text: string) => void, submit = false): Promise<void> {
  const issue = submit ? window.open('about:blank', '_blank') : null;
  if (issue) issue.opener = null;
  try {
    const file = exportTemplates([await templateWithPictures(t)]);
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = templateFileName(t);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (submit) {
      if (issue) issue.location.replace(templateSubmissionUrl(t, __APP_VERSION__));
      notify('ok', issue ? 'Template file downloaded. Drag it into the GitHub issue that just opened.' : 'Template file downloaded. Allow popups and click Submit to feed again to open the GitHub issue.');
    }
  } catch (e) {
    issue?.close();
    notify('err', `Template export failed: ${(e as Error).message}`);
  }
}
