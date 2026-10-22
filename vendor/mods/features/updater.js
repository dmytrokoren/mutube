// Manual upstream TizenTube Cobalt release checks. tvOS cannot install APKs.
import { showToast } from '../ui/ytUI.js';
import { cobaltVersion, cobaltReleaseUrl } from '../cobaltRelease.js';
let pending = false;
function result(title, message) {
    showToast(title, message);
}
export default function checkForUpdates() {
    if (pending) return;
    pending = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => { controller?.abort(); }, 15000);
    return Promise.race([
        fetch(cobaltReleaseUrl,
            {cache: 'no-store', ...(controller ? {signal: controller.signal} : {})})
            .then(response => { if (!response.ok) throw Error('HTTP ' + response.status); return response.json(); }),
        new Promise((resolve, reject) => setTimeout(() => reject(Error('Request timed out')), 15000))
    ]).then(release => {
        const latest = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
        if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(latest)) throw Error('Invalid version response');
        const newer = latest.split('.').map(Number).some((part, i, all) =>
            part > Number(cobaltVersion.split('.')[i]) && all.slice(0, i).every((n, j) => n === Number(cobaltVersion.split('.')[j])));
        if (newer) {
            result('TizenTube Cobalt update available',
                'Version ' + latest + ' is available upstream. This check does not install the Android app on tvOS.');
        } else {
            result('TizenTube is up to date',
                'You are using the latest version (' + cobaltVersion + ') of TizenTube Cobalt.');
        }
    }).catch(error => result('Unable to check for updates', error.message))
      .finally(() => { clearTimeout(timeout); pending = false; });
}
