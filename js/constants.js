/* Constantes operacionais do sistema TRJ (portado de lib/domain/constants.ts) */
(function (TRJ) {
  var C = {};

  C.REGIOES = ['INTERIOR', 'BAIXADA', 'GRANDE RJ', 'ZONA OESTE', 'ESPIRITO SANTO', 'OTHERS'];

  C.REGIAO_LABELS = {
    INTERIOR: 'Interior',
    BAIXADA: 'Baixada',
    'GRANDE RJ': 'Grande RJ',
    'ZONA OESTE': 'Zona Oeste',
    'ESPIRITO SANTO': 'Espírito Santo',
    OTHERS: 'Outros'
  };

  C.PRIORIDADES = ['P1', 'P2', 'P3', 'P4', 'P5'];

  C.SLA_PADRAO_HORAS = { P1: 4, P2: 6, P3: 12, P4: 24, P5: 48 };

  C.ANF_LIST = ['21', '22', '24', '27', '28'];

  C.ANF_LABELS = {
    '21': 'ANF 21 - RJ Capital',
    '22': 'ANF 22 - Niterói/Baixada',
    '24': 'ANF 24 - Interior RJ',
    '27': 'ANF 27 - ES Norte',
    '28': 'ANF 28 - ES Sul'
  };

  C.GSBI_LIST = ['GOLD', 'SILVER', 'BRONZE', 'IRON'];
  C.GSBI_CORES = { GOLD: '#FFB020', SILVER: '#9AA5B1', BRONZE: '#CD7F32', IRON: '#6B7280' };

  C.CAUSA_GRUPOS = ['Furto', 'Energia', 'Fibra', 'Transmissão', 'Outros'];

  C.STATUS_INCIDENTE = ['ATIVO', 'EM TRATAMENTO', 'RESOLVIDO'];

  C.CHART_CORES = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#FF6363', '#80D8C3', '#A19AD3', '#72BF78'];

  C.TIPO_CORRETIVA = 'Planta Interna - Manutenção Corretiva';

  C.AGING_BUCKETS = [
    { label: 'Até 4h', min: 0, max: 240 },
    { label: '4h a 6h', min: 240, max: 360 },
    { label: '6h a 8h', min: 360, max: 480 },
    { label: '8h a 12h', min: 480, max: 720 },
    { label: '12h a 24h', min: 720, max: 1440 },
    { label: '24h a 48h', min: 1440, max: 2880 },
    { label: '48h a 72h', min: 2880, max: 4320 },
    { label: '72h a 96h', min: 4320, max: 5760 },
    { label: '>96h', min: 5760, max: Infinity }
  ];

  C.AGING_CORES = ['#2ecc71', '#52d68a', '#ffb347', '#ff9f1c', '#ff8c00', '#ff6b35', '#e74c3c', '#c0392b', '#922b21'];

  C.VENCIMENTO_BUCKETS = [
    { label: '< 2h', min: 0, max: 120, cor: '#e74c3c' },
    { label: '2h a 4h', min: 120, max: 240, cor: '#ff8c00' },
    { label: '4h a 6h', min: 240, max: 360, cor: '#ffb347' },
    { label: '> 6h', min: 360, max: Infinity, cor: '#3498db' }
  ];

  C.CORES_TRJ = { orange: '#ff8c00', orange2: '#ffb347', red: '#e74c3c', green: '#2ecc71', blue: '#3498db' };

  C.DONUT_CORES = ['#ff8c00', '#ffb347', '#ff6b35', '#9aa5b1'];

  TRJ.constants = C;
})(window.TRJ = window.TRJ || {});
