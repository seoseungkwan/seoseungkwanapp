// Tailwind CSS v4 (ADR-015). 이 파일이 있으면 Next 기본 PostCSS 설정(autoprefixer 등)은 꺼진다
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
