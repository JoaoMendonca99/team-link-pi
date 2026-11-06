export type ThemeMode = 'dark' | 'light'
export const resolveTheme = (saved:unknown):ThemeMode => saved==='light'?'light':'dark'
// Runs in <head> before body paint, including when JavaScript hydration is delayed.
export const themeInitScript = `(function(){var t='dark';try{if(localStorage.getItem('theme')==='light')t='light'}catch(e){}var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t})()`
