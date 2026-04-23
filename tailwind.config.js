/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.html", "./js/**/*.js"],
    darkMode: "class",
    theme: {
        extend: {
            "colors": {
                "tertiary-fixed-dim": "#9ccaff",
                "secondary-fixed": "#e3e2e2",
                "inverse-surface": "#3d2d26",
                "on-secondary-fixed-variant": "#464747",
                "surface-bright": "#fff8f6",
                "on-primary": "#ffffff",
                "inverse-primary": "#ffb596",
                "on-error": "#ffffff",
                "on-surface-variant": "#5a4136",
                "tertiary-fixed": "#d0e4ff",
                "on-secondary": "#ffffff",
                "primary": "#a33e00",
                "outline-variant": "#e3bfb1",
                "surface-container-lowest": "#ffffff",
                "on-tertiary": "#ffffff",
                "surface": "#fff8f6",
                "secondary-container": "#e3e2e2",
                "on-tertiary-fixed-variant": "#00497b",
                "on-error-container": "#93000a",
                "primary-container": "#ff6600",
                "primary-fixed-dim": "#ffb596",
                "surface-dim": "#f0d4ca",
                "on-tertiary-fixed": "#001d35",
                "tertiary": "#0062a1",
                "on-secondary-container": "#646464",
                "on-primary-container": "#561d00",
                "tertiary-container": "#009cfc",
                "on-primary-fixed-variant": "#7c2e00",
                "secondary-fixed-dim": "#c7c6c6",
                "surface-container": "#ffe9e1",
                "inverse-on-surface": "#ffede7",
                "on-tertiary-container": "#003155",
                "on-primary-fixed": "#360f00",
                "surface-container-high": "#fee2d8",
                "surface-tint": "#a33e00",
                "surface-variant": "#f8ddd2",
                "primary-fixed": "#ffdbcd",
                "on-background": "#261812",
                "error": "#ba1a1a",
                "on-secondary-fixed": "#1b1c1c",
                "background": "#fff8f6",
                "secondary": "#5e5e5e",
                "surface-container-highest": "#f8ddd2",
                "error-container": "#ffdad6",
                "on-surface": "#261812",
                "outline": "#8e7164",
                "surface-container-low": "#fff1ec"
            },
            "borderRadius": {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "full": "9999px"
            },
            "spacing": {
                "item-gap": "4px",
                "gutter": "12px",
                "container-max": "1100px",
                "section-padding": "10px",
                "edge-margin": "8px"
            },
            "fontFamily": {
                "meta-sm": ["Verdana", "Geneva", "sans-serif"],
                "title-md": ["Verdana", "Geneva", "sans-serif"],
                "header-brand": ["Verdana", "Geneva", "sans-serif"],
                "footer-note": ["Verdana", "Geneva", "sans-serif"],
                "nav-link": ["Verdana", "Geneva", "sans-serif"],
                "body-md": ["Verdana", "Geneva", "sans-serif"]
            },
            "fontSize": {
                "meta-sm": ["10px", { "lineHeight": "14px", "fontWeight": "400" }],
                "title-md": ["13px", { "lineHeight": "16px", "fontWeight": "400" }],
                "header-brand": ["14px", { "lineHeight": "18px", "fontWeight": "700" }],
                "footer-note": ["11px", { "lineHeight": "15px", "fontWeight": "400" }],
                "nav-link": ["13px", { "lineHeight": "18px", "fontWeight": "400" }],
                "body-md": ["12px", { "lineHeight": "16px", "fontWeight": "400" }]
            }
        }
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ]
};
