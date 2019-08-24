import * as d3 from 'd3';
import { sprintf } from 'sprintf-js';

import { Point } from './shapes/Point';

import { SmithSvg } from './draw/SmithSvg';
import { SmithGroup } from './draw/SmithGroup';
import { SmithCircle } from './draw/SmithCircle';

import { SmithData } from './draw/SmithData';
import { SmithMarker } from './draw/SmithMarker';
import { SmithCursor } from './draw/SmithCursor';

import { ConstResistance } from './draw/ConstResistance';
import { ConstReactance } from './draw/ConstReactance';

import { ConstAdmCircles } from './draw/ConstAdmCircles';
import { ConstQCircles } from './draw/ConstQCircles';
import { ConstSwrCircles } from './draw/ConstSwrCircles';

import { SmithConstantCircle } from './SmithConstantCircle';
import { SmithDrawOptions } from './draw/SmithDrawOptions';

import { S1P, S1PEntry } from './SnP';

import { SmithScaler } from './draw/SmithScaler';
import { SmithArcsDefs } from './SmithArcsDefs';

interface SmithCirclesDrawOptions {
  stroke: string; minorWidth: string; majorWidth: string;
}

export interface SmithCursorEvent {
  reflectionCoefficient: Point;
  impedance: Point|undefined;
  admittance: Point|undefined;
  swr: number;
  returnLoss: number;
  mismatchLoss: number;
  Q: number|undefined;
}

export interface SmithMarkerEvent {
  datasetNo: number;
  markerNo: number;
  reflectionCoefficient: Point;
  impedance: Point|undefined;
  admittance: Point|undefined;
  swr: number;
  returnLoss: number;
  mismatchLoss: number;
  Q: number|undefined;
  freq: number;
}

export enum SmithEventType {
  Cursor, Marker
}

export interface SmithEvent {
  type: SmithEventType;
  data: SmithCursorEvent|SmithMarkerEvent|undefined;
}

interface Scalers {
  default: SmithScaler;
  impedance: SmithScaler;
  admittance: SmithScaler;
}

export class Smith {
  private calcs: SmithConstantCircle = new SmithConstantCircle();
  private scalers: Scalers;

  private svg: SmithSvg;
  private container: SmithGroup;

  // private fgContainer: SmithGroup;
  // private fgContainerShape: SmithCircle;

  private constResistance: ConstResistance;
  private constReactance: ConstReactance;
  // private constAdmCircles: ConstAdmCircles;
  // private constSwrCircles: ConstSwrCircles;
  // private constQCircles: ConstQCircles;
  private reactanceAxis: SmithCircle;

  private cursor: SmithCursor;
  private data: SmithData[] = [];

  private userActionHandler: ((event: SmithEvent) => void)|null = null;

  constructor(private Z0: number = 50) {
    // this.constAdmCircles = new ConstAdmCircles(false);
    // this.container.append(this.constAdmCircles.draw());

    // this.constSwrCircles = new ConstSwrCircles();
    // this.container.append(this.constSwrCircles.draw());

    // this.constQCircles = new ConstQCircles();
    // this.container.append(this.constQCircles.draw());

    // this.fgContainer = new SmithGroup();
    // this.fgContainerShape = this.drawFgContainerShape();
    // this.fgContainer.append(this.fgContainerShape);
    // this.svg.append(this.fgContainer);

    const viewBoxSize = 500;

    this.scalers = this.createScalers(viewBoxSize);
    this.svg = new SmithSvg(viewBoxSize);

    this.container = new SmithGroup();
    this.svg.append(this.container);

    this.cursor = this.initCursor();
    this.container.append(this.cursor.Group);

    this.reactanceAxis = this.drawReactanceAxis({
      stroke: 'blue', strokeWidth: '1', fill: 'none'
    });
    this.container.append(this.reactanceAxis);

    this.constResistance = new ConstResistance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constResistance.show();
    this.container.append(this.constResistance.draw());

    this.constReactance = new ConstReactance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constReactance.show();
    this.container.append(this.constReactance.draw());

    // Initial zoom
    const shape = this.bgContainerZoom();
    this.container.append(shape);
  }

  public draw(selector: string): void {
    d3.select(selector).append(() => this.svg.Node);
  }

  private createScalers(size: number): Scalers {
    const impedance = new SmithScaler(
      d3.scaleLinear().domain([ -1,  1 ]).range([ 0, size     ]),
      d3.scaleLinear().domain([  1, -1 ]).range([ 0, size     ]),
      d3.scaleLinear().domain([  0,  1 ]).range([ 0, size / 2 ]),
    );
    const admittance = new SmithScaler(
      d3.scaleLinear().domain([  1, -1 ]).range([ 0, size     ]),
      d3.scaleLinear().domain([ -1,  1 ]).range([ 0, size     ]),
      d3.scaleLinear().domain([  0,  1 ]).range([ 0, size / 2 ]),
    );
    return { default: impedance, impedance, admittance };
  }

  // private drawFgContainerShape(): SmithCircle {
  //   const zoom = d3.zoom<SVGElement, {}>()
  //     .scaleExtent([ 0.5, 40 ])
  //     .on('zoom', () => this.zoomAll(d3.event.transform));

  //   const shape = this.drawReactanceAxis({ fill: 'transparent', stroke: 'none' });
  //   const that = this;

  //   shape.Element
  //     .style('pointer-events', 'all')
  //     .on('mousemove', function () {
  //       that.cursorMove(d3.mouse(this as any));
  //     })
  //     .on('mouseleave', () => this.cursor.hide())
  //     .call(zoom);

  //   return shape;
  // }

  private cursorMove(p: Point): void {
    this.cursor.Position = this.scalers.default.pointInvert(p);
  }

  // private zoomAll(transform: ZoomTransform): void {
  //   this.transform = d3.event.transform;

  //   this.bgContainerZoom(transform);
  //   this.cursor.zoom(transform);
  //   this.data.forEach((d) => d.zoom(transform));
  // }

  private initCursor(): SmithCursor {
    const cursor = new SmithCursor(this.scalers.default);
    cursor.setMoveHandler((rc) => {
      if (this.userActionHandler) {
        this.userActionHandler({
          type: SmithEventType.Cursor, data: this.CursorData,
        });
      }
    });
    return cursor;
  }

  public get CursorData(): SmithCursorEvent {
    const rc: Point = this.cursor.Position;
    return {
      reflectionCoefficient: rc,
      impedance:    this.calcImpedance(rc),
      admittance:   this.calcAdmittance(rc),
      swr:          this.getSwr(rc),
      returnLoss:   this.getReturnLoss(rc),
      mismatchLoss: this.getMismatchLoss(rc),
      Q:            this.getQ(rc)
    };
  }

  private bgContainerZoom(): SmithCircle {
    const zoom = d3.zoom<SVGElement, {}>()
      .scaleExtent([ 0.8, 6 ])
      .on('zoom', () => {
        this.container.Element.attr('transform', d3.event.transform);
      });

    const halfsize = 500 / 2;
    const initScale = 0.8;
    const initTranslate = (1 - initScale) * halfsize;
    const that = this;

    this.svg.Element
      .call(zoom);
      // .call(zoom.transform, d3.zoomIdentity
      //   .translate(initTranslate, initTranslate)
      //   .scale(initScale)
      // );

    const shape = this.drawReactanceAxis({ fill: 'transparent', stroke: 'none' });

    shape.Element.style('pointer-events', 'all')
      .on('mousemove', function () {
        that.cursorMove(d3.mouse(this as any));
      })
      .on('mouseleave', () => this.cursor.hide());

    return shape;
  }

  private drawReactanceAxis(opts: SmithDrawOptions): SmithCircle {
    const c = this.calcs.resistanceCircle(0);
    c.p[0] = this.scalers.default.x(c.p[0]);
    c.p[1] = this.scalers.default.y(c.p[1]);
    c.r    = this.scalers.default.r(c.r);
    return new SmithCircle(c, opts);
  }

  public getReactanceComponentValue(p: Point, f: number): string {
    const z = this.calcs.reflectionCoefficientToImpedance(p);
    if (!z) {
      return 'Undefined';
    }

    const x = z[1] * this.Z0;

    if (x < 0) {
      const cap = 1 / (2 * Math.PI * f * -x);
      return this.formatNumber(cap) + 'F';
    }

    const ind = x / (2 * Math.PI * f);
    return this.formatNumber(ind) + 'H';
  }

  public formatComplex(c: Point, unit: string = '', dp: number = 3): string {
    if (unit !== '') { unit = `[${unit}]`; }
    return `${c[0].toFixed(dp)} ${c[1] < 0 ? '-' : '+'} j ${Math.abs(c[1]).toFixed(dp)} ${unit}`;
  }

  public formatComplexPolar(c: Point, unit: string = '', dp: number = 3): string {
    const m = Math.sqrt(c[0] * c[0] + c[1] * c[1]);
    const a = Math.atan2(c[1], c[0]) * 180.0 / Math.PI;
    return `${m.toFixed(dp)} ${unit} ∠${a.toFixed(dp)}°`;
  }

  public formatNumber(val: number): string {
    if (val > 1e24 ) { return (val / 1e24 ).toFixed(3) + ' Y'; }
    if (val > 1e21 ) { return (val / 1e21 ).toFixed(3) + ' Z'; }
    if (val > 1e18 ) { return (val / 1e18 ).toFixed(3) + ' E'; }
    if (val > 1e15 ) { return (val / 1e15 ).toFixed(3) + ' P'; }
    if (val > 1e12 ) { return (val / 1e12 ).toFixed(3) + ' T'; }
    if (val > 1e9  ) { return (val / 1e9  ).toFixed(3) + ' G'; }
    if (val > 1e6  ) { return (val / 1e6  ).toFixed(3) + ' M'; }
    if (val > 1e3  ) { return (val / 1e3  ).toFixed(3) + ' k'; }
    if (val > 1    ) { return (val        ).toFixed(3) + ' ';  }
    if (val > 1e-3 ) { return (val / 1e-3 ).toFixed(3) + ' m'; }
    if (val > 1e-6 ) { return (val / 1e-6 ).toFixed(3) + ' μ'; }
    if (val > 1e-9 ) { return (val / 1e-9 ).toFixed(3) + ' n'; }
    if (val > 1e-12) { return (val / 1e-12).toFixed(3) + ' p'; }
    if (val > 1e-15) { return (val / 1e-15).toFixed(3) + ' f'; }
    if (val > 1e-18) { return (val / 1e-18).toFixed(3) + ' a'; }
    if (val > 1e-21) { return (val / 1e-21).toFixed(3) + ' z'; }
    return (val / 1e-24).toFixed(3) + ' y';
  }

  // public addS1P(values: S1P): void {
  //   if (values.length === 0) { return; }
  //   const data = this.createSmithData(values, this.data.length);
  //   this.data.push(data);
  // }

  // private createSmithData(values: S1P, dataset: number): SmithData {
  //   const color = d3.schemeCategory10[1 + dataset];
  //   const data = new SmithData(values, color,
  //     this.transform, this.fgContainer, this.container
  //   );
  //   data.setMarkerMoveHandler((marker) => {
  //     if (this.userActionHandler) {
  //       this.userActionHandler({
  //         type: SmithEventType.Marker, data: this.getMarkerData(dataset, marker)
  //       });
  //     }
  //   });
  //   data.addMarker();
  //   return data;
  // }

  public getMarkerData(datasetNo: number, markerNo: number): SmithMarkerEvent|undefined {
    if (!this.data[datasetNo]) { return; }

    const m = this.data[datasetNo].getMarker(markerNo);
    if (!m) { return; }

    const rc = m.selectedPoint.point;
    const freq = m.selectedPoint.freq;

    return {
      datasetNo, markerNo,
      reflectionCoefficient:  rc,
      freq:                   freq,
      impedance:              this.calcImpedance(rc),
      admittance:             this.calcAdmittance(rc),
      swr:                    this.getSwr(rc),
      returnLoss:             this.getReturnLoss(rc),
      mismatchLoss:           this.getMismatchLoss(rc),
      Q:                      this.getQ(rc),
    };
  }

  public get Datasets(): SmithData[] {
    return this.data;
  }

  // public get ConstImpCircles(): ConstImpCircles {
  //   return this.constImpCircles;
  // }

  // public get ConstAdmCircles(): ConstAdmCircles {
  //   return this.constAdmCircles;
  // }

  // public get ConstQCircles(): ConstQCircles {
  //   return this.constQCircles;
  // }

  // public get ConstSwrCircles(): ConstSwrCircles {
  //   return this.constSwrCircles;
  // }

  public setUserActionHandler(handler: (event: SmithEvent) => void): void {
    this.userActionHandler = handler;
  }

  public calcImpedance(rc: Point): Point|undefined {
    const impedance = this.calcs.reflectionCoefficientToImpedance(rc);
    if (impedance) {
      impedance[0] *= this.Z0;
      impedance[1] *= this.Z0;
    }
    return impedance;
  }
  public calcAdmittance(rc: Point): Point|undefined {
    const admittance = this.calcs.reflectionCoefficientToAdmittance(rc);
    if (admittance) {
      admittance[0] *= 1 / this.Z0 * 1000.0; // mS
      admittance[1] *= 1 / this.Z0 * 1000.0; // mS
    }
    return admittance;
  }
  private getQ(rc: Point): number|undefined {
    const impedance = this.calcs.reflectionCoefficientToImpedance(rc);
    if (!impedance) { return; }
    return Math.abs(impedance[1] / impedance[0]);
  }
  private getSwr(rc: Point): number {
    return this.calcs.reflectionCoefficientToSwr(rc);
  }
  private getReturnLoss(rc: Point): number {
    return this.calcs.reflectionCoefficientToReturnLoss(rc);
  }
  private getMismatchLoss(rc: Point): number {
    return this.calcs.reflectionCoefficientToMismatchLoss(rc);
  }
}
