/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif:     ['Georgia', 'serif'],
        sans:      ['-apple-system', 'Helvetica Neue', 'sans-serif'],
        condensed: ['"Barlow Condensed"', 'Impact', 'sans-serif'],
      },
      colors: {
        ink:    '#1C2530',
        paper:  '#F2EDE4',
        cream:  '#FFFDF8',
        stone:  '#EAE5DB',
        border: '#CFC9BE',
        muted:  '#8B8074',
        navy:   '#1B3D6F',
        gold:   '#B8742A',
        coral:  '#C0452A',
        // Gates
        'g1': '#C17B2A',
        'g2': '#1B5FA0',
        'g3': '#2A6B45',
        'g4': '#7A3A8E',
      },
    },
  },
  plugins: [],
}

