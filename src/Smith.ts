import * as d3 from 'd3';
import { ZoomTransform } from 'd3';

import { Point } from './shapes/Point';

import { SmithSvg } from './draw/SmithSvg';
import { SmithGroup } from './draw/SmithGroup';
import { SmithCircle } from './draw/SmithCircle';

import { SmithData } from './draw/SmithData';
import { SmithCursor } from './draw/SmithCursor';

import { ConstResistance } from './draw/ConstResistance';
import { ConstReactance } from './draw/ConstReactance';
import { ConstConductance } from './draw/ConstConductance';
import { ConstSusceptance } from './draw/ConstSusceptance';
import { ConstQCircles } from './draw/ConstQCircles';
import { ConstSwrCircles } from './draw/ConstSwrCircles';

import { SmithDrawOptions } from './draw/SmithDrawOptions';
import { SmithScaler } from './draw/SmithScaler';

import { S1P } from './SnP';
import { SmithConstantCircle } from './SmithConstantCircle';
import { SmithArcsDefs } from './SmithArcsDefs';

import { RadiallyScaledParams } from './radially_scaled_params/RadiallyScaledParams';
import { Complex } from './complex/Complex';

export interface SmithCursorEvent {
  reflectionCoefficient: Complex;
  impedance: Complex|undefined;
  admittance: Complex|undefined;
  swr: number;
  returnLoss: number;
  mismatchLoss: number; // reflection loss
  Q: number|undefined;
  dBS: number;
  rflCoeffP: number;
  rflCoeffEOrI: number;
  transmCoeffP: number;
}

export interface SmithMarkerEvent {
  datasetNo: number;
  markerNo: number;
  reflectionCoefficient: Complex;
  impedance: Complex|undefined;
  admittance: Complex|undefined;
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

  private transform = d3.zoomIdentity;

  private svg: SmithSvg;
  private container: SmithGroup;
  private dataContainer: SmithGroup;

  private reactanceAxis: SmithCircle;

  private constResistance: ConstResistance;
  private constReactance: ConstReactance;
  private constConductance: ConstConductance;
  private constSusceptance: ConstSusceptance;
  private constSwrCircles: ConstSwrCircles;
  private constQCircles: ConstQCircles;

  private radiallyScaledParams: RadiallyScaledParams;

  private cursor: SmithCursor;
  private data: SmithData[] = [];

  private userActionHandler: ((event: SmithEvent) => void)|null = null;

  constructor(private Z0: number = 50) {
    const viewBoxSize = 500;
    this.scalers = this.createScalers(viewBoxSize);

    this.svg = new SmithSvg(viewBoxSize);
    this.container = new SmithGroup();

    this.constResistance = new ConstResistance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constResistance.show();

    this.constReactance = new ConstReactance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constReactance.hide();

    this.constConductance = new ConstConductance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constConductance.hide();

    this.constSusceptance = new ConstSusceptance({
      data: SmithArcsDefs.getData(),
      scaler: this.scalers.default,
      showMinor: true,
    });
    this.constSusceptance.hide();

    this.constQCircles = new ConstQCircles(this.scalers.default);
    this.constQCircles.hide();

    this.constSwrCircles = new ConstSwrCircles(this.scalers.default);
    this.constSwrCircles.hide();

    this.cursor = this.initCursor();
    const cursorContainer = this.cursorContainer();

    this.reactanceAxis = this.drawReactanceAxis({
      stroke: 'blue', strokeWidth: '1', fill: 'none'
    });

    this.dataContainer = new SmithGroup();

    this.radiallyScaledParams = new RadiallyScaledParams(this.scalers.default);
    const rspContainer = this.radiallyScaledParams.draw();

    // build chart
    this.svg.append(this.container);
    this.container.append(this.constConductance.draw());
    this.container.append(this.constSusceptance.draw());
    this.container.append(this.constResistance.draw());
    this.container.append(this.constReactance.draw());
    this.container.append(this.constQCircles.draw());
    this.container.append(this.constSwrCircles.draw());
    this.container.append(this.cursor.Group);
    this.container.append(this.reactanceAxis);
    this.container.append(cursorContainer);
    this.container.append(this.dataContainer);
    this.container.append(rspContainer);
    this.dataContainer.Element.raise();

    this.initializeZoom();
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


  private cursorMove(p: Point): void {
    this.cursor.Position = Complex.fromArray(
      this.scalers.default.pointInvert(p)
    );
  }

  private initCursor(): SmithCursor {
    const cursor = new SmithCursor(this.scalers.default);
    cursor.setMoveHandler(() => {
      if (this.userActionHandler) {
        this.userActionHandler({
          type: SmithEventType.Cursor, data: this.CursorData,
        });
      }
    });
    return cursor;
  }

  public get CursorData(): SmithCursorEvent {
    const rc = this.cursor.Position;
    return {
      reflectionCoefficient: rc,
      impedance:    this.calcImpedance(rc),
      admittance:   this.calcAdmittance(rc),
      swr:          this.calcs.rflCoeffToSwr(rc),
      returnLoss:   this.calcs.rflCoeffToReturnLoss(rc),
      mismatchLoss: this.calcs.rflCoeffToMismatchLoss(rc),
      Q:            this.calcs.rflCoeffToQ(rc),
      dBS:          this.calcs.rflCoeffToDBS(rc),
      rflCoeffP:    this.calcs.rflCoeffP(rc),
      rflCoeffEOrI: this.calcs.rflCoeffEOrI(rc),
      transmCoeffP: this.calcs.rflCoeffToTransmCoeffP(rc),
    };
  }

  private initializeZoom(): void {
    const zoom = d3.zoom<SVGElement, {}>()
      .scaleExtent([ 0.6, 1000 ])
      .on('zoom', () => this.onZoom(d3.event.transform));

    const halfsize = 500 / 2;
    const initScale = 0.8;
    const xTranslate = (1 - initScale) * halfsize;
    const yTranslate = (1 - initScale - 0.15) * halfsize;

    this.svg.Element.call(zoom);

    const transform = d3.zoomIdentity
      .translate(xTranslate, yTranslate)
      .scale(initScale);
    this.svg.Element.transition().call(zoom.transform, transform);
  }

  private onZoom(transform: ZoomTransform): void {
    this.transform = transform;
    this.container.Element.attr('transform', transform.toString());
    this.data.forEach((d) => d.zoom(transform));
  }

  private cursorContainer(): SmithCircle {
    const that = this;
    const shape = this.drawReactanceAxis({ fill: 'transparent', stroke: 'none' });

    shape.Element.style('pointer-events', 'all')
      .on('mousemove', function() {
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

  public getReactanceComponentValue(p: Complex, f: number): string {
    const z = this.calcs.rflCoeffToImpedance(p);
    if (!z) {
      return 'Undefined';
    }

    const x = z.imag * this.Z0;

    if (x < 0) {
      const cap = 1 / (2 * Math.PI * f * -x);
      return this.formatNumber(cap) + 'F';
    }

    const ind = x / (2 * Math.PI * f);
    return this.formatNumber(ind) + 'H';
  }

  public formatComplex(c: Complex, unit: string = '', dp: number = 3): string {
    if (unit !== '') { unit = `[${unit}]`; }
    return `${c.toString(dp)} ${unit}`;
  }

  public formatComplexPolar(c: Complex, unit: string = '', dp: number = 3): string {
    const m = c.abs();
    const a = this.calcs.rad2deg(c.arg());
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

  public addS1P(values: S1P): void {
    if (values.length === 0) { return; }
    const data = this.createSmithData(values, this.data.length);
    this.data.push(data);
  }

  private createSmithData(values: S1P, dataset: number): SmithData {
    const color = d3.schemeCategory10[1 + dataset];
    const data = new SmithData(values, color,
      this.transform, this.dataContainer, this.scalers.default
    );
    data.setMarkerMoveHandler((marker) => {
      if (this.userActionHandler) {
        this.userActionHandler({
          type: SmithEventType.Marker, data: this.getMarkerData(dataset, marker)
        });
      }
    });
    data.addMarker();
    return data;
  }

  public getMarkerData(datasetNo: number, markerNo: number): SmithMarkerEvent|undefined {
    if (!this.data[datasetNo]) { return; }

    const m = this.data[datasetNo].getMarker(markerNo);
    if (!m) { return; }

    const rc = Complex.from(...m.selectedPoint.point);
    const freq = m.selectedPoint.freq;

    return {
      datasetNo, markerNo, freq,
      reflectionCoefficient:  rc,
      impedance:              this.calcImpedance(rc),
      admittance:             this.calcAdmittance(rc),
      swr:                    this.calcs.rflCoeffToSwr(rc),
      returnLoss:             this.calcs.rflCoeffToReturnLoss(rc),
      mismatchLoss:           this.calcs.rflCoeffToMismatchLoss(rc),
      Q:                      this.calcs.rflCoeffToQ(rc),
    };
  }

  public get Datasets(): SmithData[] {
    return this.data;
  }

  public get ConstResistance(): ConstResistance {
    return this.constResistance;
  }

  public get ConstReactance(): ConstReactance {
    return this.constReactance;
  }

  public get ConstConductance(): ConstConductance {
    return this.constConductance;
  }

  public get ConstSusceptance(): ConstSusceptance {
    return this.constSusceptance;
  }

  public get ConstQCircles(): ConstQCircles {
    return this.constQCircles;
  }

  public get ConstSwrCircles(): ConstSwrCircles {
    return this.constSwrCircles;
  }

  public setUserActionHandler(handler: (event: SmithEvent) => void): void {
    this.userActionHandler = handler;
  }

  public calcImpedance(rc: Complex): Complex|undefined {
    const impedance = this.calcs.rflCoeffToImpedance(rc);
    if (impedance) {
      return impedance.mul(this.Z0);
    }
    return impedance;
  }
  public calcAdmittance(rc: Complex): Complex|undefined {
    const admittance = this.calcs.rflCoeffToAdmittance(rc);
    if (admittance) {
      return admittance.mul(1 / this.Z0 * 1000.0); // mS
    }
    return admittance;
  }
}
