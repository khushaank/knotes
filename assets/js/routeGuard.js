import { supabase } from './supabaseClient.js';

let membershipStatePromise;

function clearPrivateCache() {
    sessionStorage.removeItem('kn-auth-cache');
    Object.keys(localStorage)
        .filter(key => key.startsWith('kn-cache-'))
        .forEach(key => localStorage.removeItem(key));
}

export function safeReturnPath(value = window.location.pathname + window.location.search) {
    try {
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin && url.pathname.startsWith('/')
            ? url.pathname + url.search
            : '/home';
    } catch {
        return '/home';
    }
}

export function getMembershipState() {
    if (!membershipStatePromise) {
        membershipStatePromise = (async () => {
            if (!supabase) return 'unavailable';
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return 'anonymous';

            const { data: approved, error: membershipError } = await supabase.rpc('is_approved_member');
            if (membershipError) return 'unavailable';
            return approved === true ? 'approved' : 'restricted';
        })();
    }
    return membershipStatePromise;
}

export async function requireApprovedMember() {
    document.documentElement.style.visibility = 'hidden';
    const state = await getMembershipState();
    if (state === 'approved') {
        document.documentElement.style.visibility = '';
        return;
    }

    clearPrivateCache();
    if (state === 'restricted') await supabase?.auth.signOut();
    const returnTo = encodeURIComponent(safeReturnPath());
    const status = state === 'restricted' ? '&status=restricted' : '';
    window.location.replace(`/login?returnTo=${returnTo}${status}`);
    return new Promise(() => {});
}
