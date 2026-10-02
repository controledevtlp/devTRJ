/* Página: SLA / Aderência — usa U.donutChart (mesmo estilo do Dashboard) */
(function (TRJ) {
  TRJ.pages = TRJ.pages || {};
  var U = TRJ.ui, C = TRJ.constants, Comp = TRJ.compute;

  var META_PRIO = { P1:80, P2:75, P3:70, P4:70, P5:70 };
  var COR_D  = C.CORES_TRJ.green;
  var COR_F  = C.CORES_TRJ.red;
  var COR_W  = C.CORES_TRJ.orange;

  function pctCor(pct, prio) {
    var meta = prio ? (META_PRIO[prio]||70) : 70;
    return pct >= meta ? COR_D : COR_F;
  }

  /* ════════════════════════════════════════════════════════════════ */
  TRJ.pages.sla = function(container, ctx) {
    var data = ctx.data, app = ctx.app;
    if (!data) { container.appendChild(U.h('div', { class:'trj-card p-6 text-center', text:'Sem dados.' })); return; }

    var tasks  = data.tasksEnriched || [];
    var estado = { regiao:'TODAS', prioridade:'TODAS' };

    container.appendChild(U.pageHeader('SLA / Aderência',
      'Aderência por prioridade e região. Clique para detalhar.'));

    /* ── Filtros ───────────────────────────────────────────────────── */
    function mkSel(options) {
      return U.h('select', { class:'trj-select',
        style:{ padding:'6px 12px', fontSize:'12px', cursor:'pointer',
                minWidth:'168px', borderRadius:'8px' }
      }, options.map(function(o){ return U.h('option', { value:o.v, text:o.t }); }));
    }
    var selReg  = mkSel([{ v:'TODAS', t:'Todas as regiões' }]
      .concat(C.REGIOES.filter(function(r){ return r!=='OTHERS'; })
              .map(function(r){ return { v:r, t:C.REGIAO_LABELS[r]||r }; })));
    var selPrio = mkSel([{ v:'TODAS', t:'Todas as prioridades' }]
      .concat(['P1','P2','P3','P4','P5'].map(function(p){ return { v:p, t:p }; })));

    function legItem(cor, txt) {
      return U.h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--trj-muted)' } }, [
        U.h('span', { style:{ width:'10px', height:'10px', borderRadius:'50%', background:cor, display:'inline-block' } }),
        U.h('span', { text:txt })
      ]);
    }
    container.appendChild(U.h('div', {
      style:{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', marginBottom:'18px' }
    }, [ selReg, selPrio,
      U.h('div', { style:{ marginLeft:'auto', display:'flex', gap:'14px' } }, [
        legItem(COR_D, 'Dentro do SLA'), legItem(COR_F, 'Fora do SLA')
      ])
    ]));

    var area = U.h('div');
    container.appendChild(area);

    /* ════════════════════════════════════════════════════════════════
     * RENDER PRINCIPAL
     * ════════════════════════════════════════════════════════════════ */
    function render() {
      // Destruir gráficos anteriores
      if (U.destroyCharts) {
        // Destruir só os desse contexto — marcar instâncias
        (area._charts || []).forEach(function(c){ try{c.destroy();}catch(e){} });
        area._charts = [];
      }
      area.innerHTML = '';

      var tf = tasks.filter(function(t) {
        if (estado.regiao!=='TODAS' && (t.regiao||'OTHERS')!==estado.regiao) return false;
        if (estado.prioridade!=='TODAS' && (t.prioridade||'')!==estado.prioridade) return false;
        return true;
      });
      var d   = Comp.slaPage(tf, data.prazoMap) || {};
      var por = d.porPrioridade || [];
      var reg = d.porRegiao     || [];
      var ger = d.geral         || { pct:0, dentro:0, fora:0 };

      /* ════════════════════════════════════════════════════════════
       * SEÇÃO 1 — Aderência por Prioridade
       * ════════════════════════════════════════════════════════════ */
      var sec1 = U.h('div', { class:'trj-card p-5 mb-5' });
      sec1.appendChild(U.h('div', {
        style:{ fontWeight:'800', fontSize:'13px', letterSpacing:'.07em',
                color:'var(--trj-fg)', textTransform:'uppercase',
                marginBottom:'18px', borderBottom:'1px solid var(--trj-border)',
                paddingBottom:'10px' }
      }, 'ADERÊNCIA POR PRIORIDADE'));

      // Grid de prioridades: N colunas fixas no desktop, responsivo via minmax
      // repeat(auto-fill, minmax(min(IDEAL, 44vw), 1fr)) garante:
      //   • Desktop largo → IDEAL px por coluna → N colunas (sem colunas extras em branco)
      //   • Tablet → empacota em 2-3 colunas conforme espaço
      //   • Mobile → 2 colunas
      var numCols = Math.max(por.length, 1);
      var idealPx = Math.floor(100 / numCols) + 'vw';
      var grid = U.h('div', {
        style:{ display:'grid',
                gridTemplateColumns:'repeat(auto-fill, minmax(min(clamp(140px, '+idealPx+', 360px), 44vw), 1fr))',
                gap:'14px' }
      });

      por.forEach(function(p) {
        var total = p.dentro + p.fora;
        var cor   = pctCor(p.pct, p.prioridade);
        var meta  = META_PRIO[p.prioridade]||70;

        var card = U.h('div', {
          style:{ background:'var(--trj-card2)', borderRadius:'14px',
                  padding:'18px 14px 14px', display:'flex', flexDirection:'column',
                  alignItems:'center', border:'1px solid var(--trj-border)', position:'relative' }
        });

        /* Título prioridade */
        card.appendChild(U.h('div', {
          style:{ fontWeight:'900', fontSize:'16px', letterSpacing:'.06em',
                  color:'var(--trj-fg)', alignSelf:'flex-start', marginBottom:'8px' }
        }, p.prioridade));

        /* Wrapper quadrado do donut com percentual centralizado */
        var cWrap = U.h('div', { style:{ position:'relative', width:'100%', aspectRatio:'1/1' } });
        var cnv   = U.h('canvas', { style:{ position:'absolute', inset:'0', width:'100%', height:'100%' } });
        cWrap.appendChild(cnv);

        /* Percentual no centro (HTML sobre o canvas) */
        var centroEl = U.h('div', {
          style:{ position:'absolute', top:'50%', left:'50%',
                  transform:'translate(-50%,-52%)',
                  textAlign:'center', pointerEvents:'none', userSelect:'none' }
        }, [
          U.h('div', { style:{ fontSize:'clamp(20px,3vw,28px)', fontWeight:'800',
                               color:cor, lineHeight:'1', letterSpacing:'-.02em' },
            text: p.pct+'%' }),
          U.h('div', { style:{ fontSize:'10px', color:'var(--trj-muted)', marginTop:'3px' }, text:'aderência' })
        ]);
        cWrap.appendChild(centroEl);
        card.appendChild(cWrap);

        /* Dentro / Fora — na mesma linha, inline */
        card.appendChild(U.h('div', {
          style:{ display:'flex', justifyContent:'space-between', width:'100%', marginTop:'12px' }
        }, [
          U.h('span', { style:{ fontSize:'13px' } }, [
            U.h('b', { style:{ fontSize:'clamp(14px,2vw,19px)', color:COR_D } }, String(p.dentro)+' '),
            U.h('span', { style:{ fontSize:'10px', color:'var(--trj-muted)' }, text:'dentro' })
          ]),
          U.h('span', { style:{ fontSize:'13px' } }, [
            U.h('b', { style:{ fontSize:'clamp(14px,2vw,19px)', color:COR_F } }, String(p.fora)+' '),
            U.h('span', { style:{ fontSize:'10px', color:'var(--trj-muted)' }, text:'fora' })
          ])
        ]));

        /* Rodapé: Prazo / Total / Meta na mesma linha, mesma cor */
        card.appendChild(U.h('div', {
          style:{ display:'flex', justifyContent:'space-between', width:'100%',
                  marginTop:'10px', paddingTop:'8px', borderTop:'1px solid var(--trj-border)',
                  fontSize:'11px', color:'var(--trj-muted)' }
        }, [
          U.h('span', null, [ U.h('b', { style:{ fontSize:'13px', color:'var(--trj-fg)' } }, p.prazoHoras+'h '), U.h('span', { text:'prazo' }) ]),
          U.h('span', { style:{ textAlign:'center' } }, [ U.h('b', { style:{ fontSize:'13px', color:'var(--trj-fg)' } }, String(total)+' '), U.h('span', { text:'total' }) ]),
          U.h('span', { style:{ textAlign:'right' } }, [ U.h('b', { style:{ fontSize:'13px', color:'var(--trj-fg)' } }, meta+'% '), U.h('span', { text:'meta' }) ])
        ]));

        grid.appendChild(card);

        /* Donut — U.donutChart IDÊNTICO ao dashboard */
        var ch = U.donutChart(cnv, [
          { label:'Dentro do SLA', value: p.dentro, cor: COR_D },
          { label:'Fora do SLA',   value: p.fora,   cor: COR_F }
        ], {
          onSlice: function(i) {
            var lado = i===0 ? 'dentro' : 'fora';
            app.openDrillTasks({ tipo:'prioridadeSla', arg:p.prioridade+'|'+lado }, {},
              (lado==='fora'?'FORA SLA: ':'DENTRO SLA: ') + p.prioridade);
          }
        });
        if (ch) (area._charts = area._charts||[]).push(ch);
      });

      sec1.appendChild(grid);
      area.appendChild(sec1);

      /* ════════════════════════════════════════════════════════════
       * SEÇÃO 2 — Aderência por Região
       *   LEFT : U.donutChart geral (mesmo estilo dashboard)
       *   RIGHT: tabela de regiões, centralizada
       * ════════════════════════════════════════════════════════════ */
      var sec2 = U.h('div', { class:'trj-card p-5' });
      sec2.appendChild(U.h('div', {
        style:{ fontWeight:'800', fontSize:'13px', letterSpacing:'.07em',
                color:'var(--trj-fg)', textTransform:'uppercase',
                marginBottom:'16px', borderBottom:'1px solid var(--trj-border)',
                paddingBottom:'10px' }
      }, 'ADERÊNCIA POR REGIÃO'));

      var gerTotal = ger.dentro + ger.fora;
      var gerCor   = pctCor(ger.pct, null);

      var regLayout = U.h('div', { style:{ display:'flex', gap:'20px', alignItems:'flex-start', flexWrap:'wrap' } });

      /* ── Donut geral (esquerda) — mesmo U.donutChart do dashboard ── */
      var gerSide = U.h('div', {
        style:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px',
                width:'calc(20% - 12px)', minWidth:'min(150px, 100%)', flexShrink:'0' }
      });

      var gerWrap = U.h('div', { style:{ position:'relative', width:'100%', aspectRatio:'1/1' } });
      var gerCnv  = U.h('canvas', { style:{ position:'absolute', inset:'0', width:'100%', height:'100%' } });
      gerWrap.appendChild(gerCnv);
      gerWrap.appendChild(U.h('div', {
        style:{ position:'absolute', top:'50%', left:'50%',
                transform:'translate(-50%,-52%)', textAlign:'center', pointerEvents:'none' }
      }, [
        U.h('div', { style:{ fontSize:'clamp(16px,2.2vw,22px)', fontWeight:'800', color:gerCor, lineHeight:'1' }, text:ger.pct+'%' }),
        U.h('div', { style:{ fontSize:'9px', color:'var(--trj-muted)', marginTop:'3px' }, text:'aderência' })
      ]));
      gerSide.appendChild(gerWrap);
      gerSide.appendChild(U.h('div', { style:{ textAlign:'center', lineHeight:'1.7', fontSize:'11px' } }, [
        U.h('div', { style:{ fontWeight:'800', fontSize:'12px', color:'var(--trj-fg)', letterSpacing:'.04em' }, text:'ADERÊNCIA GERAL' }),
        U.h('div', null, [
          U.h('b', { style:{ color:COR_D } }, String(ger.dentro)),
          U.h('span', { style:{ color:'var(--trj-muted)' }, text:' dentro / ' }),
          U.h('b', { style:{ color:COR_F } }, String(ger.fora)),
          U.h('span', { style:{ color:'var(--trj-muted)' }, text:' fora' })
        ]),
        U.h('div', { style:{ color:'var(--trj-muted)' }, text:'Total: '+gerTotal })
      ]));
      regLayout.appendChild(gerSide);

      var gerCh = U.donutChart(gerCnv, [
        { label:'Dentro do SLA', value: ger.dentro, cor: COR_D },
        { label:'Fora do SLA',   value: ger.fora,   cor: COR_F }
      ]);
      if (gerCh) (area._charts = area._charts||[]).push(gerCh);

      /* ── Tabela de regiões (direita, centralizada) ── */
      var tbl = U.h('div', {
        style:{ flex:'1', display:'flex', flexDirection:'column',
                justifyContent:'flex-start', padding:'0 clamp(8px, 3vw, 40px)' }
      });

      tbl.appendChild(U.h('div', {
        style:{ display:'grid',
                gridTemplateColumns:'1fr auto auto auto auto',
                padding:'0 8px 8px 8px', gap:'8px',
                borderBottom:'1px solid var(--trj-border)',
                fontSize:'10px', fontWeight:'700', letterSpacing:'.06em',
                color:'var(--trj-muted)', textTransform:'uppercase' }
      }, ['REGIÃO','TOTAL','DENTRO','FORA','ADERÊNCIA'].map(function(t, i){
        return U.h('div', { style:{ textAlign: i===0?'left':'center' }, text:t });
      })));

      reg.forEach(function(r) {
        var rTotal = r.dentro + r.fora;
        var rCor   = pctCor(r.pct, null);
        var label  = (C.REGIAO_LABELS[r.regiao]||r.label||r.regiao||'').toUpperCase();

        var row = U.h('div', {
          style:{ display:'grid',
                  gridTemplateColumns:'1fr auto auto auto auto',
                  padding:'11px 8px', gap:'8px',
                  borderBottom:'1px solid rgba(255,255,255,.05)',
                  cursor:'pointer', transition:'background .15s', borderRadius:'6px',
                  alignItems:'center' }
        });
        row.addEventListener('mouseenter', function(){ row.style.background='rgba(255,255,255,.04)'; });
        row.addEventListener('mouseleave', function(){ row.style.background=''; });
        row.addEventListener('click', function(){
          app.openDrillTasks({ tipo:'regiaoSla', arg:r.regiao+'|fora' }, {}, 'FORA SLA: '+label);
        });

        row.appendChild(U.h('div', { style:{ fontWeight:'600', fontSize:'13px', color:'var(--trj-fg)' }, text:label }));
        row.appendChild(U.h('div', { style:{ textAlign:'center', fontWeight:'700', fontSize:'14px' }, text:String(rTotal) }));
        row.appendChild(U.h('div', { style:{ textAlign:'center', fontWeight:'700', fontSize:'14px', color:COR_D }, text:String(r.dentro) }));
        row.appendChild(U.h('div', { style:{ textAlign:'center', fontWeight:'700', fontSize:'14px', color:COR_F }, text:String(r.fora) }));
        row.appendChild(U.h('div', { style:{ textAlign:'center', fontWeight:'800', fontSize:'15px', color:rCor }, text:r.pct+'%' }));
        tbl.appendChild(row);
      });

      regLayout.appendChild(tbl);
      sec2.appendChild(regLayout);
      area.appendChild(sec2);
    }

    selReg.addEventListener('change',  function(){ estado.regiao    = selReg.value;  render(); });
    selPrio.addEventListener('change', function(){ estado.prioridade = selPrio.value; render(); });
    render();
  };

})(window.TRJ = window.TRJ || {});
