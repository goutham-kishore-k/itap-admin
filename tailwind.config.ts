import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: '#B0182B',
        'brand-dark': '#8E1322',
        ink: '#1E1517',
      },
    },
  },
  plugins: [],
};

export default config;
