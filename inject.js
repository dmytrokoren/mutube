// Add TizenTube script to the page. Don't inject more than once.
//
// Restore 4k support by hooking window.MediaSource.isTypeSupported to remove the height/width parameters.
// I am not actually sure why this works since isTypeSupported still returns false for VP09 codecs.
// YouTube does detect spoofing by checking nonsensical values for height/width so maybe that affects something?
// HDR still does not work, but at least 4k works now.
//
(function () {
// The patcher wraps the complete bundle in the one-time injection guard.

// Cobalt goes straight from readyState "loading" to "complete" without ever firing
// DOMContentLoaded. TizenTube is injected while still "loading", so its modules that
// wait for that event (player buttons incl. Speed Controls, extra subtitles) never
// start. Fire it ourselves at load if Cobalt didn't. Dispatched on document and
// window separately (non-bubbling) so listeners on either get it exactly once.
var dclFired = false;
document.addEventListener('DOMContentLoaded', function () { dclFired = true; });
window.addEventListener('load', function () {
  if (dclFired) return;
  document.dispatchEvent(new Event('DOMContentLoaded'));
  window.dispatchEvent(new Event('DOMContentLoaded'));
});

const originalIsTypeSupported = window.MediaSource.isTypeSupported.bind(window.MediaSource);

window.MediaSource.isTypeSupported = function(mimeType) {
  const parts = mimeType
    .split(';')
    .map(part => part.trim())
    .filter(part => part);

  const filtered = parts.filter(part => {
    return !(part.startsWith('width=') || part.startsWith('height='));
  });

  const cleaned = filtered.join('; ');
  return originalIsTypeSupported(cleaned);
};
})();
