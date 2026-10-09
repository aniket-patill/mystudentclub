/* Load the live Supabase client only outside localhost mock mode. This script is
   parser-blocking so the production client remains ready before page modules run. */
(function loadMentorshipBackend(global) {
  let mock = false;
  try {
    const host = global.location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
      || host.endsWith('.localhost') || host.endsWith('.test');
    if (local) {
      const params = new URLSearchParams(global.location.search);
      let stored = null;
      try {
        if (params.has('mock')) {
          global.localStorage.setItem('ms_mock', params.get('mock') === '0' ? '0' : '1');
        }
        stored = global.localStorage.getItem('ms_mock');
      } catch { /* storage blocked by browser tracking prevention */ }
      mock = params.get('mock') === '1' || (params.get('mock') !== '0' && stored === '1');
    }
  } catch { /* storage may be unavailable; use the live backend */ }

  if (mock) return;
  document.write('<script src="/scripts/supabase.js"><\/script><script src="/scripts/supabase-init.js"><\/script>');
})(window);
