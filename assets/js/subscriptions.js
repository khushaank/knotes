import { supabase, sanitize, getFollowingList, getFollowersList, toggleFollow, getCache, setCache } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('subs-loading');
    const contentEl = document.getElementById('subs-main-content');
    const containerEl = document.getElementById('subs-container');
    const authMsgEl = document.getElementById('subs-auth-msg');
    const followingCountEl = document.getElementById('following-count');
    const followersCountEl = document.getElementById('followers-count');
    const tabs = document.querySelectorAll('.subs-tab');

    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        loadingEl.style.display = 'none';
        authMsgEl.classList.remove('hidden');
        contentEl.classList.add('ready');
        return;
    }

    const userId = session.user.id;
    let currentTab = 'following';

    await refreshData();

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.getAttribute('data-tab');
            if (tabName === currentTab) return;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tabName;
            renderList();
        });
    });

    async function refreshData() {
        const cacheKey = `subs_${userId}`;
        const cached = getCache(cacheKey);

        if (cached) {
            window.followingData = cached.data.following;
            window.followersData = cached.data.followers;
            followingCountEl.textContent = cached.data.following.length;
            followersCountEl.textContent = cached.data.followers.length;
            loadingEl.style.display = 'none';
            contentEl.classList.add('ready');
            renderList();
            if (!cached.stale) return;
        } else {
            loadingEl.style.display = 'block';
            containerEl.innerHTML = '';
        }

        const [following, followers] = await Promise.all([
            getFollowingList(userId),
            getFollowersList(userId)
        ]);

        window.followingData = following;
        window.followersData = followers;

        setCache(cacheKey, { following, followers }, 1000 * 60 * 5); // 5 mins cache

        followingCountEl.textContent = following.length;
        followersCountEl.textContent = followers.length;

        loadingEl.style.display = 'none';
        contentEl.classList.add('ready');
        renderList();
    }

    function renderList() {
        const data = currentTab === 'following' ? window.followingData : window.followersData;

        if (!data || data.length === 0) {
            containerEl.innerHTML = `
                <div class="subs-empty">
                    <span class="material-symbols-outlined" style="font-size:48px;color:#ddd">${currentTab === 'following' ? 'person_add' : 'group'}</span>
                    <p class="text-gray-500 mt-4">${currentTab === 'following' ? "You aren't following anyone yet." : "You don't have any followers yet."}</p>
                    ${currentTab === 'following' ? '<a href="leaderboard.html" class="text-[#ff6600] font-bold hover:underline">Find people to follow →</a>' : ''}
                </div>
            `;
            return;
        }

        const colors = ['bg-red-50', 'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50'];
        const textColors = ['text-red-600', 'text-blue-600', 'text-green-600', 'text-yellow-600', 'text-purple-600', 'text-pink-600'];

        containerEl.innerHTML = data.map(person => {
            if (!person) return '';

            const charCode = (person.username || '?').charCodeAt(0);
            const colorIdx = charCode % colors.length;
            const bgClass = colors[colorIdx];
            const textClass = textColors[colorIdx];

            const avatarHtml = person.avatar_url
                ? `<img src="${person.avatar_url}" alt="${sanitize(person.username)}" class="w-full h-full object-cover">`
                : `<span class="${textClass}">${(person.username || '?').charAt(0).toUpperCase()}</span>`;

            const isFollowingUser = currentTab === 'following' || (window.followingData && window.followingData.some(f => f.id === person.id));

            return `
                <div class="sub-card hover:bg-gray-50 transition-colors">
                    <div class="sub-avatar ${person.avatar_url ? 'bg-gray-200' : bgClass}">
                        ${avatarHtml}
                    </div>
                    <div class="sub-info">
                        <a href="profile.html?user=${person.username}" class="sub-name hover:text-[#ff6600] transition-colors">${sanitize(person.username)}</a>
                        <div class="sub-bio" title="${sanitize(person.about || '')}">${sanitize(person.about || '')}</div>
                    </div>
                    ${currentTab === 'following' ? `
                        <button class="sub-unfollow-btn" data-id="${person.id}">Unfollow</button>
                    ` : `
                        <button class="sub-unfollow-btn ${isFollowingUser ? '' : 'follow-mode'}" data-id="${person.id}" style="${isFollowingUser ? '' : 'background:#ff6600;color:white;border-color:#ff6600'}">
                            ${isFollowingUser ? 'Following' : 'Follow'}
                        </button>
                    `}
                </div>
            `;
        }).join('');
        containerEl.querySelectorAll('.sub-unfollow-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetId = btn.getAttribute('data-id');
                btn.disabled = true;
                const originalText = btn.textContent;
                btn.textContent = '...';

                const result = await toggleFollow(targetId);

                if (result.error) {
                    alert(result.error);
                    btn.disabled = false;
                    btn.textContent = originalText;
                    return;
                }
                await refreshData();
            });
        });
    }
});
