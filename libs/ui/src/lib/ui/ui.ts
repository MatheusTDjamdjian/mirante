import { ChangeDetectionStrategy, Component } from '@angular/core';

// Placeholder da Onda 0. Os componentes reais (mir-linha-fato, mir-chip-entidade,
// mir-pilula-novos, ...) entram na Onda 6, depois da extracao do DESIGN_SYSTEM.md.
@Component({
  selector: 'mir-ui',
  imports: [],
  templateUrl: './ui.html',
  styleUrl: './ui.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ui {}
