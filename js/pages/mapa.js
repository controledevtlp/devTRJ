/* ============================================================
 * Página: Mapa Operacional TRJ
 * ============================================================
 * Mapa Leaflet com dados de sites vindos da ponte local
 * (http://localhost:5057/api/mapa) que acessa o PHP interno
 * via VPN, ou fallback para dados importados do Genesis HTML.
 *
 * Exibe:
 *  • Marcadores dos sites fora (FLAG 1 por padrão)
 *  • Toggle FLAG 0 (demais sites)
 *  • Polylines enlaces MW (coloridas por fornecedor)
 *  • Marcadores Hub FO
 *  • Busca por site, END_ID ou cidade
 * ============================================================ */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants;

  var LS_COORDS   = 'trj_coordMap';
  var LS_MW       = 'trj_mwData';
  var LS_FO       = 'trj_foData';
  var LS_MARKERS  = 'trj_mapaMarkers';  // sites fora com coordenadas (markerData do Genesis)
  var PONTE_URL   = 'http://localhost:5057';

  // ── Cores exatas do mapa original ───────────────────────────
  var MW_CORES = {
    'NOKIA':    '#800080',
    'HUAWEI':   '#d20014',
    'CERAGON':  '#dcf014',
    'ERICSSON': '#000078',
    'SIAE':     '#14c8f0',
    'ZTE':      '#2ecc71',
    'default':  '#7f8c8d'
  };

  // ── Utilitários de storage ─────────────────────────────────
  function loadLS(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e){ return null; }
  }
  function saveLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){}
  }
  // Parseia coordenada com vírgula decimal, grau (°) e espaço-não-quebrável
  function parseCoord(v) {
    if (v == null) return NaN;
    return parseFloat(String(v).replace(/\u00a0/g,'').replace(/°/g,'').replace(',','.'));
  }

  function salvarMapaDados(coordMap, mwData, foData, markers) {
    saveLS(LS_COORDS, coordMap);
    saveLS(LS_MW, mwData);
    saveLS(LS_FO, foData);
    if (markers !== undefined) saveLS(LS_MARKERS, markers);
  }
  TRJ.mapaSetDados = salvarMapaDados;

  // ── Parsear Genesis Mapa HTML → markerData + mwData + foData + coordMap ──
  // markerData = sites fora com campos: NEName, Latitude, Longitude, ENDID, tempo, queda …
  // Antes só extraía coords de mwData/foData — agora extrai do markerData (fonte principal).
  function parseGenesisParaMapa(htmlText) {
    function cleanJSON(raw) { return raw.replace(/\u00a0/g,'').replace(/\\u00a0/g,''); }
    function extract(pattern) {
      var m = htmlText.match(pattern);
      if (!m) return [];
      try { return JSON.parse(cleanJSON(m[1])); } catch(e){ return []; }
    }

    var markerData = extract(/markerData\s*=\s*(\[[\s\S]*?\]);/);
    var mwData     = extract(/mwData\s*=\s*(\[[\s\S]*?\]);/);
    var foData     = extract(/foData\s*=\s*(\[[\s\S]*?\]);/);

    var coordMap = {};

    // 1) Sites fora — fonte principal (Latitude/Longitude capital, vírgula decimal)
    markerData.forEach(function(site) {
      var lat = parseCoord(site.Latitude  || site.latitude  || '');
      var lon = parseCoord(site.Longitude || site.longitude || '');
      var eid = String(site.ENDID || site.endId || '').trim();
      if (eid && !isNaN(lat) && !isNaN(lon) && lat && lon && !coordMap[eid]) {
        coordMap[eid] = [lat, lon];
      }
    });

    // 2) Extremos dos enlaces MW (LAT_A/LONG_A … LAT_B/LONG_B)
    mwData.forEach(function(link) {
      var parts = (link.Enlace2||'').split(' - ').map(function(p){ return p.trim(); }).filter(Boolean);
      var coords = [
        [parseCoord(link.LAT_A), parseCoord(link.LONG_A)],
        [parseCoord(link.LAT_B), parseCoord(link.LONG_B)]
      ];
      parts.slice(0,2).forEach(function(eid, idx) {
        var lat = coords[idx][0], lon = coords[idx][1];
        if (eid && !isNaN(lat) && !isNaN(lon) && lat && lon && !coordMap[eid]) {
          coordMap[eid] = [lat, lon];
        }
      });
    });

    // 3) Hubs FO
    foData.forEach(function(hub) {
      var m2 = (hub.HUB||'').match(/\((\w+)\)/);
      var eid = m2 ? m2[1] : (hub.NEName||'');
      var lat = parseCoord(hub.LAT_A), lon = parseCoord(hub.LONG_A);
      if (eid && !isNaN(lat) && !isNaN(lon) && lat && lon && !coordMap[eid]) {
        coordMap[eid] = [lat, lon];
      }
    });

    salvarMapaDados(coordMap, mwData, foData, markerData);
    return {
      coordMap: coordMap, mwData: mwData, foData: foData, markerData: markerData,
      coordCount: Object.keys(coordMap).length, siteCount: markerData.length
    };
  }
  TRJ.mapaParseGenesis = parseGenesisParaMapa;

  // ── PÁGINA ─────────────────────────────────────────────────
  TRJ.pages.mapa = function(container, ctx) {
    var data      = ctx.data || {};
    var readOnly  = !!ctx.readOnly;
    var incidents = data.incidentsEnriched || [];
    var tasks     = data.tasksEnriched     || [];

    // Dados de mapa: contexto > localStorage > estáticos embutidos > vazio
    var coordMap = ctx.mapaCoordMap || loadLS(LS_COORDS) || TRJ.defaultCoordMap || {};
    var mapaMarkers = loadLS(LS_MARKERS) || [];

    // mwData e foData: formato compacto [la,loa,lb,lob,enlace2,forn] → normalizar para objetos
    function _normMw(x) {
      if (!Array.isArray(x)) return x;
      return { LAT_A: x[0], LONG_A: x[1], LAT_B: x[2], LONG_B: x[3], Enlace: x[4], Enlace2: x[4], FORNECEDOR: x[5] };
    }
    function _normFo(x) {
      if (!Array.isArray(x)) return x;
      return { LAT_A: x[0], LONG_A: x[1], HUB: x[2], NEName: x[3] };
    }
    var rawMw = ctx.mapaMwData || loadLS(LS_MW) || TRJ.defaultMwData || [];
    var rawFo = ctx.mapaFoData || loadLS(LS_FO) || TRJ.defaultFoData || [];
    var mwData = rawMw.map(_normMw);
    var foData = rawFo.map(_normFo);

    // ── Construir lookup ENDID → {site} a partir das tarefas ─
    var siteByEndId = {};
    tasks.forEach(function(t) {
      var eid = (t.enderecoId||'').trim();
      if (eid && !siteByEndId[eid]) siteByEndId[eid] = t.siteId || '';
    });
    incidents.forEach(function(i) {
      var eid = (i.enderecoId||i.endId||'').trim();
      if (eid && !siteByEndId[eid]) siteByEndId[eid] = i.site || '';
    });

    // Estado do mapa
    var mapState = { showFlag0: false, showMW: true, showFO: false, flagFilter: '1' };
    var mapInstance = null, layers = {};
    var sitesFlag1 = [], sitesFlag0Raw = [];

    // ── Geocodificação TSK (Nominatim) — cache em localStorage ───────────
    var GEO_CACHE_KEY = 'trj_geo_cache';
    var geoCache = (function() { try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||'{}'); } catch(e){ return {}; } })();
    function geocodificarEndereco(logradouro, cidade, bairro, cb) {
      var q = [logradouro, bairro, cidade, 'Brasil'].filter(Boolean).join(', ');
      if (geoCache[q]) { cb(null, geoCache[q]); return; }
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
        headers: { 'Accept-Language': 'pt-BR,pt', 'User-Agent': 'ControleTRJ/1.0' }
      })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (!data || !data.length) { cb('Não encontrado'); return; }
        var res = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
        try { geoCache[q] = res; localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache)); } catch(e){}
        cb(null, res);
      })
      .catch(function(e){ cb('Erro na geocodificação: ' + e.message); });
    }

    // ── Rota / distância ─────────────────────────────────────────────────
    var rotaLayer = null;
    var rotaPainelEl = null;
    function haversineKm(lat1, lon1, lat2, lon2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    function fmtTempo(seg) {
      if (seg < 60) return seg + 's';
      var m = Math.round(seg/60); if (m < 60) return m + 'min';
      return Math.floor(m/60) + 'h' + (m%60 ? (m%60)+'min' : '');
    }

    // ── Header ─────────────────────────────────────────────────
    container.appendChild(U.pageHeader('Mapa Operacional',
      'Sites fora georreferenciados, enlaces MW e hubs FO em tempo real.'));

    // ── Barra de controles ─────────────────────────────────────
    var searchInput = U.h('input', {
      class: 'trj-input',
      placeholder: 'Buscar por site, END_ID ou cidade...',
      style: { flex: '1', maxWidth: '340px', fontSize: '13px' }
    });

    function mkCheck(label) {
      var chk = U.h('input', { type: 'checkbox' });
      var lbl = U.h('label', { style: { display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',whiteSpace:'nowrap' }}, [chk, U.h('span',{text:label})]);
      return { chk: chk, el: lbl };
    }

    var ckFlag0 = mkCheck('FLAG 0 (demais sites)');
    var ckMW    = mkCheck('Enlaces MW'); ckMW.chk.checked = true;
    var ckFO    = mkCheck('Hubs FO');

    var statsEl = U.h('div', { style: { fontSize:'12px', color:'var(--trj-muted)', display:'flex', gap:'14px', flexWrap:'wrap', alignItems:'center' } });

    // Botão buscar via ponte
    var btnPonte = U.h('button', {
      class: 'trj-btn trj-btn-primary clickable',
      style: { fontSize:'12px', padding:'4px 14px', display:'inline-flex', alignItems:'center', gap:'6px' }
    }, [U.h('span',{text:'Buscar sites (ponte + VPN)' })]);

    // Botão importar HTML (fallback)
    var btnImport = U.h('button', {
      class: 'trj-btn trj-btn-ghost clickable',
      style: { fontSize:'12px', padding:'4px 12px', display:'inline-flex', alignItems:'center', gap:'6px', opacity:'0.8' }
    }, [U.h('span',{text:'Importar Genesis HTML' })]);
    var fileInput = U.h('input', { type:'file', accept:'.html,.htm', style:{ display:'none' } });
    container.appendChild(fileInput);

    var ctrlBar = U.h('div', {
      style: { display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'10px',
               padding:'10px 14px', background:'var(--trj-card)', borderRadius:'10px', border:'1px solid var(--trj-border)',
               position:'relative', zIndex:'1' }
    }, [searchInput, ckFlag0.el, ckMW.el, ckFO.el]
       .concat(readOnly ? [] : [U.h('div', {style:{marginLeft:'auto',display:'flex',gap:'8px'}}, [btnPonte, btnImport])]));

    container.appendChild(ctrlBar);
    container.appendChild(statsEl);

    // ── Painel de rota ────────────────────────────────────────────────────
    (function buildRotaPanel() {
      var letras = 'ABCDEFGHIJKLMNOP';
      var expanded = false;
      var pontoInputs = []; // {inp, el}

      // Datalist com todos os ENDIDs + nome
      var dlId = 'rota-sites-dl';
      if (!document.getElementById(dlId)) {
        var dl = document.createElement('datalist');
        dl.id = dlId;
        Object.keys(coordMap).forEach(function(eid) {
          var opt = document.createElement('option');
          opt.value = eid + (siteByEndId[eid] ? ' — ' + siteByEndId[eid] : '');
          dl.appendChild(opt);
        });
        document.body.appendChild(dl);
      }

      var pontosWrap = U.h('div', { style: { display:'flex', flexDirection:'column', gap:'5px' } });
      var resultDiv  = U.h('div', { style: { display:'none', marginTop:'8px', fontSize:'12px' } });

      function criarLinhaPonto(idx) {
        var inp = U.h('input', {
          type: 'text', list: dlId,
          placeholder: 'ENDID ou nome do site...',
          style: { flex:'1', background:'var(--trj-card2)', border:'1px solid var(--trj-border)',
                   borderRadius:'6px', color:'var(--trj-fg)', padding:'4px 8px', fontSize:'12px',
                   outline:'none' }
        });
        var btnX = U.h('button', {
          style: { background:'none', border:'none', color:'var(--trj-muted)', cursor:'pointer', fontSize:'15px', lineHeight:'1', padding:'0 4px', flexShrink:'0' },
          text: '×'
        });
        var badge = U.h('span', {
          style: { fontSize:'11px', fontWeight:'700', color:'var(--trj-primary)', width:'16px', textAlign:'center', flexShrink:'0' },
          text: letras[idx] || String(idx+1)
        });
        var linha = U.h('div', { style: { display:'flex', alignItems:'center', gap:'6px' } },
          [badge, inp, btnX]);
        var entry = { inp: inp, el: linha, badge: badge };
        pontoInputs.push(entry);

        btnX.addEventListener('click', function() {
          var i = -1;
          for (var j=0;j<pontoInputs.length;j++) { if (pontoInputs[j].el === linha) { i=j; break; } }
          if (pontoInputs.length > 2 && i >= 0) {
            pontoInputs.splice(i,1);
            pontosWrap.removeChild(linha);
            for (var k=0;k<pontoInputs.length;k++) pontoInputs[k].badge.textContent = letras[k]||String(k+1);
          } else { inp.value = ''; }
        });
        return linha;
      }

      pontosWrap.appendChild(criarLinhaPonto(0));
      pontosWrap.appendChild(criarLinhaPonto(1));

      var btnAdd = U.h('button', {
        class: 'trj-btn trj-btn-ghost clickable',
        style: { fontSize:'11px', padding:'2px 10px' }, text: '+ Adicionar ponto'
      });
      var btnCalc = U.h('button', {
        class: 'trj-btn trj-btn-primary clickable',
        style: { fontSize:'11px', padding:'2px 12px' }, text: 'Calcular Rota'
      });
      var btnLimpar = U.h('button', {
        class: 'trj-btn trj-btn-ghost clickable',
        style: { fontSize:'11px', padding:'2px 10px' }, text: 'Limpar'
      });

      btnAdd.addEventListener('click', function() {
        if (pontoInputs.length >= 8) { U.toast('Máximo de 8 pontos.', 'err'); return; }
        var novaLinha = criarLinhaPonto(pontoInputs.length);
        pontosWrap.appendChild(novaLinha);
      });

      function parseEid(val) {
        val = (val||'').trim();
        var sep = val.indexOf(' — ');
        return (sep > 0 ? val.substring(0, sep) : val).trim();
      }

      btnCalc.addEventListener('click', function() {
        var pts = [];
        pontoInputs.forEach(function(p) {
          var eid = parseEid(p.inp.value);
          if (!eid) return;
          var c = coordMap[eid];
          if (!c) {
            var low = eid.toLowerCase();
            var keys = Object.keys(coordMap);
            for (var i=0;i<keys.length;i++) { if (keys[i].toLowerCase()===low) { c=coordMap[keys[i]]; eid=keys[i]; break; } }
          }
          if (!c) { U.toast('Site "'+eid+'" não encontrado.','err'); return; }
          pts.push({ lat:c[0], lon:c[1], nome: eid+(siteByEndId[eid]?' — '+siteByEndId[eid]:'') });
        });
        if (pts.length < 2) { U.toast('Informe pelo menos 2 sites válidos.','err'); return; }
        calcularRota(pts, resultDiv);
      });

      btnLimpar.addEventListener('click', function() {
        pontoInputs.forEach(function(p){ p.inp.value=''; });
        while (pontoInputs.length > 2) { pontosWrap.removeChild(pontoInputs.pop().el); }
        for (var k=0;k<pontoInputs.length;k++) pontoInputs[k].badge.textContent=letras[k];
        if (rotaLayer) { rotaLayer.remove(); rotaLayer=null; }
        resultDiv.style.display='none'; resultDiv.innerHTML='';
      });

      var acoesEl = U.h('div', { style:{display:'flex',gap:'8px',alignItems:'center',marginTop:'6px',flexWrap:'wrap'} },
        [btnAdd, btnCalc, btnLimpar]);

      var bodyEl = U.h('div', { style:{marginTop:'8px',display:'none'} }, [pontosWrap, acoesEl, resultDiv]);

      var toggleBtn = U.h('button', {
        style:{background:'none',border:'none',color:'var(--trj-muted)',cursor:'pointer',fontSize:'12px',padding:'0'},
        text: '▸'
      });

      var headerEl = U.h('div', {
        style:{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}
      }, [
        U.h('span',{style:{fontSize:'12px',fontWeight:'600',color:'var(--trj-fg)'},text:'📏 Calcular Rota de Atendimento'}),
        toggleBtn
      ]);
      headerEl.addEventListener('click', function() {
        expanded = !expanded;
        bodyEl.style.display = expanded ? '' : 'none';
        toggleBtn.textContent = expanded ? '▾' : '▸';
      });

      rotaPainelEl = U.h('div', {
        style:{background:'var(--trj-card)',border:'1px solid var(--trj-border)',borderRadius:'8px',
               padding:'10px 14px',marginTop:'6px',marginBottom:'2px',position:'relative',zIndex:'1'}
      }, [headerEl, bodyEl]);
      container.appendChild(rotaPainelEl);
    })();

    // ── Container do mapa ──────────────────────────────────────
    // z-index do mapa menor que a sidebar (a sidebar usa z-index 200+)
    var mapDiv = U.h('div', {
      id: 'trj-mapa-leaflet',
      style: { height:'65vh', borderRadius:'12px', overflow:'hidden',
               border:'1px solid var(--trj-border)', marginTop:'10px',
               position:'relative', zIndex:'0' }
    });
    container.appendChild(mapDiv);

    // ── Legenda completa ───────────────────────────────────────
    var legItems = [
      { cor:'#e74c3c', shape:'circle', label:'Site fora — sem TSK' },
      { cor:'#3498db', shape:'circle', label:'Site fora — com TSK' },
      { cor:'#f0b429', shape:'circle', label:'Site fora — recente (<1h)' },
      { cor:'#888',    shape:'circle', label:'FLAG 0 (demais sites)' },
      { cor:'#800080', shape:'line', label:'MW Nokia' },
      { cor:'#d20014', shape:'line', label:'MW Huawei' },
      { cor:'#dcf014', shape:'line', label:'MW Ceragon' },
      { cor:'#000078', shape:'line', label:'MW Ericsson' },
      { cor:'#14c8f0', shape:'line', label:'MW SIAE' },
      { cor:'#2ecc71', shape:'square', label:'Hub FO' },
      { cor:'#aaa', shape:'thickline', label:'Linha grossa = enlace de site fora', noClick:true },
    ];
    var legEl = U.h('div', { style: { display:'flex', gap:'12px', flexWrap:'wrap', marginTop:'8px', fontSize:'11px', color:'var(--trj-muted)' } },
      legItems.map(function(item) {
        var ico;
        if (item.shape === 'thickline') {
          ico = U.h('span', { style: { width:'24px', height:'5px', background:item.cor, display:'inline-block', verticalAlign:'middle', borderRadius:'2px' } });
        } else if (item.shape === 'line') {
          ico = U.h('span', { style: { width:'24px', height:'3px', background:item.cor, display:'inline-block', verticalAlign:'middle' } });
        } else if (item.shape === 'square') {
          ico = U.h('span', { style: { width:'10px', height:'10px', background:item.cor, display:'inline-block', borderRadius:'2px', border:'1px solid #fff' } });
        } else {
          ico = U.h('span', { style: { width:'10px', height:'10px', borderRadius:'50%', background:item.cor, display:'inline-block', border:'1px solid rgba(255,255,255,.4)' } });
        }
        return U.h('div', { style: { display:'flex', alignItems:'center', gap:'5px', opacity: item.noClick ? '0.7' : '1' } }, [ico, U.h('span',{text:item.label})]);
      }));
    // Associar cliques nas legendas aos toggles de camada
    container.appendChild(legEl);
    // Usar children diretos para não capturar divs aninhados (causariam retângulos brancos)
    Array.prototype.forEach.call(legEl.children, function(el, idx) {
      var item = legItems[idx];
      if (!item || item.noClick) { return; }
      el.style.cursor = 'pointer';
      el.style.userSelect = 'none';
      el.title = 'Clique para mostrar/ocultar';
      el.addEventListener('click', function() {
        if (idx <= 2) {
          // Sites fora FLAG 1 — toggle mostra/oculta layer
          if (mapInstance) {
            if (mapInstance.hasLayer(layers.flag1)) layers.flag1.remove();
            else layers.flag1.addTo(mapInstance);
          }
        } else if (idx === 3) {
          // FLAG 0
          ckFlag0.chk.checked = !ckFlag0.chk.checked;
          ckFlag0.chk.dispatchEvent(new Event('change'));
        } else if (idx >= 4 && idx <= 8) {
          // Links MW — toggle geral (afeta mwFlag1 e, se FLAG0 ativo, mwFlag0)
          ckMW.chk.checked = !ckMW.chk.checked;
          ckMW.chk.dispatchEvent(new Event('change'));
        } else if (idx === 9) {
          // Hubs FO
          ckFO.chk.checked = !ckFO.chk.checked;
          ckFO.chk.dispatchEvent(new Event('change'));
        }
      });
    });

    // ── Inicializar Leaflet ───────────────────────────────────
    function getLeaflet(cb) {
      if (window.L) { cb(); return; }
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      js.onload = cb; document.head.appendChild(js);
    }

    function initMap() {
      if (mapInstance) return;
      mapInstance = window.L.map('trj-mapa-leaflet', { preferCanvas: true, zoomControl: true })
        .setView([-22.3, -43.1], 8);

      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapInstance);

      // Garante re-render correto ao exibir em aba SPA (container pode estar oculto no primeiro render)
      setTimeout(function() { mapInstance.invalidateSize(); }, 250);

      layers.flag1 = window.L.layerGroup().addTo(mapInstance);
      layers.flag0 = window.L.layerGroup();
      layers.mw    = window.L.layerGroup().addTo(mapInstance);      // mantido por compatibilidade (não usado diretamente)
      layers.mwFlag1 = window.L.layerGroup().addTo(mapInstance);    // enlaces conectados a sites FORA (FLAG 1) — sempre visível
      layers.mwFlag0 = window.L.layerGroup();                        // demais enlaces — só visível se FLAG 0 também estiver ativo
      layers.fo    = window.L.layerGroup();

      // Eventos de toggle
      ckFlag0.chk.addEventListener('change', function() {
        if (ckFlag0.chk.checked) {
          layers.flag0.addTo(mapInstance);
          if (ckMW.chk.checked) layers.mwFlag0.addTo(mapInstance);
        } else {
          layers.flag0.remove();
          layers.mwFlag0.remove();
        }
      });
      ckMW.chk.addEventListener('change', function() {
        if (ckMW.chk.checked) {
          layers.mwFlag1.addTo(mapInstance);
          if (ckFlag0.chk.checked) layers.mwFlag0.addTo(mapInstance);
        } else {
          layers.mwFlag1.remove();
          layers.mwFlag0.remove();
        }
      });
      ckFO.chk.addEventListener('change',   function() { if(ckFO.chk.checked)    layers.fo.addTo(mapInstance);    else layers.fo.remove(); });

      // Busca em tempo real
      var timer = null;
      searchInput.addEventListener('input', function() {
        clearTimeout(timer);
        timer = setTimeout(function() { filtrarMarcadores(searchInput.value.trim().toLowerCase()); }, 200);
      });

    }

    // ── Calcular rota real via OSRM com polyline no mapa ────────────────
    function calcularRota(pts, resultDiv) {
      if (!mapInstance || pts.length < 2) return;
      if (rotaLayer) { rotaLayer.remove(); rotaLayer = null; }
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<span style="color:var(--trj-muted)">⏳ Calculando rota...</span>';

      var waypoints = pts.map(function(p){ return p.lon+','+p.lat; }).join(';');
      var url = 'https://router.project-osrm.org/route/v1/driving/'+waypoints+'?overview=full&geometries=geojson&steps=false';

      fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(data){
          if (!data.routes || !data.routes.length) throw new Error('sem_rota');
          var rota = data.routes[0];
          var geom = rota.geometry.coordinates; // [[lon,lat],...]
          var latlngs = geom.map(function(c){ return [c[1],c[0]]; });

          rotaLayer = window.L.polyline(latlngs, { color:'#ff8c00', weight:5, opacity:0.88 }).addTo(mapInstance);
          mapInstance.fitBounds(rotaLayer.getBounds().pad(0.15), { maxZoom:14 });

          var legs = rota.legs || [];
          var html = '<div style="border-radius:6px;overflow:hidden;border:1px solid var(--trj-border)">';
          var totDist=0, totDur=0;
          legs.forEach(function(leg,i){
            var km=(leg.distance/1000).toFixed(1);
            var t=fmtTempo(Math.round(leg.duration));
            totDist+=leg.distance; totDur+=leg.duration;
            html+='<div style="padding:5px 10px;border-bottom:1px solid var(--trj-border);display:flex;gap:10px;align-items:baseline">'
              +'<b style="color:var(--trj-primary);white-space:nowrap">'+'ABCDEFGHIJKLMNOP'[i]+' → '+'ABCDEFGHIJKLMNOP'[i+1]+'</b>'
              +'<span style="color:var(--trj-muted);font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
              +pts[i].nome+' → '+pts[i+1].nome+'</span>'
              +'<span style="color:#2ecc71;white-space:nowrap">🚗 '+km+' km</span>'
              +' <span style="color:#3498db;white-space:nowrap">⏱ '+t+'</span>'
              +'</div>';
          });
          if (legs.length>1) {
            html+='<div style="padding:5px 10px;background:var(--trj-card2);display:flex;gap:14px;font-weight:700">'
              +'<span>Total</span>'
              +'<span style="color:#2ecc71">🚗 '+(totDist/1000).toFixed(1)+' km</span>'
              +'<span style="color:#3498db">⏱ '+fmtTempo(Math.round(totDur))+'</span>'
              +'</div>';
          }
          html+='</div>';
          resultDiv.innerHTML = html;
        })
        .catch(function(){
          // Fallback: linha reta com Haversine
          var html='<div style="color:var(--trj-muted);font-size:11px;margin-bottom:4px">OSRM indisponível — distância em linha reta:</div>'
            +'<div style="border-radius:6px;overflow:hidden;border:1px solid var(--trj-border)">';
          var totKm=0;
          var latlngs = pts.map(function(p){ return [p.lat,p.lon]; });
          for (var i=0;i<pts.length-1;i++){
            var km=haversineKm(pts[i].lat,pts[i].lon,pts[i+1].lat,pts[i+1].lon);
            totKm+=km;
            html+='<div style="padding:5px 10px;border-bottom:1px solid var(--trj-border);display:flex;gap:10px">'
              +'<b style="color:var(--trj-primary)">'+'ABCDEFGH'[i]+' → '+'ABCDEFGH'[i+1]+'</b>'
              +'<span style="color:var(--trj-muted);flex:1">'+pts[i].nome+' → '+pts[i+1].nome+'</span>'
              +'<span style="color:var(--trj-primary)">~'+km.toFixed(1)+' km (reta)</span>'
              +'</div>';
          }
          if (pts.length>2) html+='<div style="padding:5px 10px;font-weight:700">Total reta: ~'+totKm.toFixed(1)+' km</div>';
          html+='</div>';
          resultDiv.innerHTML=html;
          rotaLayer=window.L.polyline(latlngs,{color:'#ff8c00',weight:3,dashArray:'6,4',opacity:0.8}).addTo(mapInstance);
          mapInstance.fitBounds(rotaLayer.getBounds().pad(0.15),{maxZoom:14});
        });
    }

    function filtrarMarcadores(q) {
      if (!layers.flag1) return;
      var matched = [];
      // Filtrar marcadores de incidentes (FLAG 1)
      Object.values(layers.flag1._layers || {}).forEach(function(m) {
        var d = m._d || {};
        var ok = !q || (d.eid||'').toLowerCase().indexOf(q)>=0
               || (d.site||'').toLowerCase().indexOf(q)>=0
               || (d.cidade||'').toLowerCase().indexOf(q)>=0;
        m.setOpacity(ok ? 1 : 0.07);
        if (ok) matched.push(m);
      });
      // Filtrar Hub FO na busca
      Object.values(layers.fo && layers.fo._layers ? layers.fo._layers : {}).forEach(function(m) {
        var d = m._d || {};
        var ok = !q || (d.eid||'').toLowerCase().indexOf(q) >= 0
               || (d.nome||'').toLowerCase().indexOf(q) >= 0;
        if (m.setOpacity) { m.setOpacity(ok ? 1 : 0.07); }
        else if (m.setStyle) { m.setStyle({ fillOpacity: ok ? 0.85 : 0.05, opacity: ok ? 1 : 0.05 }); }
        if (ok && mapInstance && mapInstance.hasLayer(layers.fo)) { matched.push(m); }
      });
      // Zoom nos resultados
      if (q && matched.length > 0 && matched.length <= 30 && mapInstance) {
        var bounds = window.L.latLngBounds(matched.map(function(m){ return m.getLatLng(); }));
        mapInstance.fitBounds(bounds.pad(0.3), { maxZoom: 14 });
      } else if (!q) {
        Object.values(layers.flag1._layers || {}).forEach(function(m){ m.setOpacity(1); });
        Object.values((layers.fo && layers.fo._layers) || {}).forEach(function(m){
          if (m.setOpacity) m.setOpacity(1);
          else if (m.setStyle) m.setStyle({ fillOpacity: 0.85, opacity: 1 });
        });
      }
    }

    // ── Ícone DIV customizado ─────────────────────────────────
    function divIcon(cor, sz, shape) {
      sz = sz || 14;
      var html;
      if (shape === 'square') {
        html = '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' + cor + ';border:2px solid #fff;border-radius:3px;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>';
      } else {
        html = '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' + cor + ';border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px ' + cor + '88"></div>';
      }
      return window.L.divIcon({ html:html, className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2], popupAnchor:[0,-sz/2] });
    }

    // ── Renderizar sites (markerData vindos da ponte ou do coordMap) ──
    function renderSites(sitesList) {
      if (!mapInstance) return;
      layers.flag1.clearLayers();
      layers.flag0.clearLayers();

      var cTSK = 0, cSemCoord = 0;
      var tasksAtivas = tasks.filter(function(t){
        var s=(t.status||'').toUpperCase().trim(); return s==='NÃO INICIADO'||s==='NAO INICIADO'||s==='INICIADO';
      });

      function _getFlag(s) {
        var f = (s.flag !== undefined) ? s.flag : ((s.FLAG !== undefined) ? s.FLAG : 1);
        return String(f);
      }
      sitesFlag1 = sitesList.filter(function(s){ return _getFlag(s) === '1'; });
      sitesFlag0Raw = sitesList.filter(function(s){ return _getFlag(s) === '0'; });

      sitesFlag1.forEach(function(site) {
        var lat = parseCoord(site.Latitude || site.latitude || site.lat || '');
        var lon = parseCoord(site.Longitude || site.longitude || site.lon || '');
        if (isNaN(lat) || isNaN(lon)) { cSemCoord++; return; }

        var eid    = (site.ENDID || site.endId || '').trim();
        var nome   = site.NEName || site.nome || siteByEndId[eid] || eid;
        var cidade = site.municipio || site.cidade || '';

        // Verificar TSK aberta
        var incMatch = incidents.filter(function(i){ return i.enderecoId === eid; })[0];
        var tsk = (incMatch && U.tskAberta) ? U.tskAberta(incMatch, tasksAtivas) : null;
        if (tsk) cTSK++;

        // Cor baseada no tempo (como o original)
        var tempo = parseInt(site.tempo || '99', 10);
        var cor = tsk ? '#3498db' : (tempo === 0 ? '#f0b429' : '#e74c3c');

        var marker = window.L.marker([lat, lon], { icon: divIcon(cor, 14) });
        marker._d = { eid:eid, site:nome, cidade:cidade, lat:lat, lon:lon };

        // Monta endereço TSK se disponível
        var tskEnd = tsk ? ((tsk.enderecoLogradouro||'') + (tsk.bairro ? ', '+tsk.bairro : '') + (tsk.cidade ? ' - '+tsk.cidade : '')) : '';
        tskEnd = tskEnd.trim().replace(/^[,\s-]+|[,\s-]+$/g,'');

        var popId = 'pop_' + eid.replace(/\W/g,'_');
        var popContent = '<div id="' + popId + '" style="font:12px ui-monospace,monospace;min-width:210px">'
          + '<b style="color:' + cor + ';font-size:13px">' + nome + '</b><br>'
          + '<span style="color:#888">END_ID:</span> ' + eid + '<br>'
          + (cidade ? '<span style="color:#888">Cidade:</span> ' + cidade + '<br>' : '')
          + '<span style="color:#888">Queda:</span> ' + (site.queda||'—') + '<br>'
          + (site.evento ? '<span style="color:#888">Evento:</span> ' + site.evento + '<br>' : '')
          + (site.previsao ? '<span style="color:#888">Previsão:</span> ' + site.previsao + '<br>' : '')
          + (site.celulas ? '<span style="color:#888">Células:</span> ' + site.celulas + '<br>' : '')
          + (tsk
              ? '<b style="color:#3498db">TSK: ' + tsk.osNumero + '</b>'
                + (tskEnd ? '<br><span style="color:#888">📍 Endereço TSK:</span> ' + tskEnd
                   + '<br><button onclick="(function(){' +
                     'var el=document.getElementById(\'' + popId + '\');' +
                     'var btn=el.querySelector(\'.geo-btn\');btn.textContent=\'Geocodificando...\';btn.disabled=true;' +
                     'TRJ._geocodTSK(\'' + eid + '\',' + lat + ',' + lon + ',\'' + encodeURIComponent(tsk.enderecoLogradouro||'') + '\',\'' + encodeURIComponent(tsk.cidade||'') + '\',\'' + encodeURIComponent(tsk.bairro||'') + '\', el);' +
                   '})()" class="geo-btn" style="margin-top:4px;font-size:10px;padding:2px 7px;background:rgba(52,152,219,.15);color:#3498db;border:1px solid #3498db;border-radius:4px;cursor:pointer">📍 Ver endereço no mapa</button>'
                   : '')
              : '<span style="color:#e74c3c">Sem TSK aberta</span>')
          + '</div>';
        marker.bindPopup(popContent, { maxWidth: 300 });
        marker.bindTooltip(nome + ' (' + eid + ')', { direction:'top' });
        marker.addTo(layers.flag1);
      });

      // FLAG 0
      sitesFlag0Raw.forEach(function(site) {
        var lat = parseCoord(site.Latitude||site.latitude||site.lat||'');
        var lon = parseCoord(site.Longitude||site.longitude||site.lon||'');
        if (isNaN(lat) || isNaN(lon)) return;
        var eid  = (site.ENDID||site.endId||'').trim();
        var nome = site.NEName || site.nome || siteByEndId[eid] || eid;
        var m = window.L.circleMarker([lat,lon], { radius:4, color:'#555', fillColor:'#777', fillOpacity:0.5, weight:1 });
        m._d = { eid:eid, site:nome, cidade:site.municipio||'' };
        m.bindTooltip(nome + ' (' + eid + ')', { direction:'top' });
        m.addTo(layers.flag0);
      });

      updateStats(sitesFlag1.length, cTSK, cSemCoord);
    }

    // ── Renderizar MW + FO (static, from stored data) ──────────
    // Retorna o conjunto de END_IDs atualmente em FLAG 1 (incidentes ativos)
    function getEidsAtivos() {
      var eidsAtivos = {};
      incidents.forEach(function(i) {
        if ((i.statusTrat||'').toUpperCase() === 'RESOLVIDO') return;
        var eid = (i.enderecoId||'').trim();
        if (eid) eidsAtivos[eid] = true;
      });
      // Também considera os sites vindos da ponte, se disponíveis
      sitesFlag1.forEach(function(s) {
        var eid = (s.ENDID||s.endId||'').trim();
        if (eid) eidsAtivos[eid] = true;
      });
      return eidsAtivos;
    }

    function renderEstaticos() {
      if (!mapInstance) return;
      layers.mwFlag1.clearLayers();
      layers.mwFlag0.clearLayers();
      layers.fo.clearLayers();

      var eidsAtivos = getEidsAtivos();

      mwData.forEach(function(link) {
        function pc(s){ try { return parseFloat(String(s).replace(/\u00a0/g,'').replace(',','.')); } catch(e){ return null; } }
        var latA=pc(link.LAT_A), lonA=pc(link.LONG_A), latB=pc(link.LAT_B), lonB=pc(link.LONG_B);
        if (!latA||!lonA||!latB||!lonB) return;
        var forn  = (link.FORNECEDOR||'').toUpperCase();
        var cor   = MW_CORES[forn] || MW_CORES.default;
        var enlace = (link.Enlace&&link.Enlace.trim().length>5) ? link.Enlace : (link.Enlace2||'');

        // Verifica se algum dos dois lados do enlace conecta a um site em FLAG 1
        var parts = (link.Enlace2||'').split(' - ').map(function(p){ return p.trim(); });
        var conectaFlag1 = parts.some(function(eid){ return eidsAtivos[eid]; });

        var line = window.L.polyline([[latA,lonA],[latB,lonB]], {
          color:cor, weight: conectaFlag1 ? 6 : 5, opacity: conectaFlag1 ? 0.85 : 0.5,
          dashArray: forn==='CERAGON'?'6,4':null
        });
        line.bindPopup('<b>Enlace:</b> ' + enlace + '<br><b>Fornecedor:</b> ' + (link.FORNECEDOR||'—')
          + (link.PROJETO ? '<br><b>Projeto:</b> ' + link.PROJETO : '')
          + (conectaFlag1 ? '<br><span style="color:#e74c3c">⬤ Conectado a site fora</span>' : ''), { maxWidth:240 });

        // Prioritário (conecta a FLAG 1) fica sempre na camada visível por padrão.
        // Demais só aparecem quando FLAG 0 também estiver ativo.
        if (conectaFlag1) line.addTo(layers.mwFlag1);
        else line.addTo(layers.mwFlag0);
      });

      // Hub FO: vermelho se tem TSK aberta para o END_ID do hub
      foData.forEach(function(hub) {
        function pc(s){ try { return parseFloat(String(s).replace(/\u00a0/g,'').replace(',','.')); } catch(e){ return null; } }
        var lat=pc(hub.LAT_A), lon=pc(hub.LONG_A);
        if (!lat||!lon) return;
        // Extrair ENDID do campo HUB — formato: "NEName (ENDID)"
        var hubStr = hub.HUB || hub.NEName || '';
        var mEid = hubStr.match(/\((\w+)\)/);
        var eid  = mEid ? mEid[1] : (hub.NEName||'').trim();
        // Verificar se há TSK aberta para este END_ID
        var temTSK = eid && tasks.filter(function(t){
          var s=(t.status||'').toUpperCase().trim();
          return (s==='NÃO INICIADO'||s==='NAO INICIADO'||s==='INICIADO') &&
                 (t.enderecoId||'').trim() === eid;
        }).length > 0;
        var corFO  = temTSK ? '#e74c3c' : '#2ecc71'; // vermelho se tem TSK, verde se não
        var nomeFO = hub.NEName || hubStr;
        var m = window.L.marker([lat,lon], { icon: divIcon(corFO, 10, 'square') });
        m._d = { eid: eid, nome: nomeFO, cidade: '' };
        var popupContent = '<b>' + hubStr + '</b><br>'
          + (hub.FORNECEDOR||'') + (hub.PROJETO?' | '+hub.PROJETO:'')
          + (temTSK ? '<br><span style="color:#e74c3c;font-weight:700">⚠ TSK aberta para END_ID: '+eid+'</span>' : '');
        m.bindPopup(popupContent);
        m.bindTooltip((temTSK ? '⚠ ' : '') + nomeFO + (eid?' ('+eid+')':''), { direction:'top' });
        m.addTo(layers.fo);
      });

      // Ajustar visibilidade conforme estado atual dos checkboxes
      if (!ckFlag0.chk.checked) layers.mwFlag0.remove();
      else if (ckMW.chk.checked) layers.mwFlag0.addTo(mapInstance);
    }


    // ── Renderizar usando coordMap (fallback sem ponte) ────────
    // FLAG 1 = apenas incidentes ativos (sites fora reais)
    // FLAG 0 = todos os demais sites do coordMap (mostrado só se checkbox ativo)
    function renderComCoordMap() {
      if (!mapInstance) return;
      layers.flag1.clearLayers();
      layers.flag0.clearLayers();

      var incAtivos = incidents.filter(function(i){
        return (i.statusTrat||'').toUpperCase() !== 'RESOLVIDO';
      });
      var tasksAtivas = tasks.filter(function(t){
        var s=(t.status||'').toUpperCase().trim();
        return s==='NÃO INICIADO'||s==='NAO INICIADO'||s==='INICIADO';
      });
      var eidsAtivos = {};
      incAtivos.forEach(function(i){ eidsAtivos[i.enderecoId||''] = i; });

      var cTSK = 0, cSemCoord = 0;

      // ── FLAG 1: só incidentes reais ──
      incAtivos.forEach(function(inc) {
        var eid = (inc.enderecoId||'').trim();
        var coords = coordMap[eid];
        if (!coords) { cSemCoord++; return; }
        var nome = inc.site || siteByEndId[eid] || eid;
        var tsk = U.tskAberta ? U.tskAberta(inc, tasksAtivas) : null;
        if (tsk) cTSK++;
        var tempo = 99; // fallback; pode calcular a partir de inc.horario se necessário
        var cor = tsk ? '#3498db' : '#e74c3c';
        var marker = window.L.marker(coords, { icon: divIcon(cor, 14) });
        var tskEnd2 = tsk ? ((tsk.enderecoLogradouro||'') + (tsk.bairro ? ', '+tsk.bairro : '') + (tsk.cidade ? ' - '+tsk.cidade : '')) : '';
        tskEnd2 = tskEnd2.trim().replace(/^[,\s-]+|[,\s-]+$/g,'');
        var popId2 = 'pop2_' + eid.replace(/\W/g,'_');
        marker._d = { eid:eid, site:nome, cidade:(inc.cidadeUf||'').split('/')[0].trim(), lat:coords[0], lon:coords[1] };
        var popContent = '<div id="' + popId2 + '" style="font:12px ui-monospace,monospace;min-width:210px">'
          + '<b style="color:' + cor + ';font-size:13px">' + nome + '</b><br>'
          + '<span style="color:#888">END_ID:</span> ' + eid + '<br>'
          + ((inc.cidadeUf) ? '<span style="color:#888">Cidade:</span> ' + inc.cidadeUf + '<br>' : '')
          + '<span style="color:#888">Queda:</span> ' + (inc.horario||'—') + '<br>'
          + '<span style="color:#888">Duração:</span> ' + (inc.downtime||'—') + '<br>'
          + '<span style="color:#888">Causa:</span> ' + (inc.causa||'/') + '<br>'
          + (tsk
              ? '<b style="color:#3498db">TSK: ' + tsk.osNumero + '</b>'
                + (tskEnd2 ? '<br><span style="color:#888">📍 Endereço TSK:</span> ' + tskEnd2
                   + '<br><button onclick="(function(){' +
                     'var el=document.getElementById(\'' + popId2 + '\');' +
                     'var btn=el.querySelector(\'.geo-btn\');btn.textContent=\'Geocodificando...\';btn.disabled=true;' +
                     'TRJ._geocodTSK(\'' + eid + '\',' + coords[0] + ',' + coords[1] + ',\'' + encodeURIComponent(tsk.enderecoLogradouro||'') + '\',\'' + encodeURIComponent(tsk.cidade||'') + '\',\'' + encodeURIComponent(tsk.bairro||'') + '\', el);' +
                   '})()" class="geo-btn" style="margin-top:4px;font-size:10px;padding:2px 7px;background:rgba(52,152,219,.15);color:#3498db;border:1px solid #3498db;border-radius:4px;cursor:pointer">📍 Ver endereço no mapa</button>'
                   : '')
              : '<span style="color:#e74c3c">Sem TSK aberta</span>')
          + '</div>';
        marker.bindPopup(popContent, { maxWidth:300 });
        marker.bindTooltip(nome + ' (' + eid + ')', { direction:'top' });
        marker.addTo(layers.flag1);
      });

      // ── FLAG 0: demais sites do coordMap (não são incidentes ativos) ──
      Object.keys(coordMap).slice(0, 3000).forEach(function(eid) {
        if (eidsAtivos[eid]) return; // já está no FLAG 1
        var c = coordMap[eid];
        var nome = siteByEndId[eid] || eid;
        var m = window.L.circleMarker(c, {
          radius:4, color:'#444', fillColor:'#666', fillOpacity:0.45, weight:1
        });
        m._d = { eid:eid, site:nome, cidade:'' };
        m.bindTooltip(nome + ' (' + eid + ')', { direction:'top' });
        m.addTo(layers.flag0);
      });

      updateStats(incAtivos.length, cTSK, cSemCoord);
    }

    function updateStats(total, comTSK, semCoord) {
      statsEl.innerHTML = '';
      var items = [
        { text:'Sites fora no mapa: ' + total, cor:'#e74c3c' },
        { text:'Com TSK aberta: ' + comTSK, cor:'#3498db' },
        { text:'Sem coordenadas: ' + semCoord, cor:'var(--trj-muted)' },
        { text:'Enlaces MW: ' + mwData.length, cor:'var(--trj-muted)' },
        { text:'Hubs FO: ' + foData.length, cor:'#2ecc71' },
      ];
      items.forEach(function(item) {
        statsEl.appendChild(U.h('span', { style:{ fontSize:'12px', color:item.cor } }, item.text));
      });
    }

    // ── Buscar via ponte ────────────────────────────────────────
    function buscarViaPonte() {
      btnPonte.textContent = 'Buscando...';
      btnPonte.disabled = true;
      fetch(PONTE_URL + '/api/saude')
        .then(function(r) { return r.json(); })
        .then(function() {
          return fetch(PONTE_URL + '/api/mapa?flag=');
        })
        .then(function(r) { return r.json(); })
        .then(function(json) {
          if (json.erro) { U.toast('Erro da ponte: ' + json.erro, 'err'); return; }
          var sites = json.sites || [];
          // Separar: sites fora reais (flag=1) e demais (flag=0)
          // A ponte retorna TODOS — usamos só os flag=1 para atualizar o mapa de incidentes
          U.toast('Mapa: ' + sites.length + ' sites da ponte. Atualizando incidentes...', 'ok');
          getLeaflet(function() {
            initMap();
            // 1) Renderiza os sites primeiro (popula sitesFlag1/sitesFlag0Raw)
            layers.flag1.clearLayers();
            renderSites(sites);
            // 2) SÓ DEPOIS renderiza MW/FO — assim eidsAtivos já reflete os dados da ponte
            renderEstaticos();
          });
        })
        .catch(function(e) {
          U.toast('Ponte não disponível. Use "Importar Genesis HTML" ou inicie o ponte_trj.py.', 'err');
        })
        .finally(function() { btnPonte.textContent = 'Buscar sites (ponte + VPN)'; btnPonte.disabled = false; });
    }

    btnPonte.addEventListener('click', buscarViaPonte);
    btnImport.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function(e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var result = parseGenesisParaMapa(ev.target.result);
        coordMap = result.coordMap; mwData = result.mwData; foData = result.foData;
        mapaMarkers = result.markerData || [];
        U.toast('Genesis: ' + result.siteCount + ' sites / ' + result.coordCount + ' coords importadas.', 'ok');
        fileInput.value = '';
        getLeaflet(function() {
          initMap();
          if (mapaMarkers.length) renderSites(mapaMarkers);
          else renderComCoordMap();
          renderEstaticos();
        });
      };
      reader.readAsText(file, 'utf-8');
    });

    // ── Handler global de geocodificação para callbacks nos popups ───────
    TRJ._geocodTSK = function(eid, latGenesis, lonGenesis, endEnc, cidEnc, bairroEnc, el) {
      var log = decodeURIComponent(endEnc), cid = decodeURIComponent(cidEnc), bai = decodeURIComponent(bairroEnc);
      geocodificarEndereco(log, cid, bai, function(err, res) {
        var btn = el && el.querySelector('.geo-btn');
        if (err) {
          if (btn) { btn.textContent = '⚠ ' + err; btn.disabled = false; }
          return;
        }
        // Marcar posição TSK com marcador laranja diferenciado
        var mTSK = window.L.marker([res.lat, res.lon], { icon: divIcon('#ff8c00', 16) });
        mTSK.bindPopup('<b style="color:#ff8c00">📍 Endereço TSK</b><br>' + log + (bai?', '+bai:'') + '<br>' + cid
          + '<br><small style="color:#888">Coord. Genesis do site:</small> ' + latGenesis.toFixed(5) + ', ' + lonGenesis.toFixed(5)
          + '<br><small style="color:#888">Coord. endereço TSK:</small> ' + res.lat.toFixed(5) + ', ' + res.lon.toFixed(5));
        mTSK.addTo(mapInstance);

        // Desenhar linha entre Genesis e endereço TSK
        var linhaTSK = window.L.polyline([[latGenesis, lonGenesis],[res.lat, res.lon]], {
          color:'#ff8c00', weight:2, dashArray:'4,4', opacity:0.7
        }).addTo(mapInstance);

        // Distância entre os dois pontos
        var distM = haversineKm(latGenesis, lonGenesis, res.lat, res.lon);
        if (btn) btn.textContent = '✓ ' + distM.toFixed(2) + ' km do endereço cadastral';

        mapInstance.fitBounds([[latGenesis, lonGenesis],[res.lat, res.lon]], { padding:[40,40], maxZoom:15 });

        // Limpa após 30s para não poluir o mapa
        setTimeout(function(){ mTSK.remove(); linhaTSK.remove(); }, 30000);
      });
    };

    // ── Iniciar mapa automaticamente se tiver dados ────────────
    var temMW       = mwData.length > 0;
    var temMarkers  = mapaMarkers.length > 0;
    var temCoords   = Object.keys(coordMap).length > 0; // true se defaultCoordMap carregou
    var temInc      = incidents.filter(function(i){ return (i.statusTrat||'').toUpperCase()!=='RESOLVIDO'; }).length > 0;

    getLeaflet(function() {
      initMap();
      // Prioridade de renderização:
      // 1) mapaMarkers (do Genesis Mapa HTML — tem coords + campo tempo para coloração)
      // 2) coordMap + incidentes (sempre disponível graças ao defaultCoordMap embutido)
      if (temMarkers) {
        renderSites(mapaMarkers);
      } else if (temCoords || temInc) {
        renderComCoordMap();
      }
      renderEstaticos();
      if (!temMarkers && !temCoords && !temInc) {
        U.toast('Importe os dados de incidentes ou use "Buscar sites (ponte + VPN)" para ver os marcadores.', 'ok');
      }
    });
  };

})(window.TRJ = window.TRJ || {});
