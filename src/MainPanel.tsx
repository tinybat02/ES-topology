import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions, Buffer } from 'types';
import { Map, View } from 'ol';
import XYZ from 'ol/source/XYZ';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { defaults, DragPan, MouseWheelZoom } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import { fromLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import { processDataES, createPoint, createLine } from './utils/helpers';
import PathFinder from 'geojson-path-finder';
import { point, featureCollection, Point, Feature } from '@turf/helpers';
import nearestPoint, { NearestPoint } from '@turf/nearest-point';
import { nanoid } from 'nanoid';
import 'ol/ol.css';

interface Props extends PanelProps<PanelOptions> {}
interface State {
  options: string[];
  current: string;
}

export class MainPanel extends PureComponent<Props, State> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  perDeviceRoute: { [key: string]: [number, number][] };
  route: TileLayer;
  totalRoute: VectorLayer;

  state: State = {
    options: [],
    current: 'None',
  };

  componentDidMount() {
    const { center_lat, center_lon, zoom_level, tile_url } = this.props.options;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function(event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    if (this.props.data.series.length > 0) {
      const { buffer } = this.props.data.series[0].fields[0].values as Buffer;
      const { perDeviceRoute } = processDataES(buffer);
      this.perDeviceRoute = perDeviceRoute;
      this.setState({
        options: Object.keys(this.perDeviceRoute),
      });
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevProps.data.series !== this.props.data.series) {
      this.map.removeLayer(this.totalRoute);
      this.setState({ options: [], current: 'None' });

      if (this.props.data.series.length == 0) {
        return;
      }

      const { buffer } = this.props.data.series[0].fields[0].values as Buffer;
      if (buffer.length > 0) {
        const { perDeviceRoute } = processDataES(buffer);
        this.perDeviceRoute = perDeviceRoute;
        this.setState({
          options: Object.keys(this.perDeviceRoute),
        });
      }
    }

    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      if (this.randomTile) {
        this.map.removeLayer(this.randomTile);
      }
      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
      this.map.getView().setZoom(this.props.options.zoom_level);
    }

    if (
      prevProps.options.center_lat !== this.props.options.center_lat ||
      prevProps.options.center_lon !== this.props.options.center_lon
    ) {
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
    }

    if (prevState.current !== this.state.current) {
      this.totalRoute && this.map.removeLayer(this.totalRoute);
      if (this.state.current !== 'None') {
        const routeData = this.perDeviceRoute[this.state.current];
        if (routeData.length > 0 && this.props.options.topology) {
          const closestData: NearestPoint[] = [];
          const nodes = this.props.options.topology.features.filter(element => element.geometry.type == 'Point');
          const topologyNodes = featureCollection<Point>(nodes as Feature<Point>[]);

          const nondupRouteData = routeData.filter((item, pos, arr) => {
            return pos == 0 || item[0] !== arr[pos - 1][0] || item[1] !== arr[pos - 1][1];
          });

          nondupRouteData.map(coord => {
            closestData.push(nearestPoint(point(coord), topologyNodes));
          });

          const pathFinder = new PathFinder(this.props.options.topology);

          if (closestData.length > 1) {
            const pathFinding: [number, number][] = [];
            const first_path = pathFinder.findPath(closestData[0], closestData[1]);

            pathFinding.push(...(first_path || { path: [] }).path);

            for (let i = 0; i < closestData.length - 1; i++) {
              const pathResult =
                pathFinder.findPath(closestData[i], closestData[i + 1]) ||
                {
                  path: [],
                }.path;

              if (pathResult.length == 1) {
                pathFinding.push(pathResult[0]);
              } else if (pathResult.length > 1) {
                pathFinding.push(...pathResult.slice(1));
              }
            }

            const nondupPathFinding = pathFinding.filter((item, pos, arr) => {
              return pos == 0 || item[0] !== arr[pos - 1][0] || item[1] !== arr[pos - 1][1];
            });

            if (nondupPathFinding.length > 1) {
              this.totalRoute = createLine(nondupPathFinding);
              this.map.addLayer(this.totalRoute);
            } else if (nondupPathFinding.length == 1) {
              this.totalRoute = createPoint(nondupPathFinding[0]);
              this.map.addLayer(this.totalRoute);
            }
          } else if (closestData.length == 1) {
            this.totalRoute = createPoint(closestData[0].geometry.coordinates as Coordinate);
            this.map.addLayer(this.totalRoute);
          }
        }
      }
    }
  }

  handleSelector = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ ...this.state, current: e.target.value });
  };

  render() {
    const { width, height } = this.props;
    const { options, current } = this.state;

    return (
      <div
        style={{
          width,
          height,
        }}
      >
        <select id="selector" style={{ width: 350, marginBottom: 5 }} onChange={this.handleSelector} value={current}>
          <option value="None">None</option>
          {options.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div
          id={this.id}
          style={{
            width,
            height: height - 40,
          }}
        ></div>
      </div>
    );
  }
}
