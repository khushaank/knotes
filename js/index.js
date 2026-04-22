import { supabase, calculateTimeAgo } from './supabaseClient.js';

async function fetchStories() {
    if (!supabase) {
        console.warn('Supabase is not configured yet. Returning dummy data.');
        return generateDummyStories();
    }

    const { data: stories, error } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
    
    if (error) {
        console.error('Error fetching stories:', error);
        return generateDummyStories();
    }
    return stories;
}

function generateDummyStories() {
    const titles = [
        "Show HN: I built a minimalist design system", "Why functional programming matters",
        "Ask HN: What's your favorite retro web tool?", "A deep dive into Tailwind CSS compilation",
        "The decline of heavy shadows in modern UI", "Building text-centric interfaces",
        "Show HN: A new semantic parsing engine", "How we reduced load times by 90%"
    ];
    const domains = ["example.com", "github.com", "news.io", "blog.dev", "tech.co"];
    const dummy = [];
    for(let i = 0; i < 30; i++) {
        dummy.push({
            id: i + 1,
            title: titles[i % titles.length] + (i > 7 ? ` (Part ${i})` : ''),
            domain: domains[Math.floor(Math.random() * domains.length)],
            points: Math.floor(Math.random() * 500) + 10,
            author: `user${Math.floor(Math.random() * 99)}`,
            created_at: new Date(Date.now() - Math.random() * 100000000).toISOString(),
            comment_count: Math.floor(Math.random() * 200)
        });
    }
    return dummy;
}

async function renderStories() {
    const tbody = document.querySelector('main table tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading stories...</td></tr>';

    const stories = await fetchStories();
    
    if (!stories || stories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No stories found. Create some in your Supabase dashboard!</td></tr>';
        return;
    }

    let html = '';
    stories.forEach((story, index) => {
        const timeAgo = calculateTimeAgo(story.created_at);
        html += `
            <tr class="h-[22px]">
                <td class="text-right align-top w-5 pr-1 text-[#828282] font-meta-sm text-meta-sm">${index + 1}.</td>
                <td class="align-top w-3 pt-[3px]"><center><div class="hn-arrow" title="upvote"></div></center></td>
                <td class="font-title-md text-title-md text-black align-top">
                    <a href="${story.url || `viewer.html?id=${story.id}`}" class="text-black hover:underline">${story.title}</a>
                    ${story.domain ? `<span class="text-[#828282] font-meta-sm text-meta-sm hover:underline">(<a href="#">${story.domain}</a>)</span>` : ''}
                </td>
            </tr>
            <tr>
                <td colspan="2"></td>
                <td class="font-meta-sm text-meta-sm text-[#828282]">
                    ${story.points || 0} points by <a href="#" class="hover:underline">${story.author || 'anonymous'}</a> <a href="viewer.html?id=${story.id}" class="hover:underline">${timeAgo}</a> | <a href="#" class="hover:underline">hide</a> | <a href="viewer.html?id=${story.id}" class="hover:underline">${story.comment_count || 0} comments</a>
                </td>
            </tr>
            <tr class="h-[5px]"></tr>
        `;
    });
    
    html += `
        <tr class="h-[20px]">
            <td colspan="2"></td>
            <td class="font-title-md text-title-md text-black">
                <a class="hover:underline" href="#">More</a>
            </td>
        </tr>
    `;
    
    tbody.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', renderStories);
