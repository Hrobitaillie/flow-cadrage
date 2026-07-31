/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        // Satoshi = police de marque (voir index.html), IBM Plex Mono pour le code/routes.
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans2: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono2: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Semantic slots for the four edge types / facets — refined by later agents.
        facet: {
          front: '#2563eb',
          back: '#7c3aed',
          fullstack: '#0891b2',
        },
        // Fond « papier » chaud du document de spécifications.
        paper: '#faf9f6',
      },
    },
  },
  plugins: [],
}
