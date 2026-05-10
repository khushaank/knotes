# K. Notes

A modern, secure Hacker News clone built with Vanilla HTML, JavaScript, and Tailwind CSS. Powered by Supabase.

## Features
- **Dynamic Content**: Fetches latest stories from Supabase.
- **Search**: Real-time search functionality.
- **Auth**: User login and signup via Supabase.
- **Secure**: Implements Content Security Policy (CSP) and compiled styles.
- **SEO Ready**: Includes `sitemap.xml`, `robots.txt`, and `llms.txt`.
- **Deploy Ready**: Configured for GitHub Pages, Netlify, and Apache.

## Development

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Supabase**:
    Update `js/supabaseConfig.js` with your project URL and Anon Key.

3.  **Build Styles**:
    ```bash
    npm run build
    ```

## Deployment

### GitHub Pages
1.  Ensure you've run `npm run build` so the `css/styles.css` is up to date.
2.  Push your code to a GitHub repository.
3.  Go to **Settings > Pages** and select the branch to deploy from.
4.  The site is pre-configured with a `.nojekyll` file and a `404.html`.

### Netlify
Automatically picks up `_redirects` for custom 404 routing.
