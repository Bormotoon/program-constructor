import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/*
 * В репозитории живёт НЕСКОЛЬКО приложений на общем корпусе ФРП и общих
 * кирпичиках документов: конструктор рабочих программ (по умолчанию) и
 * календарный учебный график (APP=schedule). Собираются они РАЗДЕЛЬНО, каждое
 * в свой каталог со своими assets/, и это не косметика: у конструктора уже
 * была авария от разрастания графа сборки — Vite пересчитал хеши ленивых
 * чанков, выкат залил их выборочно, и выгрузка DOCX отдавала 404. Раздельные
 * сборки означают, что сломанный выкат одного приложения физически не может
 * уронить другое.
 *
 * Общий код при этом импортируется ИСХОДНИКАМИ из ../../src — корпус ФРП и
 * экспортёры остаются единственным источником истины.
 */
const APPS = {
  main: { root: '.', outDir: 'dist' },
  schedule: { root: 'apps/schedule', outDir: '../../dist-schedule' },
} as const;

export default defineConfig(() => {
  const appName = (process.env.APP ?? 'main') as keyof typeof APPS;
  const app = APPS[appName];
  if (!app) {
    throw new Error(`Неизвестное приложение APP=${process.env.APP}. Доступны: ${Object.keys(APPS).join(', ')}`);
  }
  return {
    root: app.root,
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
      outDir: app.outDir,
      emptyOutDir: true,
      // С Vite 8 сборщик — rolldown, и rollupOptions у него помечен устаревшим.
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, app.root, 'index.html'),
        },
      },
    },
    optimizeDeps: {
      // edsoo — офлайн-копия сайта с исходными PDF, а не зависимость сборки.
      exclude: ['edsoo'],
    },
  };
});
