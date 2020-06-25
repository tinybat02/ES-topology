import { Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Coordinate } from 'ol/coordinate';
import { Circle, Style, Fill, Stroke, Icon } from 'ol/style';
import Arrow from '../img/arrow.png';

interface SingleElement {
  latitude: number;
  longitude: number;
  [key: string]: any;
}

export const processDataES = (data: SingleElement[]) => {
  data.reverse();
  const perDeviceRoute: { [key: string]: [number, number][] } = {};
  data.map(item => {
    (perDeviceRoute[item.hash_id] = perDeviceRoute[item.hash_id] || []).push([item.longitude, item.latitude]);
  });
  return { perDeviceRoute };
};

export const createPoint = (oneData: Coordinate) => {
  const pointFeature = new Feature(new Point(oneData).transform('EPSG:4326', 'EPSG:3857'));
  pointFeature.setStyle(
    new Style({
      image: new Circle({
        radius: 5,
        fill: new Fill({ color: 'rgba(73,168,222,0.6)' }),
      }),
    })
  );
  return new VectorLayer({
    source: new VectorSource({
      features: [pointFeature],
    }),
  });
};

export const createLine = (routeData: Coordinate[]) => {
  const lineFeature = new Feature(new LineString(routeData).transform('EPSG:4326', 'EPSG:3857'));
  return new VectorLayer({
    source: new VectorSource({
      features: [lineFeature],
    }),
    style: feature => {
      const geometry = feature.getGeometry() as LineString;
      const styles = [
        new Style({
          stroke: new Stroke({
            color: '#49A8DE',
            width: 2,
          }),
        }),
      ];

      const last2Points = geometry.getCoordinates().slice(-2);
      const start = last2Points[0];
      const end = last2Points[1];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const rotation = Math.atan2(dy, dx);
      styles.push(
        new Style({
          geometry: new Point(end),
          image: new Icon({
            src: Arrow,
            anchor: [0.75, 0.5],
            rotateWithView: true,
            rotation: -rotation,
          }),
        })
      );

      return styles;
    },
    zIndex: 2,
  });
};
