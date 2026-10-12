import typography from '@tailwindcss/typography';
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6fd', 100: '#d7eafa', 200: '#b0d4f3', 300: '#7db6e8', 400: '#4a94d8',
          500: '#2a7cc7', 600: '#1d6fb8', 700: '#185993', 800: '#164a78', 900: '#143e63',
        },
        navy: { 700: '#13284a', 800: '#0f2140', 900: '#0b1b33', 950: '#06101f' },
        accent: { 300: '#fcdc6b', 400: '#f9cf3a', 500: '#f7c41a', 600: '#d9a80a' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgba(11,27,51,0.18)',
        glow: '0 0 0 1px rgba(29,111,184,.08), 0 20px 50px -20px rgba(29,111,184,.45)',
      },
      animation: {
        'float-slow': 'float 6s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-14px)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
    },
  },
  plugins: [typography],
};
