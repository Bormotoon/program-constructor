/// <reference types="vite/client" />

// Типы Vite для побочных импортов ассетов (`import './index.css'`) и для
// import.meta.env. Без этой ссылки TypeScript 7 отказывается разрешать
// побочный импорт CSS: в отличие от 5.8, он проверяет и такие импорты тоже.
