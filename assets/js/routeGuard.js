import { supabase } from './supabaseClient.js?v=2';

let membershipStatePromise;

function clearPrivateCache() {
    sessionStorage.removeItem('kn-auth-cache');
    Object.keys(localStorage)
        .filter(key => key.startsWith('kn-cache-'))
        .forEach(key => localStorage.removeItem(key));
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

export async function requireApprovedMember({ allowMfaEnrollment = false } = {}) {
    // `getSession` reads the locally stored, expiry-checked token. It lets a
    // returning member start immediately; RLS still protects every data query
    // while the trusted user + membership check finishes in the background.
    const { data: { session } = {} } = await supabase?.auth.getSession() || {};
    if (!session) {
        clearPrivateCache();
        window.location.replace('/');
        return new Promise(() => {});
    }

    document.documentElement.classList.add('access-ready');
    void getMembershipState().then(async state => {
        if (state === 'approved') return;
        if (state === 'restricted' && allowMfaEnrollment) return;
        clearPrivateCache();
        if (state === 'restricted') await supabase?.auth.signOut();
        window.location.replace('/');
    });
}
