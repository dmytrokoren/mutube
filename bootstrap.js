// This prefix is inserted before YouTube's own script. Keep it ES5 and defer
// TizenTube so it cannot run before, or throw through, YouTube's bootstrap.
;(function () {
    if (document.mutube) return;
    document.mutube = true;
    var status = window.__mutubeStatus = { state: 'scheduled', attempts: 0 };
    function report(message) {
        if (window.console && window.console.error) window.console.error(message);
    }
    try {
        /* MUTUBE_COMPAT */
    } catch (error) {
        report('MUTUBE: compatibility initialization failed: ' + String(error));
    }
    function start() {
        // Match the original asynchronous CDN loader's ordering. The native
        // script and its _yttv namespace must exist before TizenTube starts.
        if (!window._yttv || !document.head || !document.body) {
            status.state = 'waiting-for-youtube';
            if (++status.attempts < 600) {
                setTimeout(start, 25);
            } else {
                status.state = 'timed-out';
                report('MUTUBE: YouTube bootstrap was not ready; userscript skipped');
            }
            return;
        }
        status.state = 'initializing';
        try {
            /* MUTUBE_BUNDLE */
            status.state = 'initialized';
        } catch (error) {
            status.state = 'failed';
            status.error = String(error && (error.stack || error.message) || error);
            report('MUTUBE: userscript initialization failed: ' + status.error);
        }
    }
    setTimeout(start, 0);
})();
;
