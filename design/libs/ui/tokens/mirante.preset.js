/** Mirante — preset Tailwind. Todo utilitário aponta para um token semântico.
 *  tailwind.config.js:  presets: [require('../../libs/ui/tokens/mirante.preset.js')]
 *  Importe mirante.tokens.css uma vez no shell da aplicação.
 */
const v = (n) => `var(--${n})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        superficie: v('cor-superficie'),
        'superficie-elevada': v('cor-superficie-elevada'),
        'superficie-afundada': v('cor-superficie-afundada'),
        'superficie-sutil': v('cor-superficie-sutil'),
        borda: v('cor-borda'),
        'borda-forte': v('cor-borda-forte'),
        'texto-primario': v('cor-texto-primario'),
        'texto-secundario': v('cor-texto-secundario'),
        'texto-terciario': v('cor-texto-terciario'),
        acento: v('cor-acento'),
        'acento-suave': v('cor-acento-suave'),
        'acento-contorno': v('cor-acento-contorno'),
        positivo: v('cor-positivo'),
        negativo: v('cor-negativo'),
        atencao: v('cor-atencao'),
        foco: v('cor-foco'),
        'cobertura-trilha': v('cor-cobertura-trilha'),
        'cobertura-1': v('cor-cobertura-1'),
        'cobertura-2': v('cor-cobertura-2'),
        'cobertura-3': v('cor-cobertura-3'),
        'cobertura-4': v('cor-cobertura-4'),
        'cobertura-5': v('cor-cobertura-5'),
      },
      fontFamily: {
        display: [v('f-display')],
        texto: [v('f-texto')],
        numero: [v('f-numero')],
      },
      fontSize: {
        microrrotulo: [v('t-microrrotulo'), { lineHeight: v('l-apertada'), letterSpacing: v('k-rotulo') }],
        rotulo: [v('t-rotulo'), { lineHeight: v('l-apertada'), letterSpacing: v('k-rotulo') }],
        legenda: [v('t-legenda'), { lineHeight: v('l-corpo') }],
        corpo: [v('t-corpo'), { lineHeight: v('l-corpo') }],
        'corpo-forte': [v('t-corpo-forte'), { lineHeight: v('l-corpo') }],
        'titulo-c': [v('t-titulo-c'), { lineHeight: v('l-titulo') }],
        'titulo-b': [v('t-titulo-b'), { lineHeight: v('l-titulo') }],
        'titulo-a': [v('t-titulo-a'), { lineHeight: v('l-titulo'), letterSpacing: v('k-titulo') }],
        display: [v('t-display'), { lineHeight: v('l-apertada'), letterSpacing: v('k-display') }],
        'display-grande': [v('t-display-grande'), { lineHeight: v('l-apertada'), letterSpacing: v('k-display') }],
      },
      fontWeight: {
        regular: v('p-regular'),
        medio: v('p-medio'),
        forte: v('p-forte'),
        display: v('p-display'),
      },
      spacing: {
        0: v('e-0'), 1: v('e-1'), 2: v('e-2'), 3: v('e-3'), 4: v('e-4'),
        5: v('e-5'), 6: v('e-6'), 7: v('e-7'), 8: v('e-8'), 9: v('e-9'), 10: v('e-10'),
        'linha-y': v('e-linha-y'), pente: v('e-pente'), rail: v('e-rail'), alvo: v('e-alvo'),
      },
      borderRadius: {
        0: v('r-0'), 1: v('r-1'), 2: v('r-2'), 3: v('r-3'), 4: v('r-4'), pilula: v('r-pilula'),
      },
      boxShadow: { 1: v('ev-1'), 2: v('ev-2'), 3: v('ev-3') },
      transitionDuration: {
        instantaneo: v('d-instantaneo'), rapido: v('d-rapido'),
        medio: v('d-medio'), lento: v('d-lento'),
      },
      transitionTimingFunction: {
        padrao: v('c-padrao'), saida: v('c-saida'), entrada: v('c-entrada'),
      },
      outlineColor: { foco: v('cor-foco') },
      minHeight: { alvo: v('e-alvo') },
      minWidth: { alvo: v('e-alvo') },
    },
  },
};
