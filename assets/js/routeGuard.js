import { supabase } from './supabaseClient.js';

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

export async function redirectApprovedMember() {
    if (await getMembershipState() === 'approved') {
        window.location.replace('/home');
        return new Promise(() => {});
    }
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
    window.location.replace('/');
    return new Promise(() => {});
}
