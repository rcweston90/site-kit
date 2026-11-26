export const SITE_THEME_KEY = 'site-theme';

/** Sets the saved theme before the page paints (see the site layout). */
export const SITE_THEME_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem('${SITE_THEME_KEY}'));var d=document.documentElement;d.setAttribute('data-js','');if(t==='amber'||t==='dark')d.setAttribute('data-theme',t);else d.removeAttribute('data-theme');}catch(e){}})()`;
