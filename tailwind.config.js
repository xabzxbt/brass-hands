export default {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
        extend: {
            colors: {
                'brutal-bg': '#F5F5F5',
                'brutal-card': '#FFFFFF',
                'brutal-border': '#000000',
                'brutal-text': '#000000',
                'brutal-primary': '#FF5722',
                'brutal-secondary': '#FFFFFF',
                'brutal-orange': '#FF5722',
                'brutal-blue': '#00AAFF',
                'brutal-dark': '#000000',
                'brutal-black': '#000000',
                success: '#22c55e',
                warning: '#eab308',
                error: '#ef4444',
            },
            boxShadow: {
                'brutal': '4px 4px 0px 0px rgba(0,0,0,1)',
                'brutal-lg': '8px 8px 0px 0px rgba(0,0,0,1)',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
                heading: ['Space Grotesk', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
