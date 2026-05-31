import { supabase, sanitize, getFollowingList, getFollowersList, toggleFollow, getCache, setCache } from './supabaseClient.js';

function profileHref(username) {
    return `profile.html?user=${encodeURIComponent(username || '')}`;
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(async () => {
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
            containerEl.replaceChildren();
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
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'subs-empty';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined';
            iconSpan.style.cssText = 'font-size:48px;color:#ddd';
            iconSpan.textContent = currentTab === 'following' ? 'person_add' : 'group';
            emptyDiv.appendChild(iconSpan);

            const pMsg = document.createElement('p');
            pMsg.className = 'text-gray-500 mt-4';
            pMsg.textContent = currentTab === 'following' ? "You aren't following anyone yet." : "You don't have any followers yet.";
            emptyDiv.appendChild(pMsg);

            if (currentTab === 'following') {
                const link = document.createElement('a');
                link.href = 'leaderboard.html';
                link.className = 'text-[#ff6600] font-bold hover:underline';
                link.textContent = 'Find people to follow →';
                emptyDiv.appendChild(link);
            }

            containerEl.replaceChildren(emptyDiv);
            return;
        }

        const colors = ['bg-red-50', 'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50'];
        const textColors = ['text-red-600', 'text-blue-600', 'text-green-600', 'text-yellow-600', 'text-purple-600', 'text-pink-600'];

        const fragment = document.createDocumentFragment();

        data.forEach(person => {
            if (!person) return;

            const charCode = (person.username || '?').charCodeAt(0);
            const colorIdx = charCode % colors.length;
            const bgClass = colors[colorIdx];
            const textClass = textColors[colorIdx];

            const card = document.createElement('div');
            card.className = 'sub-card hover:bg-gray-50 transition-colors';

            const avatarDiv = document.createElement('div');
            avatarDiv.className = `sub-avatar ${person.avatar_url ? 'bg-gray-200' : bgClass}`;

            if (person.avatar_url) {
                const img = document.createElement('img');
                img.src = person.avatar_url;
                img.alt = person.username || 'user';
                img.className = 'w-full h-full object-cover';
                avatarDiv.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = textClass;
                span.textContent = (person.username || '?').charAt(0).toUpperCase();
                avatarDiv.appendChild(span);
            }
            card.appendChild(avatarDiv);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'sub-info';

            const nameLink = document.createElement('a');
            nameLink.href = profileHref(person.username);
            nameLink.className = 'sub-name hover:text-[#ff6600] transition-colors';
            nameLink.textContent = person.username || 'anonymous';
            infoDiv.appendChild(nameLink);

            const bioDiv = document.createElement('div');
            bioDiv.className = 'sub-bio';
            bioDiv.title = person.about || '';
            bioDiv.textContent = person.about || '';
            infoDiv.appendChild(bioDiv);

            card.appendChild(infoDiv);

            const isFollowingUser = currentTab === 'following' || (window.followingData && window.followingData.some(f => f.id === person.id));

            const btn = document.createElement('button');
            btn.className = `sub-unfollow-btn ${currentTab === 'following' || isFollowingUser ? '' : 'follow-mode'}`;
            btn.setAttribute('data-id', person.id);
            if (currentTab !== 'following' && !isFollowingUser) {
                btn.style.cssText = 'background:#ff6600;color:white;border-color:#ff6600';
                btn.textContent = 'Follow';
            } else if (currentTab !== 'following') {
                btn.textContent = 'Following';
            } else {
                btn.textContent = 'Unfollow';
            }

            card.appendChild(btn);
            fragment.appendChild(card);
        });

        containerEl.replaceChildren(fragment);

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
