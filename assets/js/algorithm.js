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
    
    // Engagement score (weighted)
    const baseScore = (points * 0.75) + (clicks * 0.25);

    // Time decay
    const publishedAt = new Date(story.published_at);
    const updatedAt = story.updated_at ? new Date(story.updated_at) : publishedAt;
    const now = new Date();
    
    const hoursSincePublished = (now - publishedAt) / (1000 * 60 * 60);
    const hoursSinceUpdated = (now - updatedAt) / (1000 * 60 * 60);

    // Freshness boost for recent updates
    const freshnessBoost = hoursSinceUpdated < 24 ? (1 / (hoursSinceUpdated + 1)) : 0;

    // Apply gravity (decay)
    const gravity = 1.5;
    return (baseScore + freshnessBoost) / Math.pow(hoursSincePublished + 2, gravity);
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
    
    return stories.filter(story => 
        (story.title && story.title.toLowerCase().includes(q)) ||
        (story.author && story.author.toLowerCase().includes(q)) ||
        (story.category && story.category.toLowerCase().includes(q)) ||
        (story.content && story.content.toLowerCase().includes(q))
    );
}

/**
 * Filters stories by category.
 */
export function filterByCategory(stories, category) {
    if (!category) return stories;
    return stories.filter(story => story.category === category);
}
