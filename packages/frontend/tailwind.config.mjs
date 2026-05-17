export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: {
          900: '#0a0a0f',
          800: '#0f0f1a',
          700: '#12121a',
          600: '#1a1a2e',
          500: '#242442',
        },
        neon: {
          pink: '#ff00ff',
          cyan: '#00ffff',
          orange: '#ff6600',
          purple: '#b44dff',
          green: '#00ff88',
          blue: '#0088ff',
        },
        glass: {
          border: 'rgba(255,255,255,0.08)',
          bg: 'rgba(255,255,255,0.03)',
          hover: 'rgba(255,255,255,0.06)',
          active: 'rgba(255,255,255,0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        glass: '16px',
      },
      boxShadow: {
        neon: '0 0 15px rgba(0, 255, 255, 0.3), 0 0 30px rgba(0, 255, 255, 0.1)',
        'neon-pink': '0 0 15px rgba(255, 0, 255, 0.3), 0 0 30px rgba(255, 0, 255, 0.1)',
        'neon-orange': '0 0 15px rgba(255, 102, 0, 0.3), 0 0 30px rgba(255, 102, 0, 0.1)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'border-glow': 'borderGlow 3s linear infinite',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'neon-gradient': 'linear-gradient(135deg, #ff00ff 0%, #00ffff 50%, #ff6600 100%)',
        'void-gradient': 'linear-gradient(180deg, #0a0a0f 0%, #12121a 50%, #0a0a0f 100%)',
      },
    },
  },
  plugins: [],
};
