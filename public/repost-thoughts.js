(() => {
  const panel=document.getElementById('autoThoughtsPanel'),toggle=document.getElementById('autoThoughtsEnabled'),status=document.getElementById('autoThoughtsStatus'),history=document.getElementById('autoThoughtsHistory');
  let request=0;
  const esc=value=>escapeHtml(String(value??''));
  window.loadRepostThoughts=async()=>{
    const id=++request;toggle.disabled=true;
    try{
      const data=await api('/api/repost-thoughts');if(id!==request)return;panel.hidden=!data.eligible;if(!data.eligible)return;
      toggle.checked=data.enabled;status.textContent=data.enabled?'ON for your account. Updated collectors will use Repost with your thoughts on new eligible posts.':'OFF. Future runs will use plain reposts; an in-flight submission may already have started.';
      history.innerHTML=data.history?.length?`<table><thead><tr><th>Source / generated</th><th>Exact accompanying text</th><th>Status</th><th>LinkedIn</th></tr></thead><tbody>${data.history.map(row=>`<tr><td>${esc(row.source_name)}<small class="table-sub">${esc(fmt(row.generated_at))}</small></td><td>${esc(row.thoughts||'No text generated')}</td><td>${esc(({published:'LinkedIn confirmed',submitting:'Submission started — confirmation pending',unknown:'Uncertain — review before retry',generated:'Generated — not submitted',generating:'Generating',failed:'Failed — not confirmed'})[row.status]||row.status)}<small class="table-sub">${esc(row.detail)}</small></td><td><a href="${esc(row.original_post_url)}" target="_blank" rel="noopener">Original</a>${row.repost_url?.startsWith('https://www.linkedin.com/')?` · <a href="${esc(row.repost_url)}" target="_blank" rel="noopener">Your repost</a>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No automatic thoughts generated yet. The first confirmed entry appears after an updated collector publishes a new eligible repost.</p>';
    }catch(error){if(id===request){status.textContent=error.message;}}
    finally{if(id===request)toggle.disabled=false;}
  };
  toggle.addEventListener('change',async()=>{const enabled=toggle.checked;toggle.disabled=true;try{await api('/api/repost-thoughts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});await window.loadRepostThoughts();}catch(error){toggle.checked=!enabled;status.textContent=error.message;}finally{toggle.disabled=false;}});
  document.querySelector('[data-view="reposts"]')?.addEventListener('click',window.loadRepostThoughts);
  window.loadRepostThoughts();
})();
