import { supabase, sanitize, toggleFollow, getFollowerCount, getCache, setCache } from './supabaseClient.js';

const AVATAR_COLORS = ['#fecaca', '#bfdbfe', '#bbf7d0', '#fef08a', '#e9d5ff', '#fbcfe8'];

function getAvatarColor(name) {
    return AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length];
}

// Escape special PostgREST filter characters to prevent filter injection
function sanitizeSearchInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/\./g, '\\.')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/%/g, '\\%')
        .substring(0, 100); // Limit length
}

function avatarHtml(user, size = 36) {
    const initial = (user.username || '?').charAt(0).toUpperCase();
    const bg = getAvatarColor(user.username);
    if (user.avatar_url) {
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:${bg}">
            <img src="${user.avatar_url}" alt="${sanitize(user.username)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initial}'">
        </div>`;
    }
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${Math.round(size * 0.44)}px;color:#555;text-transform:uppercase;flex-shrink:0">${initial}</div>`;
}

function avatarInner(user) {
    const initial = (user.username || '?').charAt(0).toUpperCase();
    if (user.avatar_url) {
        return `<img src="${user.avatar_url}" alt="${sanitize(user.username)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initial}'">`;
    }
    return initial;
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())( async () => {
    const container = document.getElementById('leaderboard-container');
    const loadingSkeleton = document.getElementById('leaderboard-loading');
    const mainContent = document.getElementById('leaderboard-main-content');

    if (!container || !supabase) return;

    let myId = null;
    let myFollows = new Set();

    try {
        const { data: { session } } = await supabase.auth.getSession();
        myId = session?.user?.id;

        if (myId) {
            const { data: follows } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', myId);
            if (follows) follows.forEach(f => myFollows.add(f.following_id));
        }
    } catch (err) {
    }

    try {
        await loadLeaderboard();
    } catch (err) {
        if (loadingSkeleton) loadingSkeleton.style.display = 'none';
        if (mainContent) mainContent.classList.add('ready');
        container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">Could not load leaderboard. Please try again later.</div>';
    }

    setupSearch();

    // LEADERBOARD RENDERING

    function renderLeaders(leaders) {
        let html = '';
        leaders.forEach((user, index) => {
            const rank = index + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';

            const isFollowed = myFollows.has(user.id);
            const isSelf = myId === user.id;

            const btnText = isFollowed ? '[unfollow]' : '[follow]';
            const btnClass = isFollowed ? 'text-[#ff6600]' : 'text-gray-500';

            const boostBtnHtml = isSelf ? '' : `
                <button class="boost-karma-btn ${btnClass} hover:text-[#ff6600] focus:outline-none"
                        data-userid="${user.id}">${btnText}</button>
            `;

            html += `
                <div class="leader-row">
                    <span class="leader-rank ${rankClass}">${rank}.</span>
                    ${avatarHtml(user, 36)}
                    <div class="leader-info">
                        <a href="@${encodeURIComponent(user.username)}" class="leader-name block">${sanitize(user.username)}</a>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="leader-karma">
                            <span class="karma-count">${user.followers}</span>
                            <span class="leader-karma-label">karma</span>
                        </div>
                        ${boostBtnHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        if (loadingSkeleton) loadingSkeleton.style.display = 'none';
        if (mainContent) mainContent.classList.add('ready');
        container.querySelectorAll('.boost-karma-btn').forEach(btn => {
            btn.addEventListener('click', handleKarmaClick);
        });
    }

    async function loadLeaderboard() {
        const cacheKey = 'leaderboard_data';
        const cached = getCache(cacheKey);

        if (cached) {
            renderLeaders(cached.data);
            if (!cached.stale) return; // if fresh, stop. If stale, fetch in background.
        }

        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, created_at')
            .eq('is_public', true);

        if (error || !profiles || profiles.length === 0) {
            if (!cached) {
                if (loadingSkeleton) loadingSkeleton.style.display = 'none';
                if (mainContent) mainContent.classList.add('ready');
                container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No users found yet. Be the first to join!</div>';
            }
            return;
        }

        const results = [];
        for (const p of profiles) {
            const count = await getFollowerCount(p.id);
            results.push({ ...p, followers: count });
        }

        results.sort((a, b) => b.followers - a.followers);
        const leaders = results.slice(0, 20);

        setCache(cacheKey, leaders, 1000 * 60 * 5); // Cache for 5 mins
        renderLeaders(leaders);
    }

    async function handleKarmaClick(e) {
        const btn = e.currentTarget;
        if (!myId) {
            alert('Please login to follow users.');
            window.location.href = 'login.html';
            return;
        }

        const userId = btn.getAttribute('data-userid');
        btn.disabled = true;
        btn.style.opacity = '0.5';

        try {
            const result = await toggleFollow(userId);
            if (result.error) {
                alert(result.error);
            } else {
                const karmaEl = btn.closest('.leader-row').querySelector('.karma-count');
                let currentKarma = parseInt(karmaEl.textContent);

                if (result.action === 'followed') {
                    myFollows.add(userId);
                    karmaEl.textContent = currentKarma + 1;
                    btn.classList.remove('text-gray-500');
                    btn.classList.add('text-[#ff6600]');
                    btn.textContent = '[unfollow]';
                } else {
                    myFollows.delete(userId);
                    karmaEl.textContent = Math.max(0, currentKarma - 1);
                    btn.classList.remove('text-[#ff6600]');
                    btn.classList.add('text-gray-500');
                    btn.textContent = '[follow]';
                }
            }
        } catch (err) {
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    function setupSearch() {
        const input = document.getElementById('user-search-input');
        const dropdown = document.getElementById('search-results-dropdown');
        const clearBtn = document.getElementById('search-clear-btn');

        if (!input || !dropdown) return;

        let debounceTimer = null;
        let abortController = null;

        function updateClearBtn() {
            if (clearBtn) {
                clearBtn.style.display = input.value.trim() ? 'block' : 'none';
            }
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                dropdown.classList.remove('active');
                dropdown.innerHTML = '';
                updateClearBtn();
                input.focus();
            });
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) {
                dropdown.classList.remove('active');
            }
        });

        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 1 && dropdown.innerHTML) {
                dropdown.classList.add('active');
            }
        });

        input.addEventListener('input', () => {
            updateClearBtn();
            const query = input.value.trim();

            if (debounceTimer) clearTimeout(debounceTimer);

            if (query.length === 0) {
                dropdown.classList.remove('active');
                dropdown.innerHTML = '';
                return;
            }

            dropdown.innerHTML = '<div class="search-loading">Searching...</div>';
            dropdown.classList.add('active');

            debounceTimer = setTimeout(() => searchUsers(query), 300);
        });

        async function searchUsers(query) {
            if (abortController) abortController.abort();
            abortController = new AbortController();

            try {
                const safeQuery = sanitizeSearchInput(query);
                const { data: users, error } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, about')
                    .ilike('username', `%${safeQuery}%`)
                    .limit(10);

                if (input.value.trim() !== query) return;

                if (error) {
                    dropdown.innerHTML = '<div class="search-no-results"><span class="material-symbols-outlined">error</span>Search failed. Try again.</div>';
                    return;
                }

                if (!users || users.length === 0) {
                    dropdown.innerHTML = `
                        <div class="search-no-results">
                            <span class="material-symbols-outlined">person_off</span>
                            No people found for "${sanitize(query)}"
                        </div>`;
                    return;
                }

                let html = '<div class="sr-section-label">People</div>';

                users.forEach(user => {
                    const isFollowed = myFollows.has(user.id);
                    const isSelf = myId === user.id;

                    let badge = '';
                    if (isSelf) {
                        badge = '<span style="font-size:10px;color:#aaa;flex-shrink:0">You</span>';
                    } else if (isFollowed) {
                        badge = '<span style="font-size:10px;color:#ff6600;flex-shrink:0;font-weight:600">Following</span>';
                    }

                    const bio = user.about ? sanitize(user.about) : 'K. Notes member';

                    const avatarBg = getAvatarColor(user.username);
                    html += `
                        <a href="@${encodeURIComponent(user.username)}" class="search-result-item">
                            <div class="sr-avatar" style="background:${avatarBg}">${avatarInner(user)}</div>
                            <div class="sr-info">
                                <div class="sr-name">${highlightMatch(sanitize(user.username), query)}</div>
                                <div class="sr-bio">${bio}</div>
                            </div>
                            ${badge}
                        </a>
                    `;
                });

                dropdown.innerHTML = html;

            } catch (err) {
                if (err.name !== 'AbortError') {
                    dropdown.innerHTML = '<div class="search-no-results">Something went wrong.</div>';
                }
            }
        }

        function highlightMatch(text, query) {
            if (!query) return text;
            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return text.replace(regex, '<strong style="color:#ff6600">$1</strong>');
        }
    }
});
