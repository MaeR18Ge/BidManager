/**
 * Tailwind CSS configuration for the Figma order-management page.
 * Scans the static HTML and Jinja templates to purge unused classes.
 */
module.exports = {
  content: [
    './static/figma/BDpage/order-management.html',
    './templates/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#7c3aed',
        secondary: '#4f46e5',
        dark: {
          100: '#0b0d11',
          200: '#0c0e12',
          300: '#111827',
          400: '#0f172a',
          500: '#030712',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        pending: '#8b5cf6',
        text: {
          primary: '#f3f4f6',
          secondary: '#9ca3af',
        },
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

