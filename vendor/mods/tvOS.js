// Read YouTube TV's active profile, not its guide shape. Verified against the
// native Kabuki client: CurrentIdentityService owns the active identity and
// tectonicConfig.clientData.clientTheme selects the KIDS interface.
function currentIdentity() {
    if (typeof window === 'undefined' || !window._yttv) return null;
    for (const value of Object.values(window._yttv)) {
        if (!value || !value.mappings || typeof value.mappings.get !== 'function' ||
            typeof value.get !== 'function') continue;
        try {
            // Check registration first: an absent optional service must not
            // instantiate or throw through YouTube's renderer pipeline.
            if (!value.mappings.get('CurrentIdentityService')) continue;
            const service = value.get('CurrentIdentityService');
            // The storage member's minified name changes between client builds.
            // Inspect only this service's own immediate data, never an account
            // list containing inactive child and adult identities.
            const identity = service && Object.values(service).find(item =>
                item && typeof item === 'object' && typeof item.identityType === 'string');
            if (identity) return identity;
        } catch (error) { /* Theme remains available before service readiness. */ }
    }
    return null;
}

export function isKids() {
    if (typeof window === 'undefined') return true;
    const identity = currentIdentity();
    if (identity && identity.identityType !== 'UNAUTHENTICATED_IDENTITY_TYPE_UNKNOWN') {
        const type = identity.identityType;
        if (type === 'PERSONA_CHILD' || type === 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST_KID' ||
            type === 'FULL_UNICORN' || type === 'UNICORN_LITE_PROFILE') return true;
        return false;
    }
    const config = window.ytcfg?.data_ || window.yt?.config_;
    const client = window.tectonicConfig?.clientData || config?.INNERTUBE_CONTEXT?.client;
    if (client) {
        const theme = client.clientTheme || client.theme;
        if (theme === 'KIDS') return true;
        if (theme && theme !== 'UNKNOWN_THEME') return false;
        const name = client.clientName;
        if (name === 'TVHTML5_KIDS' || name === 'TVHTML5_FOR_KIDS') return true;
    }
    // Unknown during startup/switching: hide the custom entry until the native
    // profile is available. Native Settings and the guide are never removed.
    return true;
}
