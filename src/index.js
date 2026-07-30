const LINKEDIN_CLIENT_ID = '78dsjq2rbcv26t';
const LINKEDIN_REDIRECT_URI = 'https://nexashare.oattia.workers.dev/api/auth/callback';
const LINKEDIN_SCOPES = 'openid profile email w_member_social';


function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}


function setCookie(name, value, maxAge = 86400 * 30) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}


function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}


async function handleAuth(request, env) {
  const url = new URL(request.url);


  // LinkedIn OAuth redirect
  if (url.pathname === '/api/auth/linkedin') {
    const teamName = url.searchParams.get('team') || '';
    const state = btoa(JSON.stringify({ team: teamName, ts: Date.now() }));
    const linkedinUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&scope=${encodeURIComponent(LINKEDIN_SCOPES)}&state=${encodeURIComponent(state)}`;
    return Response.redirect(linkedinUrl, 302);
  }


  // OAuth callback
  if (url.pathname === '/api/auth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
