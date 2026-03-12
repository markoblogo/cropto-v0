export type AgroRegionCrop = "wheat" | "corn" | "soybeans" | "spring_wheat" | "corn_second_crop";

export type AgroRegionConfig = {
  region_id: string;
  name: string;
  countries: string[];
  crops: AgroRegionCrop[];
  centroid: [number, number];
  notes?: string;
  baseline: {
    rainfall_anomaly_30d: number;
    temp_anomaly_30d_c: number;
    soil_moisture_percentile: number;
    ndvi_anomaly: number;
    yield_deviation: number;
  };
};

export const AGRO_REGIONS: AgroRegionConfig[] = [
  {
    region_id: "us_corn_belt",
    name: "US Corn Belt",
    countries: ["US"],
    crops: ["corn", "soybeans"],
    centroid: [-93.5, 41.5],
    notes: "Iowa/Illinois/Indiana core row-crop region.",
    baseline: {
      rainfall_anomaly_30d: -0.12,
      temp_anomaly_30d_c: 1.6,
      soil_moisture_percentile: 36,
      ndvi_anomaly: -0.03,
      yield_deviation: -0.02,
    },
  },
  {
    region_id: "us_northern_plains",
    name: "US Northern Plains",
    countries: ["US"],
    crops: ["spring_wheat"],
    centroid: [-101.0, 47.0],
    baseline: {
      rainfall_anomaly_30d: -0.18,
      temp_anomaly_30d_c: 1.9,
      soil_moisture_percentile: 31,
      ndvi_anomaly: -0.05,
      yield_deviation: -0.03,
    },
  },
  {
    region_id: "brazil_center_west",
    name: "Brazil Center-West",
    countries: ["BR"],
    crops: ["soybeans", "corn_second_crop"],
    centroid: [-55.0, -13.0],
    baseline: {
      rainfall_anomaly_30d: -0.15,
      temp_anomaly_30d_c: 2.0,
      soil_moisture_percentile: 29,
      ndvi_anomaly: -0.06,
      yield_deviation: -0.04,
    },
  },
  {
    region_id: "argentina_pampas",
    name: "Argentina Pampas",
    countries: ["AR"],
    crops: ["soybeans", "corn"],
    centroid: [-62.5, -35.0],
    baseline: {
      rainfall_anomaly_30d: -0.22,
      temp_anomaly_30d_c: 2.3,
      soil_moisture_percentile: 24,
      ndvi_anomaly: -0.07,
      yield_deviation: -0.05,
    },
  },
  {
    region_id: "ukraine_central_grain",
    name: "Ukraine Central Grain Belt",
    countries: ["UA"],
    crops: ["wheat", "corn"],
    centroid: [31.0, 49.0],
    baseline: {
      rainfall_anomaly_30d: -0.25,
      temp_anomaly_30d_c: 2.3,
      soil_moisture_percentile: 22,
      ndvi_anomaly: -0.09,
      yield_deviation: -0.05,
    },
  },
  {
    region_id: "black_sea_north_wheat",
    name: "Northern Black Sea Wheat",
    countries: ["UA", "RO"],
    crops: ["wheat"],
    centroid: [35.0, 47.0],
    baseline: {
      rainfall_anomaly_30d: -0.2,
      temp_anomaly_30d_c: 2.1,
      soil_moisture_percentile: 27,
      ndvi_anomaly: -0.06,
      yield_deviation: -0.04,
    },
  },
  {
    region_id: "eu_soft_wheat_belt",
    name: "EU Soft Wheat Belt",
    countries: ["FR", "DE", "RO"],
    crops: ["wheat"],
    centroid: [10.0, 49.0],
    baseline: {
      rainfall_anomaly_30d: -0.11,
      temp_anomaly_30d_c: 1.4,
      soil_moisture_percentile: 43,
      ndvi_anomaly: -0.02,
      yield_deviation: -0.01,
    },
  },
];

