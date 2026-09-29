/** Runs before first paint: applies the saved theme, or the system theme if none was chosen. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('qs:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
