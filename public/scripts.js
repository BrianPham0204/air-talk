// google.script.run shim — maps GAS calls to fetch API routes
var google = (function () {
  function makeRunner() {
    var _ok = null, _err = null;

    function dispatch(promise) {
      promise
        .then(function (data) { if (data && data.error) { if (_err) _err({ message: data.error }); } else { if (_ok) _ok(data); } })
        .catch(function (e) { if (_err) _err({ message: e.message || 'Network error' }); });
    }

    function post(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json(); });
    }

    var runner = {
      withSuccessHandler: function (cb) { _ok = cb; return runner; },
      withFailureHandler: function (cb) { _err = cb; return runner; },

      login: function (name, code) {
        dispatch(post('/api/auth', { action: 'login', name: name, code: code }));
      },
      logout: function (token) {
        dispatch(post('/api/auth', { action: 'logout', token: token }));
      },
      getData: function (token) {
        dispatch(fetch('/api/data?token=' + encodeURIComponent(token)).then(function (r) { return r.json(); }));
      },
      setFlag: function (token, code, flagged) {
        dispatch(post('/api/data', { token: token, code: code, flagged: flagged }));
      },
      chatSend: function (token, room, text) {
        dispatch(post('/api/chat', { action: 'send', token: token, room: room, text: text }));
      },
      chatPoll: function (token, room) {
        dispatch(fetch('/api/chat?token=' + encodeURIComponent(token) + '&room=' + encodeURIComponent(room)).then(function (r) { return r.json(); }));
      },
      chatLeave: function (token, room) {
        dispatch(post('/api/chat', { action: 'leave', token: token, room: room }));
      },
    };
    return runner;
  }

  return { script: { get run() { return makeRunner(); } } };
})();


// === Login module ===

var AUTH = { token:null, name:null, role:null };
function authEl(id){ return document.getElementById(id); }
function showAuth(msg){ authEl('authOverlay').style.display='flex'; authEl('authErr').textContent=msg||''; authEl('authUser').focus(); }
function hideAuth(){ authEl('authOverlay').style.display='none'; }

function doLogin(){
  var u=authEl('authUser').value.trim();
  if(!u){ authEl('authErr').textContent='Vui lòng nhập tên hiển thị.'; return; }
  var btn=authEl('authBtn'); btn.disabled=true; btn.textContent='Đang đăng nhập…'; authEl('authErr').textContent='';
  google.script.run
    .withSuccessHandler(function(res){
      AUTH.token=res.token; AUTH.name=res.name; AUTH.role=res.role;
      try{ sessionStorage.setItem('at_token',res.token); sessionStorage.setItem('at_name',res.name); }catch(e){}
      if(window.Notification && Notification.permission==='default'){ try{ Notification.requestPermission(); }catch(e){} }
      btn.disabled=false; btn.textContent='Đăng nhập';
      hideAuth(); mountUserChip(res.name); loadApp();
      if(window.startBgChatPoll) startBgChatPoll();
    })
    .withFailureHandler(function(e){
      btn.disabled=false; btn.textContent='Đăng nhập';
      authEl('authErr').textContent=(e&&e.message)?e.message:'Đăng nhập thất bại.';
    })
    .login(u);
}

function loadApp(){
  google.script.run
    .withSuccessHandler(init)
    .withFailureHandler(function(e){
      var m=(e&&e.message)||'';
      if(m.indexOf('AUTH')>=0){ doLogout(true); showAuth('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
      else { var l=document.getElementById('list'); if(l) l.innerHTML='<div class="placeholder">Lỗi tải dữ liệu: '+esc(m)+'</div>'; }
    })
    .getData(AUTH.token);
}

function doLogout(silent){
  var t=AUTH.token; AUTH.token=null; AUTH.name=null;
  try{ sessionStorage.removeItem('at_token'); sessionStorage.removeItem('at_name'); }catch(e){}
  if(window.stopChat) try{ stopChat(); }catch(e){}
  if(t){ try{ google.script.run.logout(t); }catch(e){} }
  if(!silent) location.reload();
}

function mountUserChip(name){
  var ex=document.getElementById('userChip');
  if(ex){ document.getElementById('userChipName').textContent=name; return; }
  var bar=document.querySelector('.topbar'); if(!bar) return;
  var chip=document.createElement('div'); chip.id='userChip'; chip.className='user-chip';
  chip.innerHTML='<span class="uc-dot"></span><span id="userChipName">'+esc(name)+'</span>'+
    '<button class="uc-out" onclick="doLogout()">Đăng xuất</button>';
  var wbtn=document.getElementById('widthToggle');
  if(wbtn) bar.insertBefore(chip,wbtn); else bar.appendChild(chip);
}

function authBoot(){
  var t=null,n=null;
  try{ t=sessionStorage.getItem('at_token'); n=sessionStorage.getItem('at_name'); }catch(e){}
  if(t){ AUTH.token=t; AUTH.name=n; hideAuth(); mountUserChip(n||''); loadApp(); if(window.startBgChatPoll) startBgChatPoll(); }
  else { showAuth(); }
}

authEl('authBtn').addEventListener('click', doLogin);
authEl('authUser').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
window.addEventListener('DOMContentLoaded', authBoot);


// === Main Scripts ===

/* ══ STATE ══ */
var S={
  policies:[],cats:{},pinned:null,scopes:['all'],
  facet:{field:null,value:null},density:'compact',collapsed:{},
  catOpen:true,scopesOpen:false,width:'default',
  processes:[],activeFlow:null,
  wfActive:null,wfHidden:{},dimMode:true
};
var SCOPES=[
  {k:'all',label:'Tất cả'},{k:'keyword',label:'Keyword'},{k:'code',label:'Code'},
  {k:'tags',label:'Tags'},{k:'category',label:'Category'},{k:'summary_main',label:'Ý chính'},
  {k:'script_en',label:'Script'},{k:'when_to_use',label:'Khi nào dùng'},
  {k:'check',label:'Cần check'},{k:'status',label:'Status'}
];

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
function asList(t){
  t=String(t==null?'':t);
  var r=t.indexOf('\n')>=0?t.split(/\r?\n/):t.split('*');
  var p=r.map(function(s){return s.replace(/^[\s*•\-]+/,'').trim();}).filter(Boolean);
  if(p.length<=1)return esc(t.trim());
  return'<ul class="bullets">'+p.map(function(s){return'<li>'+esc(s)+'</li>';}).join('')+'</ul>';
}
function hexa(hex,a){var h=hex.replace('#','');return'rgba('+parseInt(h.substr(0,2),16)+','+parseInt(h.substr(2,2),16)+','+parseInt(h.substr(4,2),16)+','+a+')';}
function catName(c){return(S.cats[c]||{}).cat_name||c;}
function catColor(c){return(S.cats[c]||{}).color||'#7F8C8D';}
function catOrder(c){return(S.cats[c]||{}).order||99;}
function isHot(p){return p.hot==='TRUE'||p.hot===true;}
function statusPill(s){
  if(s==='verified')return'<span class="pill ok">verified</span>';
  if(s==='needs-review')return'<span class="pill review">needs-review</span>';
  return'<span class="pill draft">'+esc(s||'draft')+'</span>';
}
function parseOptions(str){
  if(!str)return[];
  return String(str).split('|').map(function(s){
    s=s.trim();var i=s.lastIndexOf('>');
    return i<0?null:{label:s.slice(0,i).trim(),dest:s.slice(i+1).trim()};
  }).filter(Boolean);
}
function nodeType(n){
  var t=String(n.node_type||'').toLowerCase();
  if(t==='leaf'&&n.check&&n.check.trim())return'leaf-check';
  return t||'step';
}
function nbadge(t){
  var L={step:'step',question:'question',leaf:'leaf','leaf-check':'leaf ⚑'};
  return'<span class="nbadge '+t+'">'+esc(L[t]||t)+'</span>';
}

function initResizers(){
  function makeResizer(gridEl,gutId,cssVar,dir,min,max){
    var g=document.getElementById(gutId);if(!g||!gridEl)return;
    g.addEventListener('mousedown',function(e){
      e.preventDefault();g.classList.add('drag');document.body.style.userSelect='none';
      var x0=e.clientX,w0=parseFloat(getComputedStyle(gridEl).getPropertyValue('--'+cssVar))||400;
      function mv(e){gridEl.style.setProperty('--'+cssVar,Math.max(min,Math.min(max,w0+(e.clientX-x0)*dir))+'px');}
      function up(){g.classList.remove('drag');document.body.style.userSelect='';document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
    });
  }
  makeResizer(document.getElementById('polGrid'),'g1','w-facet',1,120,360);
  makeResizer(document.getElementById('polGrid'),'g2','w-pol-detail',-1,300,760);
  makeResizer(document.getElementById('procWrap'),'gProc','w-proc-detail',-1,280,700);
}

function initTabs(){
  var HINTS={
    policies:'Gõ keyword / code / từ khoá — lọc tức thì.',
    process:'Chọn flow → duyệt từng bước → xem detail bên phải.',
    chat:'Nhắn cho team — danh tính lấy từ tài khoản đăng nhập.',
    intake:'Dán link Google Doc → AI phân tích → xác nhận → ghi vào sheet.'
  };
  document.querySelectorAll('.tab').forEach(function(t){
    t.onclick=function(){
      document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('on');});
      document.querySelectorAll('.pane').forEach(function(x){x.classList.remove('on');});
      t.classList.add('on');
      document.getElementById('pane-'+t.dataset.pane).classList.add('on');
      document.getElementById('tabhint').textContent=HINTS[t.dataset.pane]||'';
      if(window.onTabChange)window.onTabChange(t.dataset.pane);
    };
  });
}
/* hook: chat tự start/stop theo tab */
window.onTabChange=function(pane){
  if(pane==='chat'){ if(window.startChat) startChat(); }
  else { if(window.stopChat) stopChat(); }
};

function initWidth(){
  var W=[{k:'default',label:'Mặc định'},{k:'wide',label:'Rộng'},{k:'full',label:'Tối đa'}];
  var btn=document.getElementById('widthToggle');
  function apply(){
    var el=document.getElementById('mainwrap');
    el.classList.remove('w-wide','w-full');
    if(S.width==='wide')el.classList.add('w-wide');
    else if(S.width==='full')el.classList.add('w-full');
    var lab=(W.filter(function(x){return x.k===S.width;})[0]||{}).label;
    btn.innerHTML='↔ Bề rộng: '+lab;
  }
  btn.onclick=function(){var ks=W.map(function(x){return x.k;});S.width=ks[(ks.indexOf(S.width)+1)%ks.length];apply();};
  apply();
}

function initPolicies(){
  var q=document.getElementById('q');
  q.addEventListener('input',runPol);
  q.addEventListener('keydown',function(e){if(e.key==='Enter'){var f=filterPol(qval());if(f.length)selectPol(f[0]);}});
  var box=document.getElementById('scopes');
  SCOPES.forEach(function(s){
    var c=document.createElement('span');c.className='chip';c.textContent=s.label;c.dataset.k=s.k;
    c.onclick=function(){
      if(s.k==='all'){S.scopes=['all'];}
      else{S.scopes=S.scopes.filter(function(x){return x!=='all';});
        var i=S.scopes.indexOf(s.k);if(i>=0)S.scopes.splice(i,1);else S.scopes.push(s.k);
        if(!S.scopes.length)S.scopes=['all'];}
      syncChips();q.focus();runPol();
    };
    box.appendChild(c);
  });
  syncChips();
  document.getElementById('scopeToggle').onclick=function(){S.scopesOpen=!S.scopesOpen;updateScopeUI();};
  var catBtn=document.getElementById('catToggle');
  function applyCat(){
    document.getElementById('polGrid').classList.toggle('cat-collapsed',!S.catOpen);
    catBtn.innerHTML=S.catOpen?'&#8249; Ẩn Category':'&#8250; Hiện Category';
  }
  catBtn.onclick=function(){S.catOpen=!S.catOpen;applyCat();};
  applyCat();
  document.querySelectorAll('.dchip').forEach(function(n){
    n.onclick=function(){
      S.density=n.dataset.d;
      document.querySelectorAll('.dchip').forEach(function(m){m.classList.toggle('on',m.dataset.d===S.density);});
      runPol();
    };
  });
  runPol();
}

function syncChips(){document.querySelectorAll('.chip').forEach(function(n){n.classList.toggle('on',S.scopes.indexOf(n.dataset.k)>=0);});}
function qval(){return document.getElementById('q').value.trim();}
function scopeLabel(){return S.scopes.indexOf('all')>=0?'Tất cả':S.scopes.map(function(k){return(SCOPES.filter(function(s){return s.k===k;})[0]||{}).label;}).join(' + ');}
function updateScopeUI(){
  var box=document.getElementById('scopes');if(box)box.style.display=S.scopesOpen?'flex':'none';
  var btn=document.getElementById('scopeToggle');
  if(btn)btn.innerHTML='Tìm trong: <b>'+esc(scopeLabel())+'</b> '+(S.scopesOpen?'&#9652;':'&#9662;');
}
function fieldText(p,k){
  if(k==='all')return[p.code,p.keyword,p.tags,p.summary_main,p.when_to_use,p.check,p.script_en,p.category,catName(p.category),p.source_file,p.status].join(' ');
  if(k==='category')return p.category+' '+catName(p.category);
  return String(p[k]==null?'':p[k]);
}
function scopeText(p){
  return(S.scopes.indexOf('all')>=0?fieldText(p,'all'):S.scopes.map(function(k){return fieldText(p,k);}).join(' ')).toLowerCase();
}
function polSort(a,b){
  if(catOrder(a.category)!==catOrder(b.category))return catOrder(a.category)-catOrder(b.category);
  if((isHot(b)?1:0)!==(isHot(a)?1:0))return(isHot(b)?1:0)-(isHot(a)?1:0);
  return String(a.keyword).localeCompare(String(b.keyword));
}
function filterPol(q){
  var arr=S.policies.slice();
  if(S.facet.field&&S.facet.value!=null)arr=arr.filter(function(p){return String(p[S.facet.field])===String(S.facet.value);});
  if(!q)return arr.sort(polSort);
  var toks=q.toLowerCase().split(/\s+/).filter(Boolean);
  return arr.filter(function(p){var h=scopeText(p);return toks.every(function(t){return h.indexOf(t)>=0;});}).sort(polSort);
}
function hi(text,q){
  var t=esc(text);if(!q)return t;
  q.toLowerCase().split(/\s+/).filter(Boolean).forEach(function(tok){
    var re=new RegExp('('+tok.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');t=t.replace(re,'<mark>$1</mark>');
  });
  return t;
}
function renderFacets(){
  var box=document.getElementById('facet');if(!box)return;
  var FABLE=['category','status','source_file'];
  var field='category';
  for(var i=0;i<S.scopes.length;i++){if(FABLE.indexOf(S.scopes[i])>=0){field=S.scopes[i];break;}}
  if(S.facet.field&&S.facet.field!==field)S.facet={field:null,value:null};
  var counts={},order=[];
  S.policies.forEach(function(p){var v=p[field];if(!v)return;if(!(v in counts)){counts[v]=0;order.push(v);}counts[v]++;});
  if(field==='category')order.sort(function(a,b){return catOrder(a)-catOrder(b);});else order.sort();
  var labels={category:'Category',status:'Status',source_file:'Nguồn'};
  var html='<div class="facet-h">'+(labels[field]||field)+'</div>';
  html+='<div class="facet-item'+(S.facet.value==null?' on':'')+'" data-v="__all__">Tất cả<span class="facet-n">'+S.policies.length+'</span></div>';
  order.forEach(function(v){
    var on=String(S.facet.value)===String(v)?' on':'';
    var dot=field==='category'?'<span class="dot" style="background:'+catColor(v)+'"></span>':'';
    html+='<div class="facet-item'+on+'" data-v="'+esc(v)+'">'+dot+esc(field==='category'?catName(v).split('/')[0].trim():v)+'<span class="facet-n">'+counts[v]+'</span></div>';
  });
  box.innerHTML=html;
  box.querySelectorAll('.facet-item').forEach(function(n){
    n.onclick=function(){
      var v=n.getAttribute('data-v');
      if(v==='__all__'||String(S.facet.value)===String(v))S.facet={field:null,value:null};
      else S.facet={field:field,value:v};
      runPol();
    };
  });
}
function runPol(){
  renderFacets();updateScopeUI();
  var q=qval();var items=filterPol(q);
  document.getElementById('count').innerHTML=items.length+' kết quả'+(q?' · trong "'+esc(scopeLabel())+'"':'');
  var list=document.getElementById('list');
  list.className=S.density==='compact'?'compact':'';
  list.innerHTML='';
  var groups=[],byCat={};
  items.forEach(function(p){if(!byCat[p.category]){byCat[p.category]={cat:p.category,items:[]};groups.push(byCat[p.category]);}byCat[p.category].items.push(p);});
  groups.forEach(function(g){
    var coll=!!S.collapsed[g.cat];
    var gh=document.createElement('div');
    gh.className='group-h'+(coll?' collapsed':'');
    gh.innerHTML='<span class="chev">&#9656;</span><span class="dot" style="background:'+catColor(g.cat)+'"></span>'+esc(catName(g.cat))+'<span class="gcount">'+g.items.length+'</span>';
    gh.onclick=function(){S.collapsed[g.cat]=!S.collapsed[g.cat];runPol();};
    list.appendChild(gh);
    if(coll)return;
    g.items.forEach(function(p){
      var el=document.createElement('div');
      el.className='item'+(S.pinned&&S.pinned.code===p.code?' sel':'');
      el.dataset.code=p.code;
      var hot=isHot(p)?'<span class="star">&#9733;</span>':'';
      var bc=catColor(p.category);
      el.innerHTML='<div class="kw">'+hi(p.keyword,q)+hot+'<span class="badge" style="color:'+bc+';border-color:'+hexa(bc,.35)+';background:'+hexa(bc,.10)+'">'+esc(p.code)+'</span></div><div class="sm">'+hi(p.summary_main,q)+'</div>';
      el.onclick=function(){selectPol(p);};
      list.appendChild(el);
    });
  });
  if(q){var ex=items.filter(function(p){return p.code.toLowerCase()===q.toLowerCase();});if(ex.length===1)selectPol(ex[0]);}
}
function selectPol(p){
  S.pinned=p;
  document.querySelectorAll('.item').forEach(function(n){n.classList.toggle('sel',n.dataset.code===p.code);});
  renderPolDetail(p);
  document.getElementById('polDetail').scrollTop=0;
}
function renderPolDetail(p){
  var d=document.getElementById('polDetail');
  if(!p){d.innerHTML='<div class="placeholder"><div class="big">&#129516;</div>Chọn một mục để xem chi tiết.</div>';return;}
  var bc=catColor(p.category);
  var hot=isHot(p)?' <span class="star">&#9733;</span>':'';
  var script=p.script_en?asList(p.script_en):'<span style="color:var(--muted);font-style:italic">(không có script)</span>';
  var tags=(p.tags||'').split(/[,;]/).map(function(t){t=t.trim();return t?'<span class="tag">'+esc(t)+'</span>':'';}).join('');
  var warn=p.status==='needs-review'?'<div class="warn">&#9888; needs-review — đối chiếu doc gốc trước khi đọc cho khách.</div>':'';
  var flowBtn='';
  var tc=(p.tree_code&&p.tree_code.trim())?p.tree_code.trim():(function(){var d2=p.code.replace(/_/g,'-')+'-flow';return S.processes.some(function(n){return n.tree_code===d2;})?d2:null;})();
  if(tc)flowBtn='<div onclick="goToFlow(\''+esc(tc)+'\')" class="flow-link-btn">&#127880; Xem guided flow: '+esc(tc)+' →</div>';
  d.innerHTML=
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'+
    '<div class="dtitle">'+esc(p.keyword)+hot+'</div>'+
    flagBtn(p.code, p.flagged==='TRUE')+
    '</div>'+
    '<div class="pills"><span class="pill code-pill">'+esc(p.code)+'</span>'+
    '<span class="pill" style="color:'+bc+';background:'+hexa(bc,.12)+'">'+esc(catName(p.category))+'</span>'+
    statusPill(p.status)+'</div>'+warn+flowBtn+
    '<div class="hero main"><div class="lab">Ý chính</div><div class="val">'+asList(p.summary_main)+'</div></div>'+
    '<div class="hero script"><div class="lab">Nói với khách (script EN)</div><div class="val">'+script+'</div></div>'+
    '<div class="more">'+
    '<div class="row"><div class="lab">Khi nào dùng</div><div class="val">'+asList(p.when_to_use)+'</div></div>'+
    '<div class="row"><div class="lab">Cần check gì</div><div class="val">'+asList(p.check)+'</div></div>'+
    '<div class="row"><div class="lab">Tags</div><div class="val tags">'+tags+'</div></div>'+
    '<div class="row"><div class="lab">Nguồn</div><div class="val"><a href="'+esc(p.source_link)+'" target="_blank">'+esc(p.source_file)+'</a> · cập nhật '+esc(p.last_updated)+'</div></div>'+
    '</div>';
}
function goToFlow(tc){
  document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('on');});
  document.querySelectorAll('.pane').forEach(function(x){x.classList.remove('on');});
  document.querySelector('.tab[data-pane="process"]').classList.add('on');
  document.getElementById('pane-process').classList.add('on');
  document.getElementById('tabhint').textContent='Chọn flow → duyệt từng bước → xem detail bên phải.';
  if(window.onTabChange)window.onTabChange('process');
  activateFlow(tc);
}

function allFlows(){
  var seen={},flows=[];
  S.processes.forEach(function(n){if(n.tree_code&&!seen[n.tree_code]){seen[n.tree_code]=true;flows.push(n.tree_code);}});
  return flows;
}
function initProcess(){
  var flows=allFlows();
  var chips=document.getElementById('flowChips');
  if(!flows.length){chips.innerHTML='<span style="color:var(--muted);font-size:13px">Chưa có flow.</span>';return;}
  flows.forEach(function(f){
    var c=document.createElement('span');c.className='flow-chip';c.textContent=f;c.dataset.flow=f;
    c.onclick=function(){activateFlow(f);};
    chips.appendChild(c);
  });
  activateFlow(flows[0]);
}
function activateFlow(tc){
  S.activeFlow=tc;S.wfActive=null;S.wfHidden={};
  document.querySelectorAll('.flow-chip').forEach(function(c){c.classList.toggle('on',c.dataset.flow===tc);});
  renderTree();
  document.getElementById('procDetail').innerHTML='<div class="placeholder"><div class="big">&#128204;</div>Chọn một node để xem chi tiết.</div>';
  var nodes=S.processes.filter(function(n){return n.tree_code===tc;});
  if(nodes.length)focusNode(nodes[0].node_id);
}
function focusNode(nid){
  S.wfActive=nid;
  var tree=document.getElementById('procTree');
  tree.classList.toggle('showall',!S.dimMode);
  tree.querySelectorAll('.node-card').forEach(function(el){
    var id=el.dataset.nid;
    el.classList.remove('nc-active','nc-dim','nc-hidden');
    if(S.wfHidden[id])el.classList.add('nc-hidden');
    else if(id===nid)el.classList.add('nc-active');
    else el.classList.add('nc-dim');
    var opts=el.querySelector('.node-opts');
    if(opts)opts.style.display=(id===nid)?'flex':'none';
  });
  tree.querySelectorAll('.connector-wrap').forEach(function(cw){
    cw.style.display=(S.wfHidden[cw.dataset.next])?'none':'flex';
  });
  var active=tree.querySelector('.nc-active');
  if(active)active.scrollIntoView({behavior:'smooth',block:'center'});
  var node=S.processes.filter(function(n){return n.node_id===nid&&n.tree_code===S.activeFlow;})[0];
  if(node){renderProcDetail(node);document.getElementById('procDetail').scrollTop=0;}
}
function renderTree(){
  var tree=document.getElementById('procTree');
  var nodes=S.processes.filter(function(n){return n.tree_code===S.activeFlow;});
  if(!nodes.length){tree.innerHTML='<div class="placeholder">Không có node nào.</div>';return;}
  var html='';
  nodes.forEach(function(n,i){
    var t=nodeType(n);
    var opts=parseOptions(n.options);
    html+='<div class="node-card t-'+t+' nc-dim" data-nid="'+esc(n.node_id)+'">';
    html+='<div class="node-meta"><span class="nid">'+esc(n.node_id)+'</span>'+nbadge(t)+'</div>';
    html+='<div class="node-text">'+esc(n.text||n.summary_main)+'</div>';
    if(opts.length){
      html+='<div class="node-opts" style="display:none">';
      opts.forEach(function(o){html+='<span class="opt-pill" data-dest="'+esc(o.dest)+'">'+esc(o.label)+'</span>';});
      html+='</div>';
    }
    html+='</div>';
    if(i<nodes.length-1)html+='<div class="connector-wrap" data-next="'+esc(nodes[i+1].node_id)+'"><div class="connector"></div></div>';
  });
  tree.innerHTML=html;
  tree.querySelectorAll('.node-card').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.classList.contains('opt-pill'))return;
      var nid=el.dataset.nid;
      if(nid===S.wfActive)return;
      var nodeList=S.processes.filter(function(n){return n.tree_code===S.activeFlow;});
      var idx=nodeList.findIndex(function(n){return n.node_id===nid;});
      if(idx>=0)nodeList.slice(idx).forEach(function(n){delete S.wfHidden[n.node_id];});
      focusNode(nid);
    });
  });
  tree.querySelectorAll('.opt-pill').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var dest=btn.dataset.dest;
      var activeNode=S.processes.filter(function(n){return n.node_id===S.wfActive&&n.tree_code===S.activeFlow;})[0];
      if(activeNode)parseOptions(activeNode.options).forEach(function(o){if(o.dest!==dest)S.wfHidden[o.dest]=true;});
      focusNode(dest);
    });
  });
}
function setDimMode(on){
  S.dimMode=on;
  document.getElementById('dc-dim').classList.toggle('on',on);
  document.getElementById('dc-all').classList.toggle('on',!on);
  if(S.wfActive)focusNode(S.wfActive);
}
function renderProcDetail(n){
  var d=document.getElementById('procDetail');
  var t=nodeType(n);
  var opts=parseOptions(n.options);
  var script=n.script_en&&n.script_en.trim()?asList(n.script_en):'<span style="color:var(--muted);font-style:italic">(không có script)</span>';
  var warn=(n.check&&n.check.trim())?'<div class="warn">&#9888; '+esc(n.check)+'</div>':'';
  var optsHtml='';
  if(opts.length){
    optsHtml='<div class="hero main" style="margin-top:12px"><div class="lab">Lựa chọn</div>'+
      '<table class="opts-table">'+
      opts.map(function(o){return'<tr><td>'+esc(o.label)+'</td><td class="arr-cell">→</td>'+
        '<td><span class="nid" style="cursor:pointer" onclick="jumpTo(\''+esc(o.dest)+'\')">'+esc(o.dest)+'</span></td></tr>';}).join('')+
      '</table></div>';
  }
  d.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'+
    '<span class="nid">'+esc(n.node_id)+'</span>'+nbadge(t)+statusPill(n.status)+'</div>'+
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'+
    '<div class="proc-dtitle">'+esc(n.text||n.summary_main)+'</div>'+
    flagBtn(n.code, n.flagged==='TRUE')+
    '</div>'+
    warn+optsHtml+
    '<div class="hero script" style="margin-top:12px"><div class="lab">Script / hướng dẫn</div><div class="val">'+script+'</div></div>'+
    '<div class="more">'+
    (n.when_to_use&&n.when_to_use.trim()?'<div class="row"><div class="lab">Khi nào</div><div class="val">'+asList(n.when_to_use)+'</div></div>':'')+
    '<div class="row"><div class="lab">Nguồn</div><div class="val">'+
    (n.source_link?'<a href="'+esc(n.source_link)+'" target="_blank">'+esc(n.source_file)+'</a>':esc(n.source_file||'—'))+
    ' · '+esc(n.last_updated||'')+'</div></div></div>';
}
function jumpTo(nid){
  var nodeList=S.processes.filter(function(n){return n.tree_code===S.activeFlow;});
  var idx=nodeList.findIndex(function(n){return n.node_id===nid;});
  if(idx>=0)nodeList.slice(idx).forEach(function(n){delete S.wfHidden[n.node_id];});
  focusNode(nid);
  var el=document.querySelector('#procTree [data-nid="'+nid+'"]');
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}

function flagBtn(code, isFlagged){
  var cls='flag-btn'+(isFlagged?' on':'');
  var title=isFlagged?'Bỏ đánh dấu':'Đánh dấu cần xem lại';
  var icon=isFlagged?'★':'☆';
  return '<button class="'+cls+'" id="flagBtn_'+esc(code)+'" data-code="'+esc(code)+'" onclick="toggleFlag(this.dataset.code)" title="'+title+'">'+icon+'</button>';
}
function toggleFlag(code){
  var btn=document.getElementById('flagBtn_'+code);
  if(!btn)return;
  var nowFlagged=btn.classList.contains('on');
  var newVal=!nowFlagged;
  btn.classList.add('loading');
  google.script.run
    .withSuccessHandler(function(){
      btn.classList.remove('loading');
      btn.classList.toggle('on',newVal);
      btn.innerHTML=newVal?'★':'☆';
      btn.title=newVal?'Bỏ đánh dấu':'Đánh dấu cần xem lại';
      var all=S.policies.concat(S.processes);
      var rec=all.filter(function(r){return r.code===code;})[0];
      if(rec)rec.flagged=newVal?'TRUE':'FALSE';
      showToast(newVal?'⭐ Đã đánh dấu — xem lại trong sheet "policies" cột flagged':'Đã bỏ đánh dấu');
    })
    .withFailureHandler(function(e){
      btn.classList.remove('loading');
      showToast('Lỗi: '+e.message);
    })
    .setFlag(AUTH.token, code, newVal);
}
function showToast(msg){
  var t=document.getElementById('flagToast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._tid);
  t._tid=setTimeout(function(){t.classList.remove('show');},2200);
}

/* ══ init (gọi sau khi login thành công, từ loadApp) ══ */
function init(data){
  S.policies=(data.policies||[]);
  S.processes=(data.processes||[]);
  (data.categories||[]).forEach(function(c){S.cats[c.cat_code]=c;});
  initTabs();
  initWidth();
  initResizers();
  initPolicies();
  initProcess();
}


// === Chat module ===

(function(){
  var room='cs-floor', muted=false, unread=0, tabUnread=0, primed=false, seen={};
  var pollT=null, bgPollT=null, actx=null, started=false;

  function $(id){ return document.getElementById(id); }
  function cColor(n){ var h=0; for(var i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))%360; return 'hsl('+h+' 52% 40%)'; }
  function cInit(n){ return (String(n).trim()[0]||'?').toUpperCase(); }
  function cHHMM(ts){ var d=new Date(ts); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }

  function ensureAudio(){
    try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    if(actx && actx.state==='suspended'){ try{ actx.resume(); }catch(e){} }
  }
  function cBeep(){
    ensureAudio();
    if(!actx || actx.state!=='running') return;
    [[660,0],[880,.09]].forEach(function(p){
      var o=actx.createOscillator(), g=actx.createGain(); o.connect(g); g.connect(actx.destination);
      o.type='sine'; o.frequency.value=p[0]; var t=actx.currentTime+p[1];
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.13,t+.012); g.gain.exponentialRampToValueAtTime(.0001,t+.16);
      o.start(t); o.stop(t+.18);
    });
  }
  function cNotify(m){ if(window.Notification && Notification.permission==='granted'){ try{ new Notification('AirTalk · '+m.user,{body:m.text,tag:'airtalk-chat'}); }catch(e){} } }
  function cTitle(){ document.title=(unread>0?'('+unread+') ':'')+'AirTalk CS Assistant'; }

  function isOnChatTab(){ var t=document.querySelector('.tab[data-pane="chat"]'); return t&&t.classList.contains('on'); }

  function updateTabBadge(){
    var chatTab=document.querySelector('.tab[data-pane="chat"]');
    if(!chatTab) return;
    var badge=chatTab.querySelector('.chat-unread-badge');
    if(tabUnread>0){
      if(!badge){ badge=document.createElement('span'); badge.className='chat-unread-badge'; chatTab.appendChild(badge); }
      badge.textContent=tabUnread>99?'99+':String(tabUnread);
    } else {
      if(badge) badge.remove();
    }
  }

  function countFresh(msgs){
    var fresh=0;
    msgs.forEach(function(m){ if(!seen[m.id]){ seen[m.id]=1; if(primed && m.user!==AUTH.name) fresh++; } });
    return fresh;
  }

  function cRenderMsgs(msgs){
    var log=$('chatLog'); if(!log) return;
    var near=log.scrollHeight-log.scrollTop-log.clientHeight<80;
    if(!msgs.length){ log.innerHTML='<div class="chat-empty">Chưa có tin nào. Chào team một câu đi.</div>'; primed=true; return; }
    log.innerHTML=msgs.map(function(m){
      var mine=m.user===AUTH.name;
      return '<div class="crow'+(mine?' mine':'')+'">'+
        '<span class="cav" style="background:'+cColor(m.user)+'">'+esc(cInit(m.user))+'</span>'+
        '<div class="cbub"><div class="cmeta">'+esc(mine?'Bạn':m.user)+' · '+cHHMM(m.ts)+'</div>'+
        '<div class="ctxt">'+esc(m.text)+'</div></div></div>';
    }).join('');
    if(near) log.scrollTop=log.scrollHeight;
    var fresh=countFresh(msgs);
    if(fresh>0){
      if(!muted) cBeep();
      if(document.hidden){ unread+=fresh; cTitle(); cNotify(msgs[msgs.length-1]); }
    }
    primed=true;
  }
  function cRenderPres(online){
    var el=$('chatOnline'); if(el) el.textContent=online.length;
    var pel=$('chatPres'); if(!pel) return;
    pel.innerHTML=online.map(function(n){
      return '<span class="pchip"><span class="pdot"></span>'+esc(n===AUTH.name?n+' (bạn)':n)+'</span>';
    }).join('')||'<span class="pchip" style="border-style:dashed">Chưa ai khác online</span>';
  }

  function cPoll(){
    if(!started || !AUTH.token) return;
    google.script.run
      .withSuccessHandler(function(d){ if(!d) return; cRenderMsgs(d.messages||[]); cRenderPres(d.online||[]); })
      .withFailureHandler(function(e){
        var m=(e&&e.message)||'';
        if(m.indexOf('AUTH')>=0){ stopChat(); if(window.showAuth) showAuth('Phiên hết hạn, đăng nhập lại.'); }
      })
      .chatPoll(AUTH.token, room);
  }

  function bgPoll(){
    if(!AUTH.token || started) return;
    google.script.run
      .withSuccessHandler(function(d){
        if(!d) return;
        var msgs=d.messages||[], fresh=countFresh(msgs);
        if(fresh>0){
          if(!muted) cBeep();
          tabUnread+=fresh; updateTabBadge();
          if(document.hidden){ unread+=fresh; cTitle(); cNotify(msgs[msgs.length-1]); }
        }
        if(!primed && msgs.length>0) primed=true;
      })
      .withFailureHandler(function(){})
      .chatPoll(AUTH.token, room);
  }

  function cOptimisticAppend(text){
    var log=$('chatLog'); if(!log) return;
    var empty=log.querySelector('.chat-empty'); if(empty) empty.remove();
    var div=document.createElement('div');
    div.className='crow mine';
    div.innerHTML='<span class="cav" style="background:'+cColor(AUTH.name)+'">'+esc(cInit(AUTH.name))+'</span>'+
      '<div class="cbub"><div class="cmeta">Bạn · '+cHHMM(Date.now())+'</div>'+
      '<div class="ctxt">'+esc(text)+'</div></div>';
    log.appendChild(div);
    log.scrollTop=log.scrollHeight;
  }

  function cSend(){
    var inp=$('chatMsg'), text=inp.value.trim();
    if(!text || !AUTH.token) return;
    inp.value='';
    cOptimisticAppend(text);
    google.script.run.withSuccessHandler(cPoll).withFailureHandler(function(){}).chatSend(AUTH.token, room, text);
  }

  window.startChat=function(){
    if(started || !AUTH.token) return;
    started=true;
    clearInterval(bgPollT); bgPollT=null;
    tabUnread=0; updateTabBadge();
    room=($('chatRoom').value.trim())||'cs-floor';
    $('chatMe').textContent=AUTH.name||'—';
    try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    if(actx && actx.state==='suspended'){ try{ actx.resume(); }catch(e){} }
    primed=false;
    cPoll(); pollT=setInterval(cPoll, 2500);
  };
  window.stopChat=function(){
    if(!started) return;
    started=false; clearInterval(pollT);
    if(AUTH.token){ try{ google.script.run.chatLeave(AUTH.token, room); }catch(e){} }
    if(AUTH.token && !bgPollT){ bgPollT=setInterval(bgPoll, 8000); }
  };
  window.startBgChatPoll=function(){
    if(!bgPollT && AUTH.token && !started){ bgPollT=setInterval(bgPoll, 8000); }
  };

  $('chatSendBtn').addEventListener('click', cSend);
  $('chatMsg').addEventListener('keydown', function(e){ if(e.key==='Enter') cSend(); });
  $('chatRoom').addEventListener('change', function(){ if(started){ stopChat(); startChat(); } });
  $('chatSnd').addEventListener('click', function(){ muted=!muted; this.classList.toggle('on',!muted); this.textContent=muted?'🔕':'🔔'; });
  ['click','keydown','touchstart'].forEach(function(ev){
    document.addEventListener(ev, ensureAudio, { passive:true });
  });
  window.addEventListener('focus', function(){ unread=0; cTitle(); });
})();


// === Intake tab ===
(function(){
  var COLS=['code','category','keyword','tags','summary_main','when_to_use','check','script_en',
    'source_file','source_link','status','last_updated','hot','tree_code','node_id','node_type','options','flagged'];
  var COL_LABEL={
    code:'Code',category:'Category',keyword:'Keyword',tags:'Tags',
    summary_main:'Tóm tắt',when_to_use:'Khi nào dùng',check:'Cần kiểm tra',
    script_en:'Script EN',source_file:'File nguồn',source_link:'Link nguồn',
    status:'Status',last_updated:'Cập nhật',hot:'Hot',
    tree_code:'Tree code',node_id:'Node ID',node_type:'Node type',
    options:'Options',flagged:'Flagged'
  };

  // State for 2-pass workflow
  var currentSkeleton=[], currentPolicies=[];
  var currentDocText='', currentOrKey='', currentCodes={}, currentToday='';

  function $i(id){ return document.getElementById(id); }

  function setStatus(msg, isErr){
    var el=$i('intakeStatus'); if(!el) return;
    el.textContent=msg;
    el.className='intake-status'+(isErr?' intake-err':'');
  }

  function actionLabel(a){
    if(a==='add') return '<span class="itag itag-add">ADD ON</span>';
    if(a==='replace') return '<span class="itag itag-replace">REPLACE</span>';
    return '<span class="itag itag-check">NEED-CHECK</span>';
  }

  function renderRecord(r, idx){
    var rec=r.record;
    var cols=COLS.filter(function(c){ return rec[c]; });
    var rows=cols.map(function(c){
      return '<tr><td class="ifield-k">'+esc(COL_LABEL[c]||c)+'</td><td class="ifield-v">'+esc(rec[c])+'</td></tr>';
    }).join('');
    return '<div class="irec irec-'+r.action+'" data-idx="'+idx+'">'+
      '<div class="irec-hd">'+actionLabel(r.action)+
      ' <span class="irec-code">'+esc(rec.code||'—')+'</span>'+
      (r.note?'<span class="irec-note">'+esc(r.note)+'</span>':'')+
      '</div>'+
      '<table class="ifield-tbl">'+rows+'</table>'+
      '</div>';
  }

  function doConfirmRecords(records, btn){
    if(!AUTH.token){ setStatus('Vui lòng đăng nhập trước.', true); return; }
    btn.disabled=true; btn.textContent='Đang ghi…';
    fetch('/api/data/bulk',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:AUTH.token, records:records})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ btn.disabled=false; btn.textContent='Thử lại'; setStatus('Lỗi ghi: '+d.error, true); return; }
      var added=(d.added||[]).length, replaced=(d.replaced||[]).length;
      setStatus('Đã ghi thành công — '+added+' ADD ON, '+replaced+' REPLACE');
      if(btn.parentNode) btn.parentNode.removeChild(btn);
    })
    .catch(function(e){
      btn.disabled=false; btn.textContent='Thử lại';
      setStatus('Lỗi kết nối: '+(e.message||'unknown'), true);
    });
  }

  function addConfirmBtn(records, container){
    var confirmable=records.filter(function(r){ return r.action==='add'||r.action==='replace'; });
    if(!confirmable.length) return;
    var row=document.createElement('div');
    row.className='iconfirm-row';
    var btn=document.createElement('button');
    btn.className='intake-confirm-btn';
    btn.textContent='Xác nhận ghi '+confirmable.length+' records vào sheet';
    btn.addEventListener('click', function(){ doConfirmRecords(confirmable, btn); });
    row.appendChild(btn);
    container.appendChild(row);
  }

  function renderResultsIn(records, container){
    var groups={add:[],replace:[],other:[]};
    records.forEach(function(r,i){
      if(r.action==='add') groups.add.push({r:r,i:i});
      else if(r.action==='replace') groups.replace.push({r:r,i:i});
      else groups.other.push({r:r,i:i});
    });
    var html='';
    if(groups.add.length)
      html+='<div class="iblock"><div class="iblock-hd iblock-add">ADD ON ('+groups.add.length+')</div>'+
        groups.add.map(function(x){return renderRecord(x.r,x.i);}).join('')+'</div>';
    if(groups.replace.length)
      html+='<div class="iblock"><div class="iblock-hd iblock-replace">REPLACE ('+groups.replace.length+')</div>'+
        groups.replace.map(function(x){return renderRecord(x.r,x.i);}).join('')+'</div>';
    if(groups.other.length)
      html+='<div class="iblock"><div class="iblock-hd iblock-check">NEED-CHECK ('+groups.other.length+') — sẽ bỏ qua</div>'+
        groups.other.map(function(x){return renderRecord(x.r,x.i);}).join('')+'</div>';
    container.innerHTML=html;
    addConfirmBtn(records, container);
  }

  var OR_MODELS=['meta-llama/llama-3.3-70b-instruct:free','google/gemma-4-31b-it:free','openai/gpt-oss-120b:free'];

  // Pass 1: extract structure only for flow nodes (detail fields filled in Pass 2)
  function buildPass1Prompt(docText, codes, today){
    var codeList=Object.keys(codes).join(', ');
    return 'Bạn là trợ lý xử lý policy cho AirTalk CS.\n\n'+
      '## Existing policy codes ('+Object.keys(codes).length+' codes):\n'+codeList+'\n\n'+
      '## Tài liệu mới:\n'+docText+'\n\n'+
      '## Nhiệm vụ:\nĐọc tài liệu, trích xuất từng tình huống/chính sách/bước quy trình, cấu trúc thành records 18 cột:\n'+
      'code | category | keyword | tags | summary_main | when_to_use | check | script_en | source_file | source_link | status | last_updated | hot | tree_code | node_id | node_type | options | flagged\n\n'+
      '## Quy tắc chung:\n'+
      '- status: luôn "needs-review", last_updated: '+today+'\n'+
      '- "add": code CHƯA CÓ → thêm mới; "replace": code ĐÃ CÓ → thay thế; "need-check": không chắc\n\n'+
      '## Policies thông thường: fill đầy đủ tất cả các cột.\n'+
      '- code: chữ thường, dùng dấu gạch ngang (vd: esim-transfer)\n'+
      '- tree_code, node_id, node_type, options: để trống\n\n'+
      '## Flow nodes — Pass 1 (chỉ cần cấu trúc, chi tiết sẽ fill ở Pass 2):\n'+
      '- tree_code: tên flow (vd: port-out-flow)\n'+
      '- node_id: id node trong flow (vd: n1, n2)\n'+
      '- code: tree_code+"_"+node_id (vd: port-out-flow_n1)\n'+
      '- node_type: "start"|"question"|"action"|"end"\n'+
      '- options: "Label → next_node_id" mỗi dòng 1 nhánh\n'+
      '- summary_main: 1 câu ngắn mô tả node\n'+
      '- Bỏ qua (để trống): keyword, tags, when_to_use, check, script_en\n\n'+
      'Trả về CHỈ JSON array, không markdown:\n'+
      '[{"action":"add","note":"lý do","record":{"code":"...","category":"...","keyword":"","tags":"","summary_main":"...","when_to_use":"","check":"","script_en":"","source_file":"...","source_link":"","status":"needs-review","last_updated":"'+today+'","hot":"","tree_code":"","node_id":"","node_type":"","options":"","flagged":""}}]';
  }

  // Pass 2: given confirmed skeleton, fill content fields for each node
  function buildPass2Prompt(skeleton, docText, today){
    var skelDesc=skeleton.map(function(r){
      var rec=r.record;
      return rec.code+'|'+rec.node_type+'|opts:'+rec.options+'|sum:'+rec.summary_main;
    }).join('\n');
    return 'Bạn là trợ lý AirTalk CS — Pass 2: fill chi tiết cho flow nodes.\n\n'+
      '## Skeleton đã xác nhận:\n'+skelDesc+'\n\n'+
      '## Tài liệu nguồn:\n'+docText+'\n\n'+
      '## Nhiệm vụ: với mỗi node, tìm trong tài liệu và fill:\n'+
      '- keyword: từ khoá tìm kiếm (phân cách bằng dấu phẩy)\n'+
      '- tags: nhãn phân loại\n'+
      '- summary_main: mô tả chi tiết hơn (có thể giữ nguyên nếu đã đủ)\n'+
      '- when_to_use: điều kiện / tình huống dẫn đến node này\n'+
      '- check: điều CS cần kiểm tra trước khi hành động\n'+
      '- script_en: câu nói/hỏi CS dùng tại node này\n'+
      '- category, source_file: nếu có trong tài liệu\n'+
      'Giữ nguyên: code, tree_code, node_id, node_type, options\n'+
      'Không tìm được → để trống, ĐỪNG bịa\n'+
      'status="needs-review", last_updated="'+today+'"\n\n'+
      'Trả về CHỈ JSON array REPLACE:\n'+
      '[{"action":"replace","note":"pass2 fill","record":{"code":"...","category":"...","keyword":"...","tags":"...","summary_main":"...","when_to_use":"...","check":"...","script_en":"...","source_file":"...","source_link":"","status":"needs-review","last_updated":"'+today+'","hot":"","tree_code":"...","node_id":"...","node_type":"...","options":"...","flagged":""}}]';
  }

  function callOrModel(prompt, orKey, modelIdx){
    if(modelIdx>=OR_MODELS.length) return Promise.reject(new Error('Tất cả AI models đang bận. Thử lại sau 1 phút.'));
    var model=OR_MODELS[modelIdx];
    return fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+orKey,'HTTP-Referer':'https://air-talk-ten.vercel.app'},
      body:JSON.stringify({model:model,messages:[{role:'user',content:prompt}],temperature:0.1,max_tokens:8192})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ return callOrModel(prompt, orKey, modelIdx+1); }
      var text=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||'';
      var m=text.match(/\[[\s\S]*\]/);
      if(!m) return callOrModel(prompt, orKey, modelIdx+1);
      return JSON.parse(m[0]);
    })
    .catch(function(){ return callOrModel(prompt, orKey, modelIdx+1); });
  }

  function normalizeRecords(records){
    return (records||[]).map(function(r){
      var rec=r.record||{};
      COLS.forEach(function(c){ if(rec[c]==null) rec[c]=''; });
      return {action:r.action||'need-check', note:r.note||'', record:rec};
    });
  }

  // ── Skeleton rendering ──

  function renderSkeletonNode(r, idx){
    var rec=r.record;
    var typeColors={start:'#3f9d6d',question:'#185FA5',action:'#b8770f',end:'#A32D2D'};
    var color=typeColors[rec.node_type]||'#6e7f76';
    var optLines=(rec.options||'').split('\n').filter(Boolean).map(function(l){
      return '<span class="iskel-opt">'+esc(l)+'</span>';
    }).join('');
    return '<div class="iskel-node" id="skel-node-'+idx+'">'+
      '<div class="iskel-node-hd">'+
      '<span class="iskel-ntype" style="background:'+color+'">'+esc(rec.node_type||'?')+'</span>'+
      '<span class="iskel-nid">'+esc(rec.node_id||'')+'</span>'+
      '<span class="iskel-nsum">'+esc(rec.summary_main||'')+'</span>'+
      '<button class="iskel-edit-btn" id="skel-edit-'+idx+'">Sửa</button>'+
      '</div>'+
      (optLines?'<div class="iskel-opts">'+optLines+'</div>':'')+
      '<div class="iskel-form" id="skel-form-'+idx+'" style="display:none">'+
      '<div class="iskel-field"><label>Node type</label>'+
      '<select id="skel-type-'+idx+'">'+
      ['start','question','action','end'].map(function(t){
        return '<option value="'+t+'"'+(rec.node_type===t?' selected':'')+'>'+t+'</option>';
      }).join('')+
      '</select></div>'+
      '<div class="iskel-field"><label>Summary (1 câu)</label>'+
      '<input id="skel-sum-'+idx+'" value="'+esc(rec.summary_main||'')+'"></div>'+
      '<div class="iskel-field"><label>Options (1 dòng/nhánh, vd: Có → n2)</label>'+
      '<textarea id="skel-opts-'+idx+'" rows="3">'+esc(rec.options||'')+'</textarea></div>'+
      '</div></div>';
  }

  function renderSkeleton(flowRecords, container){
    // Group nodes by tree_code
    var trees={};
    flowRecords.forEach(function(r,i){
      var tc=r.record.tree_code||'flow';
      if(!trees[tc]) trees[tc]=[];
      trees[tc].push({r:r,idx:i});
    });

    var html='<div class="iskel-wrap">'+
      '<div class="iskel-title">Cấu trúc Flow — Kiểm tra và chỉnh sửa trước khi fill chi tiết</div>';
    Object.keys(trees).forEach(function(tc){
      html+='<div class="iskel-tree">'+
        '<div class="iskel-tree-hd">'+esc(tc)+'<span class="iskel-count">'+trees[tc].length+' nodes</span></div>';
      trees[tc].forEach(function(x){ html+=renderSkeletonNode(x.r, x.idx); });
      html+='</div>';
    });
    html+='<div class="iskel-actions">'+
      '<button id="intakePass2Btn" class="intake-pass2-btn">⚡ Fill chi tiết (Pass 2)</button>'+
      '</div></div>';
    container.innerHTML=html;

    // Attach edit toggle + live-save listeners
    flowRecords.forEach(function(r,i){
      var editBtn=$i('skel-edit-'+i), form=$i('skel-form-'+i);
      if(editBtn&&form){
        editBtn.addEventListener('click', function(){
          var open=form.style.display!=='none';
          form.style.display=open?'none':'block';
          editBtn.textContent=open?'Sửa':'Đóng';
        });
      }
      [['skel-type-','node_type'],['skel-sum-','summary_main'],['skel-opts-','options']].forEach(function(pair){
        var el=$i(pair[0]+i);
        if(el) el.addEventListener('input', function(){ currentSkeleton[i].record[pair[1]]=el.value; });
      });
    });
    $i('intakePass2Btn').addEventListener('click', doPass2);
  }

  function doPass2(){
    var btn=$i('intakePass2Btn');
    if(btn){ btn.disabled=true; btn.textContent='AI đang fill chi tiết…'; }
    setStatus('Pass 2 — đang fill chi tiết cho '+currentSkeleton.length+' flow nodes…');

    var prompt=buildPass2Prompt(currentSkeleton, currentDocText, currentToday);
    callOrModel(prompt, currentOrKey, 0)
    .then(function(records){
      var recs=normalizeRecords(records);
      var iskelSec=$i('iskelSection');
      if(iskelSec){
        iskelSec.innerHTML='<div class="iskel-pass2-done">Pass 2 hoàn tất — '+recs.length+' nodes đã fill chi tiết</div>';
        renderResultsIn(recs, iskelSec);
      }
      setStatus('Pass 2 xong — '+recs.length+' flow nodes + '+currentPolicies.length+' policies sẵn sàng ghi');
    })
    .catch(function(e){
      if(btn){ btn.disabled=false; btn.textContent='⚡ Fill chi tiết (Pass 2)'; }
      setStatus('Lỗi Pass 2: '+(e.message||'unknown'), true);
    });
  }

  // ── Main analyze flow ──

  function doAnalyze(){
    if(!AUTH.token){ setStatus('Vui lòng đăng nhập trước.', true); return; }
    var url=($i('intakeUrl').value||'').trim();
    if(!url){ setStatus('Vui lòng nhập link Google Doc.', true); return; }

    var btn=$i('intakeBtn');
    btn.disabled=true; btn.textContent='Đang tải tài liệu…';
    setStatus('Bước 1/2 — Đang đọc Google Doc…');
    $i('intakeResult').innerHTML='';
    currentSkeleton=[]; currentPolicies=[];

    fetch('/api/intake',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:AUTH.token, docUrl:url})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ btn.disabled=false; btn.textContent='Phân tích'; setStatus('Lỗi: '+d.error, true); return; }
      currentDocText=d.docText; currentOrKey=d.orKey; currentCodes=d.codes||{}; currentToday=d.today;
      btn.textContent='Đang phân tích…';
      setStatus('Bước 2/2 — AI đang xử lý'+(d.truncated?' (doc dài, đã cắt 40K ký tự đầu)':'')+'…');
      return callOrModel(buildPass1Prompt(d.docText, d.codes, d.today), d.orKey, 0).then(function(records){
        btn.disabled=false; btn.textContent='Phân tích';
        var all=normalizeRecords(records);
        var flowRecords=all.filter(function(r){ return r.record.tree_code; });
        var policyRecords=all.filter(function(r){ return !r.record.tree_code; });
        currentSkeleton=flowRecords; currentPolicies=policyRecords;

        var resultEl=$i('intakeResult');
        resultEl.innerHTML='';

        if(flowRecords.length>0){
          setStatus('Phân tích xong — '+flowRecords.length+' flow nodes + '+policyRecords.length+' policies (kho: '+d.fpCount+')');
          var iskelSec=document.createElement('div');
          iskelSec.id='iskelSection';
          resultEl.appendChild(iskelSec);
          renderSkeleton(flowRecords, iskelSec);

          if(policyRecords.length>0){
            var ipolSec=document.createElement('div');
            ipolSec.id='ipolSection';
            ipolSec.style.marginTop='28px';
            var polHd=document.createElement('div');
            polHd.className='iskel-pol-hd';
            polHd.textContent='Policies thông thường ('+policyRecords.length+')';
            ipolSec.appendChild(polHd);
            resultEl.appendChild(ipolSec);
            renderResultsIn(policyRecords, ipolSec);
          }
        } else {
          setStatus('Phân tích xong — '+all.length+' records · không phát hiện flow nodes, bỏ qua skeleton (kho: '+d.fpCount+')');
          renderResultsIn(all, resultEl);
        }
      });
    })
    .catch(function(e){
      btn.disabled=false; btn.textContent='Phân tích';
      setStatus('Lỗi: '+(e.message||'unknown'), true);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    var btn=$i('intakeBtn');
    if(btn) btn.addEventListener('click', doAnalyze);
    var inp=$i('intakeUrl');
    if(inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter') doAnalyze(); });
  });
})();

