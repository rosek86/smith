import * as d3 from 'd3';
import { SmithShape } from './SmithShape';

export class SmithSvg {
  private container: d3.Selection<SVGElement, {}, null, undefined>;

  constructor() {
    this.container = d3.select<SVGElement, {}>(
      document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    )
    .attr('version', '1.1')
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .attr('width', '100%').attr('height', '100%')
    .attr('viewBox', '-1 -1 2 2')
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('transform', 'translate(0, 1)');
  }

  public get Node(): SVGElement|null {
    return this.container.node();
  }

  public append(el: SmithShape|null): SmithSvg {
    if (el !== null) {
      this.container.append(() => el.Node);
    }
    return this;
  }

  public get Element(): d3.Selection<SVGElement, {}, null, undefined> {
    return this.container;
  }
}
