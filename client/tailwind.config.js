/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          hover: 'var(--secondary-hover)',
          foreground: 'var(--secondary-foreground)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          hover: 'var(--danger-hover)',
          foreground: 'var(--danger-foreground)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        background: {
          DEFAULT: 'var(--background)',
          alt: 'var(--background-alt)',
        },
        surface: 'var(--card-bg)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        foreground: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
        },
        engine: {
          success: {
            bg: 'var(--engine-success-bg)',
            text: 'var(--engine-success-text)',
          },
          error: {
            bg: 'var(--engine-error-bg)',
            text: 'var(--engine-error-text)',
          }
        },
        'engine-success-bg': 'var(--engine-success-bg)',
        'engine-error-bg': 'var(--engine-error-bg)',
        'engine-success-text': 'var(--engine-success-text)',
        'engine-error-text': 'var(--engine-error-text)',
        code: {
          bg: 'var(--code-bg)',
          text: 'var(--code-text)',
        }
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '1rem' }], // 10px
      },
      minWidth: {
        'filter-search': '240px',
        'filter-select': '180px',
      }
    },
  },
  plugins: [],
  darkMode: ['class', '[data-theme="dark"]'], // Support both methods
}