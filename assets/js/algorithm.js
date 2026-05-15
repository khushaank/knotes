/**
 * algorithm.js
 * Centralized logic for sorting and filtering content across K. Notes.
 */

/**
 * Calculates a trending score based on Hacker News-style decay.
 * Formula: (Points + FreshnessBoost) / (Hours + 2)^1.5
 */
export function calculateTrendingScore(story) {
    const points = story.likes_count || 0;
    const clicks = story.clicks_count || 0;
    const baseScore = (points * 0.75) + (clicks * 0.25);
    const publishedAt = new Date(story.published_at);
    const updatedAt = story.updated_at ? new Date(story.updated_at) : publishedAt;
    const now = new Date();

    const hoursSincePublished = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
    const hoursSinceUpdated = Math.max(0, (now - updatedAt) / (1000 * 60 * 60));

    const freshnessBoost = hoursSinceUpdated < 24 ? (1 / (hoursSinceUpdated + 1)) : 0;

    const gravity = 1.8;
    const denominator = Math.pow(hoursSincePublished + 2, gravity);
    return denominator > 0 ? (baseScore + freshnessBoost) / denominator : 0;
}

/**
 * Calculates a relevance score for "Top" content.
 * Formula: Points + (Clicks * 0.5)
 */
export function calculateRelevanceScore(story) {
    const points = story.likes_count || 0;
    const clicks = story.clicks_count || 0;
    return points + (clicks * 0.5);
}

/**
 * Sorts a list of stories based on a filter type.
 * @param {Array} stories - List of story objects
 * @param {string} filter - 'trending', 'relevant', 'new', 'top'
 */
export function sortStories(stories, filter = 'trending') {
    if (!stories || !Array.isArray(stories)) return [];

    const storiesCopy = [...stories];

    switch (filter) {
        case 'new':
            return storiesCopy.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

        case 'relevant':
        case 'top':
            return storiesCopy.sort((a, b) => calculateRelevanceScore(b) - calculateRelevanceScore(a));

        case 'trending':
        default:
            return storiesCopy.sort((a, b) => calculateTrendingScore(b) - calculateTrendingScore(a));
    }
}

/**
 * Filters stories based on a search query.
 * @param {Array} stories - List of story objects
 * @param {string} query - Search term
 */
export function filterBySearch(stories, query) {
    if (!query) return stories;
    const q = query.toLowerCase();

    return stories.filter(story => {
        const title = (story.title || '').toLowerCase();
        const author = (story.author || '').toLowerCase();
        const category = (story.category || '').toLowerCase();
        const content = (story.content || '').toLowerCase();
        return title.includes(q) || author.includes(q) || category.includes(q) || content.includes(q);
    });
}

/**
 * Filters stories by category.
 */
export function filterByCategory(stories, category) {
    if (!category) return stories;
    return stories.filter(story => story.category === category);
}
