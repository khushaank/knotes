import { supabase, sanitize, toggleFollow, getFollowerCount, getCache, setCache } from './supabaseClient.js';

const AVATAR_COLORS = ['#fecaca', '#bfdbfe', '#bbf7d0', '#fef08a', '#e9d5ff', '#fbcfe8'];

function getAvatarColor(name) {
    return AVATAR_COLORS.at((name || '?').charCodeAt(0) % AVATAR_COLORS.length);
}

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

function createAvatarElement(user, size = 36) {
    const initial = (user.username || '?').charAt(0).toUpperCase();
    const bg = getAvatarColor(user.username);

    const wrapper = document.createElement('div');
    if (user.avatar_url) {
        wrapper.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:${bg}`;
        const img = document.createElement('img');
        img.src = user.avatar_url;
        img.alt = user.username || 'user';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        img.onerror = function () {
            this.parentElement.textContent = initial;
            this.parentElement.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${Math.round(size * 0.44)}px;color:#555;text-transform:uppercase;flex-shrink:0`;
        };
        wrapper.appendChild(img);
    } else {
        wrapper.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${Math.round(size * 0.44)}px;color:#555;text-transform:uppercase;flex-shrink:0`;
        wrapper.textContent = initial;
    }
    return wrapper;
}

function profileHref(username) {
    return `profile.html?user=${encodeURIComponent(username || '')}`;
}

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : (callback) => callback())(async () => {
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
        const errDiv = document.createElement('div');
        errDiv.className = 'p-6 text-center text-gray-500 text-sm';
        errDiv.textContent = 'Could not load leaderboard. Please try again later.';
        container.replaceChildren(errDiv);
    }

    setupSearch();

    // LEADERBOARD RENDERING

    function renderLeaders(leaders) {
        const fragment = document.createDocumentFragment();
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

            const row = document.createElement('div');
            row.className = 'leader-row';

            const rankSpan = document.createElement('span');
            rankSpan.className = `leader-rank ${rankClass}`;
            rankSpan.textContent = `${rank}.`;
            row.appendChild(rankSpan);

            row.appendChild(createAvatarElement(user, 36));

            const infoDiv = document.createElement('div');
            infoDiv.className = 'leader-info';
            const nameLink = document.createElement('a');
            nameLink.href = profileHref(user.username);
            nameLink.className = 'leader-name block';
            nameLink.textContent = user.username || 'anonymous';
            infoDiv.appendChild(nameLink);
            row.appendChild(infoDiv);

            const flexDiv = document.createElement('div');
            flexDiv.className = 'flex items-center gap-3';

            const karmaDiv = document.createElement('div');
            karmaDiv.className = 'leader-karma';
            const countSpan = document.createElement('span');
            countSpan.className = 'karma-count';
            countSpan.textContent = user.followers;
            karmaDiv.appendChild(countSpan);
            const labelSpan = document.createElement('span');
            labelSpan.className = 'leader-karma-label';
            labelSpan.textContent = 'karma';
            karmaDiv.appendChild(labelSpan);
            flexDiv.appendChild(karmaDiv);

            if (!isSelf) {
                const btn = document.createElement('button');
                btn.className = `boost-karma-btn ${btnClass} hover:text-[#ff6600] focus:outline-none`;
                btn.setAttribute('data-userid', user.id);
                btn.textContent = btnText;
                flexDiv.appendChild(btn);
            }

            row.appendChild(flexDiv);
            fragment.appendChild(row);
        });

        container.replaceChildren(fragment);

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
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'p-6 text-center text-gray-500 text-sm';
                emptyDiv.textContent = 'No users found yet. Be the first to join!';
                container.replaceChildren(emptyDiv);
            }
            return;
        }

        const { data: follows } = await supabase
            .from('follows')
            .select('following_id');

        const followCounts = new Map();
        if (follows) {
            follows.forEach(f => {
                const currentCount = followCounts.get(String(f.following_id)) || 0;
                followCounts.set(String(f.following_id), currentCount + 1);
            });
        }

        const results = profiles.map(p => ({
            ...p,
            followers: followCounts.get(String(p.id)) || 0
        }));

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
                dropdown.replaceChildren();
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
            if (input.value.trim().length >= 1 && dropdown.childElementCount > 0) {
                dropdown.classList.add('active');
            }
        });

        input.addEventListener('input', () => {
            updateClearBtn();
            const query = input.value.trim();

            if (debounceTimer) clearTimeout(debounceTimer);

            if (query.length === 0) {
                dropdown.classList.remove('active');
                dropdown.replaceChildren();
                return;
            }

            const searchLoadingDiv = document.createElement('div');
            searchLoadingDiv.className = 'search-loading';
            searchLoadingDiv.textContent = 'Searching...';
            dropdown.replaceChildren(searchLoadingDiv);
            dropdown.classList.add('active');

            debounceTimer = setTimeout(() => searchUsers(query), 300);
        });

        function applyHighlight(element, text, query) {
            if (!text) return;
            if (!query) {
                element.textContent = text;
                return;
            }
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            let i = 0;
            while (i < text.length) {
                const index = lowerText.indexOf(lowerQuery, i);
                if (index === -1) {
                    element.appendChild(document.createTextNode(text.substring(i)));
                    break;
                }
                if (index > i) {
                    element.appendChild(document.createTextNode(text.substring(i, index)));
                }
                const mark = document.createElement('strong');
                mark.style.color = '#ff6600';
                mark.textContent = text.substring(index, index + query.length);
                element.appendChild(mark);
                i = index + query.length;
            }
        }

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
                    const errDiv = document.createElement('div');
                    errDiv.className = 'search-no-results';
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined';
                    icon.textContent = 'error';
                    errDiv.appendChild(icon);
                    errDiv.appendChild(document.createTextNode(' Search failed. Try again.'));
                    dropdown.replaceChildren(errDiv);
                    return;
                }

                if (!users || users.length === 0) {
                    const noDiv = document.createElement('div');
                    noDiv.className = 'search-no-results';
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined';
                    icon.textContent = 'person_off';
                    noDiv.appendChild(icon);
                    noDiv.appendChild(document.createTextNode(` No people found for "${query}"`));
                    dropdown.replaceChildren(noDiv);
                    return;
                }

                const fragment = document.createDocumentFragment();
                const label = document.createElement('div');
                label.className = 'sr-section-label';
                label.textContent = 'People';
                fragment.appendChild(label);

                users.forEach(user => {
                    const isFollowed = myFollows.has(user.id);
                    const isSelf = myId === user.id;

                    const a = document.createElement('a');
                    a.href = profileHref(user.username);
                    a.className = 'search-result-item';

                    const avatar = createAvatarElement(user, 32);
                    avatar.classList.add('sr-avatar');
                    a.appendChild(avatar);

                    const info = document.createElement('div');
                    info.className = 'sr-info';
                    const nameDiv = document.createElement('div');
                    nameDiv.className = 'sr-name';
                    applyHighlight(nameDiv, user.username || 'anonymous', query);
                    info.appendChild(nameDiv);

                    const bioDiv = document.createElement('div');
                    bioDiv.className = 'sr-bio';
                    bioDiv.textContent = user.about || 'K. Notes member';
                    info.appendChild(bioDiv);

                    a.appendChild(info);

                    if (isSelf) {
                        const badge = document.createElement('span');
                        badge.style.cssText = 'font-size:10px;color:#aaa;flex-shrink:0';
                        badge.textContent = 'You';
                        a.appendChild(badge);
                    } else if (isFollowed) {
                        const badge = document.createElement('span');
                        badge.style.cssText = 'font-size:10px;color:#ff6600;flex-shrink:0;font-weight:600';
                        badge.textContent = 'Following';
                        a.appendChild(badge);
                    }

                    fragment.appendChild(a);
                });

                dropdown.replaceChildren(fragment);

            } catch (err) {
                if (err.name !== 'AbortError') {
                    const errDiv = document.createElement('div');
                    errDiv.className = 'search-no-results';
                    errDiv.textContent = 'Something went wrong.';
                    dropdown.replaceChildren(errDiv);
                }
            }
        }
    }
});
