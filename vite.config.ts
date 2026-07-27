import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Относительный base, чтобы сборка одинаково работала и в корне домена, и
    // в подкаталоге (GitHub Pages отдаёт проект по /program-constructor/), и
    // просто из файловой системы. Абсолютный путь ломает второй и третий случай.
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // DISABLE_HMR=true отключает горячую перезагрузку и слежение за файлами.
      // Полезно на слабой машине: слежение за деревом проекта рядом с
      // офлайн-копией edsoo (5,9 ГБ) заметно нагружает диск.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // С Vite 8 сборщик — rolldown, и rollupOptions у него помечен устаревшим.
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
    },
    optimizeDeps: {
      // edsoo — офлайн-копия сайта с исходными PDF, а не зависимость сборки.
      exclude: ['edsoo'],
    },
  };
});
