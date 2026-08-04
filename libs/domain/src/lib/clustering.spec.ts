import {
  atualizarCentroide,
  CONFIGURACAO_CLUSTERING_PADRAO,
  decidirCluster,
  LIMIAR_SIMILARIDADE_PADRAO,
  similaridadeCosseno,
  type CandidatoDeCluster,
} from './clustering';

describe('configuracao padrao', () => {
  it('matches CONTEXTO.md secao 5', () => {
    expect(LIMIAR_SIMILARIDADE_PADRAO).toBe(0.86);
    expect(CONFIGURACAO_CLUSTERING_PADRAO.limiarSimilaridade).toBe(0.86);
  });
});

describe('decidirCluster', () => {
  it('opens a new cluster when there are no candidates', () => {
    expect(decidirCluster([])).toEqual({ tipo: 'novo' });
  });

  it('opens a new cluster when every candidate is below the threshold', () => {
    const candidatos: CandidatoDeCluster[] = [
      { clusterId: 'a', similaridade: 0.85 },
      { clusterId: 'b', similaridade: 0.4 },
    ];
    expect(decidirCluster(candidatos)).toEqual({ tipo: 'novo' });
  });

  it('joins the closest candidate above the threshold', () => {
    const candidatos: CandidatoDeCluster[] = [
      { clusterId: 'a', similaridade: 0.87 },
      { clusterId: 'b', similaridade: 0.94 },
      { clusterId: 'c', similaridade: 0.9 },
    ];
    expect(decidirCluster(candidatos)).toEqual({
      tipo: 'entrar',
      clusterId: 'b',
      similaridade: 0.94,
    });
  });

  it('treats the threshold as inclusive', () => {
    expect(decidirCluster([{ clusterId: 'a', similaridade: 0.86 }])).toEqual({
      tipo: 'entrar',
      clusterId: 'a',
      similaridade: 0.86,
    });
  });

  it('breaks an exact tie by the lowest clusterId, deterministically', () => {
    const candidatos: CandidatoDeCluster[] = [
      { clusterId: 'ccc', similaridade: 0.91 },
      { clusterId: 'aaa', similaridade: 0.91 },
      { clusterId: 'bbb', similaridade: 0.91 },
    ];
    const primeira = decidirCluster(candidatos);
    const segunda = decidirCluster([...candidatos].reverse());
    expect(primeira).toEqual(segunda);
    expect(primeira).toEqual({
      tipo: 'entrar',
      clusterId: 'aaa',
      similaridade: 0.91,
    });
  });

  it('discards a non-finite similarity instead of letting it decide by accident', () => {
    const candidatos: CandidatoDeCluster[] = [
      { clusterId: 'nan', similaridade: Number.NaN },
      { clusterId: 'inf', similaridade: Number.POSITIVE_INFINITY },
      { clusterId: 'ok', similaridade: 0.88 },
    ];
    expect(decidirCluster(candidatos)).toEqual({
      tipo: 'entrar',
      clusterId: 'ok',
      similaridade: 0.88,
    });
  });

  it('opens a new cluster when every similarity is NaN', () => {
    expect(
      decidirCluster([{ clusterId: 'a', similaridade: Number.NaN }]),
    ).toEqual({ tipo: 'novo' });
  });

  it('honours an injected threshold', () => {
    const candidatos: CandidatoDeCluster[] = [
      { clusterId: 'a', similaridade: 0.8 },
    ];
    expect(decidirCluster(candidatos, { limiarSimilaridade: 0.78 })).toEqual({
      tipo: 'entrar',
      clusterId: 'a',
      similaridade: 0.8,
    });
    expect(decidirCluster(candidatos, { limiarSimilaridade: 0.92 })).toEqual({
      tipo: 'novo',
    });
  });
});

describe('similaridadeCosseno', () => {
  it('is 1 for identical vectors', () => {
    expect(similaridadeCosseno([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
  });

  it('is 1 for parallel vectors of different magnitude', () => {
    expect(similaridadeCosseno([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(similaridadeCosseno([1, 0], [0, 1])).toBeCloseTo(0, 12);
  });

  it('is -1 for opposite vectors', () => {
    expect(similaridadeCosseno([1, 2], [-1, -2])).toBeCloseTo(-1, 12);
  });

  it('returns NaN for a zero-norm vector instead of pretending it is 0', () => {
    expect(similaridadeCosseno([0, 0], [1, 2])).toBeNaN();
  });

  it('throws on mismatched dimensions', () => {
    expect(() => similaridadeCosseno([1, 2], [1, 2, 3])).toThrow(
      /Dimensao incompativel/,
    );
  });

  it('is symmetric', () => {
    const a = [0.3, -0.7, 0.1];
    const b = [0.2, 0.5, -0.9];
    expect(similaridadeCosseno(a, b)).toBeCloseTo(
      similaridadeCosseno(b, a),
      12,
    );
  });
});

describe('atualizarCentroide', () => {
  it('averages the incoming embedding into the centroid', () => {
    // Centroide de 1 membro [0,0] recebendo [2,4] -> [1,2]
    expect(atualizarCentroide([0, 0], 1, [2, 4])).toEqual([1, 2]);
  });

  it('weights the existing centroid by how many members it represents', () => {
    // 3 membros em [3,3] recebendo [7,7] -> (3*3+7)/4 = 4
    expect(atualizarCentroide([3, 3], 3, [7, 7])).toEqual([4, 4]);
  });

  it('moves less as the cluster grows', () => {
    const pequeno = atualizarCentroide([0], 1, [10])[0] as number;
    const grande = atualizarCentroide([0], 99, [10])[0] as number;
    expect(grande).toBeLessThan(pequeno);
  });

  it('is equivalent to the plain mean, member by member', () => {
    const membros = [
      [1, 0],
      [3, 2],
      [5, 4],
      [7, 6],
    ];
    let centroide: readonly number[] = membros[0] as number[];
    for (let i = 1; i < membros.length; i += 1) {
      centroide = atualizarCentroide(centroide, i, membros[i] as number[]);
    }
    expect(centroide[0]).toBeCloseTo(4, 12);
    expect(centroide[1]).toBeCloseTo(3, 12);
  });

  it('throws on mismatched dimensions', () => {
    expect(() => atualizarCentroide([1, 2], 1, [1, 2, 3])).toThrow(
      /Dimensao incompativel/,
    );
  });

  it('throws when the previous count is not at least one', () => {
    expect(() => atualizarCentroide([1], 0, [2])).toThrow(/quantidadeAnterior/);
  });
});
