import assert from 'node:assert/strict';
import {Element,loadPage,extractFunction} from './linkedin-postcard.test.mjs';
const originalText=Object.getOwnPropertyDescriptor(Element.prototype,'textContent').get;
Object.defineProperty(Element.prototype,'textContent',{get:originalText,set(value){this.childNodes=[String(value)]}});
Element.prototype.contains=function(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false};
Element.prototype.dispatchEvent=function(event){this.lastEvent=event;return true};
const postId='7515313026304987136',marker='fixture-marker';
function fixture({quote='Repost with your thoughts',publish='Post',existing='',confirmation=true,wrapRepost=false,wrapQuote=false,secondPost=false}={}){
 const repostButton='<button id="repost" aria-label="Repost">Repost</button>';
 const repostControl=wrapRepost?`<div role="button" id="repost-wrap" aria-label="Repost">${repostButton}</div>`:repostButton;
 const quoteButton=`<button id="quote">${quote}</button>`;
 const quoteControl=wrapQuote?`<div role="menuitem" id="quote-wrap">${quoteButton}</div>`:quoteButton;
 const other=secondPost?'<article data-urn="urn:li:activity:7515313026304980000"><p>Another company shared different news.</p><div role="button" aria-label="Repost"><button id="repost2" aria-label="Repost">Repost</button></div></article>':'';
 const page=loadPage(`<main><article data-urn="urn:li:activity:${postId}"><p>Example company launched a new assay platform for research teams.</p>${repostControl}</article>${other}<div id="menu" hidden><button id="plain">Repost instantly</button>${quoteControl}</div><div role="dialog" id="composer" hidden><div id="editor" class="ql-editor" role="textbox" contenteditable="true">${existing}</div><button id="publish" class="share-actions__primary-action">${publish}</button></div><div id="toast" role="alert" hidden>Post successful<a href="https://www.linkedin.com/feed/update/urn:li:activity:7515313026304987999/">View post</a></div></main>`);
 const by=id=>page.document.byId(id),editor=by('editor');
 editor.focus=()=>{page.document.activeElement=editor};page.document.execCommand=(_cmd,_ui,text)=>{editor.textContent=text;return true};
 by('repost').onClick=()=>by('menu').removeAttribute('hidden');by('quote').onClick=()=>{by('menu').setAttribute('hidden','');by('composer').removeAttribute('hidden')};
 by('publish').onClick=()=>{by('composer').setAttribute('hidden','');if(confirmation)by('toast').removeAttribute('hidden')};
 const fn=new Function('document','getComputedStyle','setTimeout','InputEvent',extractFunction('openThoughtsComposer')+'\n'+extractFunction('submitThoughtsComposer')+'\nreturn {openThoughtsComposer,submitThoughtsComposer}')(page.document,n=>({display:n.hiddenInTree?'none':'block',visibility:'visible'}),resolve=>resolve(),class{constructor(type,options){this.type=type;Object.assign(this,options)}});
 return {...fn,by};
}
for(const [quote,publish]of [['Repost with your thoughts','Post'],['Republier avec un commentaire','Publier'],['Mit Kommentar reposten','Veröffentlichen'],['Volver a publicar con tus ideas','Publicar'],['Ripubblica con un commento','Pubblica']]){
 const p=fixture({quote,publish});const ready=await p.openThoughtsComposer('Congratulations Example!',postId,'',marker);assert.equal(ready.ready,true,JSON.stringify(ready));assert.equal(p.by('plain').clicked,undefined,'plain repost is never used');assert.equal(p.by('publish').clicked,undefined,'prepare does not publish');
 const result=await p.submitThoughtsComposer('Congratulations Example!',marker);assert.equal(result.confirmed,true,JSON.stringify(result));assert.equal(result.thoughtsConfirmed,true);assert.equal(p.by('publish').clicked,1);assert.match(result.repostUrl,/7515313026304987999/);
}
{
 const p=fixture({confirmation:false});await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);const r=await p.submitThoughtsComposer('Great initiative Example!',marker);assert.equal(r.confirmed,false);assert.equal(r.thoughtsSubmitted,true);assert.match(r.detail,/did not provide visible confirmation/);assert.equal(p.by('publish').clicked,1);
}
{
 const p=fixture({existing:'My unsaved personal draft'});const r=await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);assert.equal(r.ready,false);assert.equal(p.by('editor').textContent,'My unsaved personal draft');assert.equal(p.by('publish').clicked,undefined);
}
{
 const p=fixture();await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);p.by('editor').textContent='Changed by a person';const r=await p.submitThoughtsComposer('Great initiative Example!',marker);assert.equal(r.thoughtsSubmitted,false);assert.equal(p.by('publish').clicked,undefined);
}
{
 const p=fixture();const r=await p.openThoughtsComposer('Great initiative Example!','hash-id','Completely different source text that cannot match',marker);assert.equal(r.ready,false);assert.equal(p.by('repost').clicked,undefined);
}
{
 const p=fixture();const r=await p.submitThoughtsComposer('Great initiative Example!',marker);assert.equal(r.confirmed,false);assert.equal(p.by('publish').clicked,undefined);
}
// 11-05 regression: LinkedIn wraps the real <button> in a role=button element, so each card exposed two Repost controls.
{
 const p=fixture({wrapRepost:true});const r=await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);assert.equal(r.ready,true,JSON.stringify(r));assert.equal(p.by('repost').clicked,1,'the inner Repost button is clicked once');assert.equal(p.by('plain').clicked,undefined);
}
{
 const p=fixture({wrapRepost:true});const r=await p.openThoughtsComposer('Great initiative Example!','hash-id','Example company launched a new assay platform',marker);assert.equal(r.ready,true,JSON.stringify(r));assert.equal(p.by('repost').clicked,1);
}
{
 const p=fixture({wrapQuote:true});const r=await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);assert.equal(r.ready,true,JSON.stringify(r));assert.equal(p.by('quote').clicked,1,'the wrapped thoughts option is chosen once');assert.equal(p.by('plain').clicked,undefined);
}
{
 const p=fixture({wrapRepost:true,wrapQuote:true,secondPost:true});const r=await p.openThoughtsComposer('Great initiative Example!',postId,'',marker);assert.equal(r.ready,true,JSON.stringify(r));assert.equal(p.by('repost').clicked,1);assert.equal(p.by('repost2').clicked,undefined,'the other post is never touched');
}
{
 // Two genuinely different posts with no id or text to tell them apart stay ambiguous: nothing is clicked.
 const p=fixture({wrapRepost:true,secondPost:true});const r=await p.openThoughtsComposer('Great initiative Example!','','',marker);assert.equal(r.ready,false);assert.match(r.detail,/exactly one matching post/);assert.equal(p.by('repost').clicked,undefined);assert.equal(p.by('repost2').clicked,undefined);
}
console.log('Automatic thoughts composer fixtures passed: five languages, exact text, quote-only path, single submit, preserved drafts, uncertain confirmation, and nested Repost/thoughts controls counted once.');
